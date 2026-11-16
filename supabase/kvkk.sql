-- Puanto KVKK ve güvenlik düzeltmeleri (isletme.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
--   * Kan grubu (özel nitelikli veri) artık tutulmaz: mevcut değerler silinir, yenisi kaydedilemez.
--   * Kayıtta verilen açık rıza (tarih + aydınlatma metni sürümü) üyenin profilinde saklanır.
--   * Firma kodu tahminine karşı: bir hesap saatte en fazla 10 yanlış kod deneyebilir.

-- ───────────── Kan grubu ─────────────
update public.employees set blood_type = '' where blood_type <> '';
alter table public.employees drop constraint if exists employees_no_blood_type;
alter table public.employees add constraint employees_no_blood_type check (blood_type = '');

-- ───────────── Açık rıza kaydı ─────────────
alter table public.profiles add column if not exists kvkk_consent_at timestamptz;
alter table public.profiles add column if not exists kvkk_version text;

-- Yeni kayıt: rıza bilgisi kayıt formundan (user_metadata) alınır; davet varsa işletmeye katılır.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws bigint; consent timestamptz;
begin
  select workspace_id into ws from public.workspace_invites where lower(email) = lower(coalesce(new.email, '')) order by created_at limit 1;
  begin
    consent := nullif(new.raw_user_meta_data->>'kvkk_consent_at', '')::timestamptz;
  exception when others then
    consent := null;
  end;
  insert into public.profiles (id, email, full_name, workspace_id, workspace_role, kvkk_consent_at, kvkk_version)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''), ws, 'member',
          case when consent is not null then now() end, new.raw_user_meta_data->>'kvkk_version');
  if ws is not null then delete from public.workspace_invites where lower(email) = lower(coalesce(new.email, '')); end if;
  return new;
end $$;

-- ───────────── Firma kodu deneme sınırı ─────────────
create table if not exists public.workspace_join_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists ix_join_attempts on public.workspace_join_attempts (user_id, at);
alter table public.workspace_join_attempts enable row level security;

-- Yanlış kod hata fırlatmak yerine {"error": ...} döndürür: böylece başarısız deneme kaydı geri alınmaz.
create or replace function public.workspace_join(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ws public.workspaces; tries int;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  if public.my_workspace() is not null then raise exception 'Zaten bir işletmedesiniz.' using errcode = '42501'; end if;
  delete from public.workspace_join_attempts where at < now() - interval '1 day';
  select count(*) into tries from public.workspace_join_attempts where user_id = auth.uid() and at > now() - interval '1 hour';
  if tries >= 10 then
    return jsonb_build_object('error', 'Çok fazla yanlış kod denendi. 1 saat sonra tekrar deneyin ya da işletme sahibinden kodu kontrol edin.');
  end if;
  select * into ws from public.workspaces where join_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  if ws.id is null then
    insert into public.workspace_join_attempts (user_id) values (auth.uid());
    return jsonb_build_object('error', 'Bu firma kodu bulunamadı. Kodu işletme sahibinden kontrol edin.');
  end if;
  update public.profiles set workspace_id = ws.id, workspace_role = 'member' where id = auth.uid();
  delete from public.workspace_invites where lower(email) = lower((select email from public.profiles where id = auth.uid()));
  delete from public.workspace_join_attempts where user_id = auth.uid();
  return jsonb_build_object('id', ws.id, 'name', ws.name);
end $$;

revoke all on function public.workspace_join(text) from public, anon;
grant execute on function public.workspace_join(text) to authenticated;
