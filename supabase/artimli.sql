-- EroMec artımlı eşitleme ve anlık güncelleme (paylasim.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
--   * Her satır ne zaman değiştiğini _changed_at sütununda tutar; silinen satırlar sync_deletes'e yazılır.
--   * pull_since(zaman): yalnızca o zamandan sonra değişen/silinen satırları döndürür (her açılışta her şey inmez).
--   * Tablolar supabase_realtime yayınına eklenir: başka cihazdaki değişiklik anında haber verilir.

-- Değişme zamanı: her ekleme/güncellemede sunucu saatiyle yazılır.
create or replace function public.touch_changed_at() returns trigger
language plpgsql as $$
begin
  new._changed_at := clock_timestamp();
  return new;
end $$;

-- Silinen satırların izi (yalnızca tablo adı ve anahtar; içerik tutulmaz)
create table if not exists public.sync_deletes (
  id         bigint generated always as identity primary key,
  tbl        text        not null,
  pk         text        not null,
  deleted_at timestamptz not null default clock_timestamp()
);
create index if not exists ix_sync_deletes_at on public.sync_deletes (deleted_at);
alter table public.sync_deletes enable row level security;
drop policy if exists sync_deletes_read on public.sync_deletes;
create policy sync_deletes_read on public.sync_deletes for select to authenticated using (true);

create or replace function public.log_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sync_deletes (tbl, pk) values (tg_table_name, (to_jsonb(old) ->> tg_argv[0]));
  return old;
end $$;

do $$
declare t record;
begin
  for t in select * from public.sync_tables() loop
    execute format('alter table public.%I add column if not exists _changed_at timestamptz not null default clock_timestamp()', t.tbl);
    execute format('create index if not exists ix_%s_changed on public.%I (_changed_at)', t.tbl, t.tbl);
    execute format('drop trigger if exists touch_changed_at on public.%I', t.tbl);
    execute format('create trigger touch_changed_at before insert or update on public.%I for each row execute function public.touch_changed_at()', t.tbl);
    execute format('drop trigger if exists log_delete on public.%I', t.tbl);
    execute format('create trigger log_delete after delete on public.%I for each row execute function public.log_delete(%L)', t.tbl, t.pk);
  end loop;
end $$;

-- Eski silme izleri 90 gün sonra temizlenir (o kadar süre açılmayan cihaz baştan indirir).
create or replace function public.prune_sync_deletes() returns void
language sql security definer set search_path = public as $$
  delete from public.sync_deletes where deleted_at < now() - interval '90 days';
$$;

-- since'ten sonra değişen satırlar + silinenler. Yetki (RLS) aynen geçerlidir.
-- Kayıtların görünürlüğü değişirse (şantiye paylaşıldı/çıkarıldı) istemci siteIds'e bakıp baştan indirir.
create or replace function public.pull_since(since timestamptz) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare t record; rows jsonb; data jsonb := '{}'; me jsonb; dels jsonb; started timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  if since is null or since < now() - interval '80 days' then
    raise exception 'Çok eski; baştan indirilmeli' using errcode = '22023';
  end if;
  for t in select * from public.sync_tables() order by ord loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''_changed_at''), ''[]''::jsonb) from public.%I x where x._changed_at > $1', t.tbl)
      into rows using since;
    if jsonb_array_length(rows) > 0 then data := data || jsonb_build_object(t.tbl, rows); end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('t', d.tbl, 'pk', d.pk) order by d.id), '[]'::jsonb)
    into dels from public.sync_deletes d where d.deleted_at > since;
  select jsonb_build_object('id', p.id, 'email', p.email, 'fullName', p.full_name, 'role', p.role,
           'siteIds', coalesce((select jsonb_agg(m.site_id order by m.site_id) from public.site_members m where m.user_id = p.id), '[]'::jsonb))
    into me from public.profiles p where p.id = auth.uid();
  return jsonb_build_object('data', data, 'deletes', dels, 'me', me, 'serverTime', started);
end $$;

-- Tam indirme de aynı saat bilgisini versin ve _changed_at sütununu göndermesin.
create or replace function public.pull_all() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare t record; rows jsonb; data jsonb := '{}'; me jsonb; started timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  for t in select * from public.sync_tables() order by ord loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''_changed_at''), ''[]''::jsonb) from public.%I x', t.tbl) into rows;
    data := data || jsonb_build_object(t.tbl, rows);
  end loop;
  select jsonb_build_object('id', p.id, 'email', p.email, 'fullName', p.full_name, 'role', p.role,
           'siteIds', coalesce((select jsonb_agg(m.site_id order by m.site_id) from public.site_members m where m.user_id = p.id), '[]'::jsonb))
    into me from public.profiles p where p.id = auth.uid();
  return jsonb_build_object('data', data, 'me', me, 'ids', public.reserve_ids(), 'serverTime', started);
end $$;

revoke all on function public.pull_since(timestamptz), public.prune_sync_deletes() from public, anon;
grant execute on function public.pull_since(timestamptz), public.pull_all() to authenticated;

-- Anlık güncelleme: eşitlenen tablolar ve şantiye üyelikleri realtime yayınına eklenir (RLS realtime'da da geçerlidir).
do $$
declare t record;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for t in select tbl from public.sync_tables() union all select 'site_members' loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.tbl) then
        execute format('alter publication supabase_realtime add table public.%I', t.tbl);
      end if;
    end loop;
  end if;
end $$;
