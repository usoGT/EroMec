-- Puanto üyelik modeli (schema.sql ve sync.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
-- Ayrı bir yönetici yoktur: giriş yapan her üye kendi açtığı şantiyeleri ve kendi yazdığı kayıtları görür.
--   * Şantiyeyi açan kişi o şantiyenin üyesi olur; şantiyeye bağlı her kayıt şantiye üyelerine açıktır.
--   * Şantiyesi olmayan kayıtlar (ör. şantiyesiz çalışan, genel gider) yalnızca yazan kişiye açıktır.
--   * Firmalar, ayarlar, gider kategorileri ve puantaj fırçaları ortaktır; her üye görür ve düzenler.
-- role = 'admin' olan bir hesap (elle atanırsa) yine her şeyi görür.

alter table public.profiles alter column role set default 'chief';

-- Kaydı yazan kişi
do $$
declare t text;
begin
  foreach t in array array['employees', 'overtime_records', 'expenses', 'attendance', 'payrolls', 'daily_reports'] loop
    execute format('alter table public.%I add column if not exists owner_id uuid default auth.uid() references public.profiles(id) on delete set null', t);
    execute format('create index if not exists ix_%s_owner on public.%I (owner_id)', t, t);
  end loop;
end $$;

create or replace function public.can_access_row(sid bigint, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (sid is not null and exists (select 1 from public.site_members where user_id = auth.uid() and site_id = sid))
      or (sid is null and owner = auth.uid());
$$;

do $$
declare t record;
begin
  for t in select * from (values ('employees', 'employees_all'), ('overtime_records', 'overtime_all'), ('expenses', 'expenses_all'),
                                 ('attendance', 'attendance_all'), ('payrolls', 'payrolls_all'), ('daily_reports', 'daily_reports_all')) v(tbl, pol) loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_access_row(site_id, owner_id)) with check (public.can_access_row(site_id, owner_id))', t.pol, t.tbl);
  end loop;
end $$;

-- Şantiyesiz günlük raporlar kişiye özeldir: aynı güne iki ayrı üye rapor yazabilir.
drop index if exists public.ux_daily_report_date_site;
create unique index ux_daily_report_date_site on public.daily_reports (date, coalesce(site_id::text, owner_id::text, ''));

-- Her üye şantiye açabilir; açan kişi otomatik olarak o şantiyenin üyesi olur.
create or replace function public.site_add_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.site_members (user_id, site_id) values (auth.uid(), new.id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists site_add_creator on public.sites;
create trigger site_add_creator after insert on public.sites for each row execute function public.site_add_creator();

-- Şantiyeyi açan kişi satırda da tutulur: kayıt anında üyelik satırı henüz oluşmadığı için
-- "ekle ya da güncelle" komutunun görme denetimi buna bakar.
alter table public.sites add column if not exists owner_id uuid default auth.uid() references public.profiles(id) on delete set null;

drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites for select to authenticated using (public.can_access_site(id) or owner_id = auth.uid());
drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites for update to authenticated
  using (public.can_access_site(id) or owner_id = auth.uid()) with check (public.can_access_site(id) or owner_id = auth.uid());
drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites for insert to authenticated with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites for delete to authenticated using (public.can_access_site(id) or owner_id = auth.uid());

-- Ortak listeler: her üye görür ve düzenler.
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to authenticated using (true);
drop policy if exists companies_admin on public.companies;
create policy companies_admin on public.companies for all to authenticated using (true) with check (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated using (true) with check (true);
drop policy if exists categories_admin on public.expense_categories;
create policy categories_admin on public.expense_categories for all to authenticated using (true) with check (true);
drop policy if exists statuses_admin on public.attendance_statuses;
create policy statuses_admin on public.attendance_statuses for all to authenticated using (true) with check (true);
