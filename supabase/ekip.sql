-- Puanto ekip görünürlüğü (kvkk.sql'den SONRA çalıştırılır; tekrar çalıştırmak güvenlidir).
-- İşletmeye katılan herkes (şefler dahil) işletmedeki BÜTÜN şantiyeleri ve kayıtları görür ve düzenler —
-- sahibin gördüğü panelin aynısı. Farkı yalnızca üye yönetimi ve firma kodu: onlar sahibe özeldir (is_admin).
-- İşletmeler arası ayrım aynen geçerlidir: politikalar ayrıca in_my_workspace() ile sınırlar.

-- Şantiye: işletmenin şantiyesiyse (ya da şantiyesiz kayıtsa) erişilebilir.
create or replace function public.can_access_site(sid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_workspace() is not null
     and (sid is null or exists (select 1 from public.sites where id = sid and workspace_id = public.my_workspace()));
$$;

-- Kayıt: işletme içindeki her kayıt (şantiyeli ya da şantiyesiz, kim yazmış olursa olsun).
create or replace function public.can_access_row(sid bigint, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_access_site(sid);
$$;
