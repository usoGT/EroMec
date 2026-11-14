# EroMec – Supabase kurulumu

1. supabase.com → hesap aç → **New project**
   - Ad: `EroMec`, Plan: **Free**, Bölge: **Central EU (Frankfurt)**
   - Veritabanı şifresini kendin belirle ve sakla (kimseye verme).
2. Sol menü **SQL Editor** → **New query** → `schema.sql` dosyasının tamamını yapıştır → **Run**.
3. **Authentication → Sign In / Providers**: Email açık kalsın, **Confirm email** açık olsun
   (uygulamadaki "Kayıt ol" ile hesap açan kişi mailini onaylamadan giremez).
4. Uygulamayı açıp **Kayıt ol** ile kendi hesabını aç, maildeki onay linkine tıkla.
5. SQL Editor'da kendini ana firma (admin) yap:
   ```sql
   update profiles set role = 'admin' where email = 'SENIN_MAILIN';
   ```
6. Şefler de uygulamadan kendileri kayıt olur. Kayıt olan kişi bir şantiyeye atanana kadar hiçbir kaydı göremez.
7. **Project Settings → API**: `Project URL` ve `anon / publishable` anahtarını bana at.
   `service_role` / `secret` anahtarını ve veritabanı şifresini ATMA.

Yetki: admin her şeyi görür. Şef sadece atandığı şantiyeyi görür; o şantiyenin her şeyini (maaş, T.C., IBAN dahil) yönetir.
Giriş yapmamış biri hiçbir şey göremez.

## Uygulamayı projeye bağlama

Proje klasöründeki `.env.web.example` dosyasını `.env.web` adıyla kopyala, içine Project URL ve anon anahtarı yaz,
sonra `npm run dev:web` (veya `npm run build:web`) çalıştır. Bu iki değer boşken giriş/kayıt penceresi "sunucu bağlı değil" der.
