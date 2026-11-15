# Puanto – Supabase kurulumu

## 1. Veritabanı

1. supabase.com → hesap aç → **New project**
   - Ad: `Puanto`, Plan: **Free**, Bölge: **Central EU (Frankfurt)**
   - Veritabanı şifresini kendin belirle ve sakla (kimseye verme).
2. Sol menü **SQL Editor** → **New query** → dosyanın tamamını yapıştır → **Run**. Şu sırayla:
   1. `schema.sql` (tablolar)
   2. `sync.sql` (veri eşitleme)
   3. `uyelik.sql` (üyelik kuralları)
   4. `paylasim.sql` (şantiye paylaşma)
   5. `artimli.sql` (yalnızca değişenleri indirme + anlık güncelleme)
   6. `isletme.sql` (her firmanın ayrı işletme alanı)

   Hepsini tekrar çalıştırmak güvenlidir (`schema.sql` hariç: o yalnızca ilk kurulumda).
3. **Authentication → Sign In / Providers**: Email açık kalsın, **Confirm email** açık olsun
   (kayıt olan kişi mailini onaylamadan giremez).
4. **Project Settings → API**: `Project URL` ve `publishable` (anon) anahtarı lazım.
   `service_role` / `secret` anahtarını ve veritabanı şifresini kimseye verme, hiçbir yere yazma.

Yetki: her firma kendi **işletmesini** açar; işletmenin kayıtlarını (firma listesi, ayarlar, kategoriler, fırçalar, şantiyeler,
çalışanlar…) başka işletmeler göremez. İşletme sahibi **Ayarlar → İşletme ve üyeler**'den kişileri e-postayla ekler
(kayıtlı değilse kayıt olunca katılır). Sahip her şeyi görür; üyeler kendi açtıkları ve kendileriyle paylaşılan şantiyeleri görür
(**Şantiyeler → Paylaş**). Giriş yapmamış biri hiçbir şey göremez.

## 2. Web sitesi (GitHub Pages)

Depoya her push'ta testler geçerse site kendiliğinden yayınlanır: **https://usogt.github.io/Puanto/**

Bir kez yapılacaklar (github.com/usoGT/Puanto):
1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables** sekmesi → **New repository variable**:
   - `SUPABASE_URL` = Project URL (ör. `https://bpaeriysvjwhvyszjoxh.supabase.co`)
   - `SUPABASE_PUBLISHABLE_KEY` = publishable anahtar (`sb_publishable_...`)
3. **Actions → Web yayını → Run workflow** (ya da bir sonraki push'u bekle).
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://usogt.github.io/Puanto/`
   - **Redirect URLs**: `https://usogt.github.io/Puanto/**` ve yerel deneme için `http://localhost:5180/**`

   Böylece onay ve şifre yenileme mailleri siteye döner.

Bilgisayarda denemek için: `.env.web.example` dosyasını `.env.web` adıyla kopyala, iki değeri yaz, `npm.cmd run dev:web`.

## 3. Mail (kendi mail servisi)

Supabase'in hazır mail servisi saatte yalnızca 2 mail gönderir; gerçek kullanımda kayıt/şifre mailleri takılır.
Ücretsiz bir SMTP servisi bağla (ör. **Resend**, ayda 3.000 mail ücretsiz):

1. resend.com → hesap aç → **Domains → Add domain** (kendi alan adın varsa, ör. `puanto.app`) ve verilen DNS kayıtlarını ekle.
   Alan adın yoksa önce bir tane al; Resend yalnızca doğrulanmış alan adından mail gönderir.
2. Resend → **API Keys → Create API key** (Sending access).
3. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: `bildirim@ALAN_ADIN`, Sender name: `Puanto`
   - Host: `smtp.resend.com`, Port: `465`, Username: `resend`, Password: Resend API anahtarı
4. Supabase → **Authentication → Rate Limits**: "Emails sent per hour" değerini 30 gibi bir sayıya çıkar.
5. Türkçe mail metinleri: `mail-sablonlari.md` dosyasındaki şablonları **Authentication → Emails → Templates** içine yapıştır.

## 4. Masaüstü verisini taşıma

1. Masaüstü uygulamasında **Ayarlar → Yedek al** ile `.db` dosyası al.
2. Web sitesinde giriş yap → **Ayarlar → Masaüstü yedeğini aktar** → dosyayı seç.
3. Bütün kayıtlar hesabına eklenir; aynı adlı firma/şantiye/kategori ve aynı T.C. numaralı çalışan yeniden eklenmez.
   Aynı yedek iki kez aktarılamaz.

## Nasıl çalışır

- Giriş yapmadan uygulama açılmaz. Girişten sonra görme yetkin olan bütün kayıtlar cihaza indirilir.
- Her kayıt işleminden sonra değişen satırlar tek paket hâlinde sunucuya gönderilir; sunucu reddederse
  (yetki yok, çakışma) cihazdaki değişiklik de geri alınır ve hata gösterilir.
- Başka cihazda yapılan değişiklikler anında gelir (Realtime; `artimli.sql` kuruluysa). Ayrıca uygulamaya geri dönünce
  (1 dakikadan eskiyse) ya da Hesabım → **Verileri yenile** ile. Her seferinde yalnızca değişen satırlar iner.
- İnternet yokken uygulama cihazdaki son kopyayı salt okunur açar.
- Çıkış yapınca cihazdaki veri silinir.
