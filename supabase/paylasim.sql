-- EroMec şantiye paylaşma (uyelik.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
-- Şantiyeyi açan kişi (sahip), kayıtlı başka bir üyeyi e-postasıyla şantiyeye ekleyebilir.
-- Eklenen üye o şantiyeyi ve şantiyeye bağlı bütün kayıtları (çalışan, puantaj, mesai, gider, bordro) görür ve yönetir.
-- Sahip üyeyi istediği zaman çıkarabilir; üye de kendini şantiyeden çıkarabilir. Sahip çıkarılamaz.

-- Şantiyenin sahibi mi (ya da elle atanmış admin)
create or replace function public.is_site_owner(sid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.sites where id = sid and owner_id = auth.uid());
$$;

-- Şantiyenin üyeleri: yalnızca şantiyeyi görebilen kişi listeyi alır.
create or replace function public.site_members_list(sid bigint) returns table (user_id uuid, email text, full_name text, is_owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  if not (public.can_access_site(sid) or public.is_site_owner(sid)) then
    raise exception 'Bu şantiyeyi görme yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.full_name, (s.owner_id = p.id)
    from public.site_members m
    join public.profiles p on p.id = m.user_id
    join public.sites s on s.id = m.site_id
    where m.site_id = sid
    order by (s.owner_id = p.id) desc, p.full_name, p.email;
end $$;

-- Üyeyi e-postasıyla şantiyeye ekler (yalnızca sahip). Eklenen üyenin bilgisini döndürür.
create or replace function public.site_share(sid bigint, member_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  if not exists (select 1 from public.sites where id = sid) then
    raise exception 'Şantiye bulunamadı.' using errcode = 'P0002';
  end if;
  if not public.is_site_owner(sid) then
    raise exception 'Bu şantiyeyi yalnızca açan kişi paylaşabilir.' using errcode = '42501';
  end if;
  select * into p from public.profiles where lower(email) = lower(trim(member_email));
  if p.id is null then
    raise exception 'Bu e-postayla kayıtlı bir üye yok. Kişi önce uygulamadan kayıt olmalı.' using errcode = 'P0002';
  end if;
  insert into public.site_members (user_id, site_id) values (p.id, sid) on conflict do nothing;
  return jsonb_build_object('userId', p.id, 'email', p.email, 'fullName', p.full_name);
end $$;

-- Üyeyi şantiyeden çıkarır: sahip herkesi çıkarabilir (kendisi hariç), üye yalnızca kendini.
create or replace function public.site_unshare(sid bigint, member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if auth.uid() is null then raise exception 'Giriş gerekli' using errcode = '42501'; end if;
  select owner_id into owner from public.sites where id = sid;
  if member_id = owner then
    raise exception 'Şantiyeyi açan kişi şantiyeden çıkarılamaz.' using errcode = '42501';
  end if;
  if not (member_id = auth.uid() or public.is_site_owner(sid)) then
    raise exception 'Bu şantiyeden üye çıkarma yetkiniz yok.' using errcode = '42501';
  end if;
  delete from public.site_members where site_id = sid and user_id = member_id;
end $$;

revoke all on function public.is_site_owner(bigint), public.site_members_list(bigint), public.site_share(bigint, text), public.site_unshare(bigint, uuid) from public, anon;
grant execute on function public.is_site_owner(bigint), public.site_members_list(bigint), public.site_share(bigint, text), public.site_unshare(bigint, uuid) to authenticated;
