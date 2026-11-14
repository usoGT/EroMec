# EroMec – telefon uygulamaları

Telefon uygulaması, web sürümünün (dist-web) Capacitor ile paketlenmiş hâlidir. Veriler aynı Supabase hesabından gelir.
Telefona özel: dışa aktarılan PDF/Excel paylaşma menüsüyle (WhatsApp, Drive, e-posta…) gönderilir; Android geri tuşu açık pencereyi kapatır.

## Android (APK)

1. github.com/usoGT/EroMec → **Actions → Android → Run workflow**.
2. Bitince sayfanın altındaki **EroMec-Android** dosyasını indir, içindeki `.apk`'yı telefona at.
3. Telefonda dosyaya dokun → "Bilinmeyen kaynaklardan yüklemeye izin ver" → **Yükle**.

Bu APK hata ayıklama (debug) imzalıdır; kendi telefonlarınıza kurmak için yeterlidir.

### Play Store (isteğe bağlı)
1. play.google.com/console → geliştirici hesabı (bir kerelik 25 $).
2. İmza anahtarı oluştur (bir kez, bilgisayarda; Java gerekir):
   ```
   keytool -genkey -v -keystore eromec.keystore -alias eromec -keyalg RSA -keysize 2048 -validity 10000
   ```
   Bu dosyayı ve şifresini kaybetme; kaybolursa uygulama güncellenemez. Depoya ekleme.
3. GitHub → **Settings → Secrets and variables → Actions → Secrets**:
   `ANDROID_KEYSTORE_BASE64` (dosyanın base64 hâli), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`eromec`), `ANDROID_KEY_PASSWORD`.
4. Android iş akışı artık imzalı `.aab` üretir; Play Console'a bu dosya yüklenir.
   Gizlilik politikası adresi: `https://usogt.github.io/EroMec/gizlilik.html`

## iPhone (TestFlight)

Mac gerekmez; derleme GitHub'ın Mac sunucusunda yapılır.

1. developer.apple.com → **Apple Developer Program** (yıllık 99 $).
2. appstoreconnect.apple.com → **Uygulamalar → +** → Paket kimliği `com.eroglumechanic.eromec`, ad `EroMec`.
3. App Store Connect → **Kullanıcılar ve Erişim → Entegrasyonlar → App Store Connect API → +** (erişim: **Admin**).
   `.p8` dosyasını indir (bir kez iner), **Key ID** ve **Issuer ID**'yi not al.
4. developer.apple.com → Membership → **Team ID**'yi not al.
5. GitHub → **Secrets**: `APPLE_TEAM_ID`, `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY` (`.p8` dosyasının tüm içeriği).
6. **Actions → iPhone (TestFlight) → Run workflow**. Bitince App Store Connect → TestFlight'ta görünür;
   telefona **TestFlight** uygulamasını kurup davetle yükle.

Not: iPhone iş akışı Apple hesabı olmadan denenemedi; ilk çalıştırmada hata çıkarsa çıktısını bana gönder.

## Geliştirici notları
- `npm run mobile:sync` — web derlemesi + `cap sync` (android/ios klasörlerine kopyalar)
- `npm run mobile:assets` — ikon ve açılış ekranlarını yeniden üretir (`assets/`)
- Windows'ta proje yolu çok uzunsa `capacitor-assets` iOS dosyalarını yazamaz (260 karakter sınırı); kısa bir klasörden çalıştır.
