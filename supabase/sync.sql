-- Puanto eşitleme katmanı (schema.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
-- Uygulama hesaplarını cihazda yapar; açılışta bütün veriyi pull_all() ile alır,
-- her kayıt işleminden sonra değişen satırları apply_changes() ile tek işlemde (transaction) gönderir.
-- İki işlev de "security invoker"dır: satır bazlı yetkiler (RLS) aynen geçerlidir.

-- Yabancı anahtarlar işlem sonunda denetlenebilsin (silme ve ekleme aynı pakette hangi sırayla gelirse gelsin).
do $$
declare c record;
begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
           where contype = 'f' and connamespace = 'public'::regnamespace and not condeferrable loop
    execute format('alter table %s alter constraint %I deferrable initially immediate', c.tbl, c.conname);
  end loop;
end $$;

-- Bordro satırının şantiyesi çalışandan gelir (yetki denetimi buna göre yapılır).
create or replace function public.payroll_fill_site() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.site_id is null then
    select site_id into new.site_id from public.employees where id = new.employee_id;
  end if;
  return new;
end $$;
drop trigger if exists payroll_fill_site on public.payrolls;
create trigger payroll_fill_site before insert or update on public.payrolls
  for each row execute function public.payroll_fill_site();

-- Eşitlenen tablolar ve birincil anahtarları (üstten alta: önce bağımlı olunanlar).
create or replace function public.sync_tables() returns table (ord int, tbl text, pk text)
language sql immutable as $$
  values (1, 'companies', 'id'), (2, 'sites', 'id'), (3, 'settings', 'key'), (4, 'expense_categories', 'id'),
         (5, 'attendance_statuses', 'code'), (6, 'employees', 'id'), (7, 'overtime_records', 'id'), (8, 'expenses', 'id'),
         (9, 'attendance', 'id'), (10, 'payrolls', 'id'), (11, 'daily_reports', 'id'), (12, 'activity_log', 'id');
$$;

-- Her cihaz oturumu, yeni kayıtlarına vereceği numaralar için kendine ait bir aralık alır;
-- böylece aynı anda çalışan iki cihaz aynı numarayı üretemez.
create or replace function public.reserve_ids(block bigint default 1000000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; seq text; start bigint; res jsonb := '{}';
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  for t in select s.tbl from public.sync_tables() s where s.pk = 'id' loop
    seq := pg_get_serial_sequence('public.' || t.tbl, 'id');
    start := nextval(seq);
    perform setval(seq, start + block - 1);
    res := res || jsonb_build_object(t.tbl, start);
  end loop;
  return res;
end $$;

-- Görme yetkisi olan bütün satırlar + kullanıcının rolü + yeni numara aralıkları, tek istekte.
create or replace function public.pull_all() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare t record; rows jsonb; data jsonb := '{}'; me jsonb;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  for t in select * from public.sync_tables() order by ord loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.tbl) into rows;
    data := data || jsonb_build_object(t.tbl, rows);
  end loop;
  select jsonb_build_object('id', p.id, 'email', p.email, 'fullName', p.full_name, 'role', p.role,
           'siteIds', coalesce((select jsonb_agg(m.site_id) from public.site_members m where m.user_id = p.id), '[]'::jsonb))
    into me from public.profiles p where p.id = auth.uid();
  return jsonb_build_object('data', data, 'me', me, 'ids', public.reserve_ids(), 'serverTime', now());
end $$;

-- Değişiklik paketi: { "deletes": [{"t": tablo, "pk": anahtar}], "upserts": [{"t": tablo, "row": {...}}] }
-- Hepsi tek işlemde uygulanır; biri reddedilirse (yetki, çakışma) hiçbiri kaydedilmez.
create or replace function public.apply_changes(changes jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare c jsonb; t record; cols text; sets text; n_del int := 0; n_up int := 0;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  set constraints all deferred;

  -- Ekleme / güncelleme: önce bağımlı olunan tablolar
  for t in select * from public.sync_tables() order by ord loop
    for c in select value from jsonb_array_elements(coalesce(changes->'upserts', '[]'::jsonb)) where value->>'t' = t.tbl loop
      select string_agg(format('%I', k), ', '), string_agg(format('%I = excluded.%I', k, k), ', ') filter (where k <> t.pk)
        into cols, sets
        from jsonb_object_keys(c->'row') k
        where exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = t.tbl and ic.column_name = k);
      if cols is null then continue; end if;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (%I) do %s',
                     t.tbl, cols, cols, t.tbl, t.pk, case when sets is null then 'nothing' else 'update set ' || sets end)
        using c->'row';
      n_up := n_up + 1;
    end loop;
  end loop;

  -- Silmeler en sonda ve önce bağımlı tablolardan: "ON DELETE RESTRICT" ertelenemediği için, silinen kayda bağlı
  -- satırlar (ör. silinen kategorinin giderleri) yukarıda başka kayda taşınmış olmalıdır.
  for t in select * from public.sync_tables() order by ord desc loop
    for c in select value from jsonb_array_elements(coalesce(changes->'deletes', '[]'::jsonb)) where value->>'t' = t.tbl loop
      execute format('delete from public.%I where %I::text = $1', t.tbl, t.pk) using c->>'pk';
      n_del := n_del + 1;
    end loop;
  end loop;

  if (select count(*) from jsonb_array_elements(coalesce(changes->'deletes', '[]'::jsonb) || coalesce(changes->'upserts', '[]'::jsonb)) e
      where not exists (select 1 from public.sync_tables() s where s.tbl = e->>'t')) > 0 then
    raise exception 'Bilinmeyen tablo' using errcode = '22023';
  end if;
  return jsonb_build_object('deleted', n_del, 'upserted', n_up);
end $$;

-- Yeni çalışan numarası: yetkiden bağımsız olarak bütün çalışanlar içindeki en büyük numaranın bir fazlası.
create or replace function public.next_employee_no() returns text
language sql security definer set search_path = public as $$
  select 'P' || lpad((coalesce(max(substring(employee_no from '^P([0-9]+)$')::bigint), 0) + 1)::text, 4, '0')
  from public.employees where auth.uid() is not null;
$$;

revoke all on function public.reserve_ids(bigint), public.pull_all(), public.apply_changes(jsonb), public.next_employee_no() from public, anon;
grant execute on function public.reserve_ids(bigint), public.pull_all(), public.apply_changes(jsonb), public.next_employee_no() to authenticated;
