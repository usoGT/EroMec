# Puanto yol haritası

## Biten
- Masaüstü uygulaması (Windows, çevrimdışı) – 1.8.0
- Telefon arayüzü: alt menü, kart listeler, puantaj kaydırma çubuğu, toplu puantaj
- E-posta ile giriş / kayıt (Supabase Auth)
- Çevrimiçi veri: girişte indir, her kayıtta sunucuya gönder, reddedilirse geri al
- Yetki: ayrı yönetici yok; her üye kendi açtığı şantiyeleri ve kendi yazdığı kayıtları görür. Firma, ayar, kategori ve fırçalar ortak.

## Faz 3 – Gerçek kullanıma hazırlık
- [x] Web'i internete koy: GitHub Pages iş akışı (`.github/workflows/web.yml`), adres https://usogt.github.io/Puanto/
- [x] Masaüstündeki mevcut veriyi Supabase'e taşıma: Ayarlar → Masaüstü yedeğini aktar (`src/web/importBackup.ts`)
- [x] Bir şantiyeyi başka üyeyle paylaşma: Şantiyeler → Paylaş, e-postayla (`supabase/paylasim.sql`)
- [x] Ortak listeler (firma, ayar, kategori, fırça): karar → herkes düzenleyebilir (şimdiki gibi kalıyor)
- [x] Şifre yenileme linkinden gelince yeni şifre ekranı
- [x] Kendi mail servisi: Resend SMTP kurulum adımları + Türkçe mail şablonları (`supabase/KURULUM.md`, `mail-sablonlari.md`)
- [ ] KULLANICI: Supabase'de `paylasim.sql` çalıştır; GitHub'da Pages + iki değişkeni ayarla; Supabase Site URL'ini değiştir
- [ ] KULLANICI: Resend hesabı + alan adı, Supabase SMTP ayarı
- [ ] KULLANICI: İlk gerçek giriş denemesi (kayıt ol, giriş yap, veri gir, masaüstü yedeğini aktar)

## Faz 4 – Masaüstü + PC yedeği
- [x] Masaüstü uygulaması da giriş yapıp Supabase'e bağlanır (derlemede `.env.web` varsa; yoksa eskisi gibi tamamen çevrimdışı)
- [x] Masaüstünde "Bu bilgisayardaki eski verileri aktar" (Ayarlar): eski çevrimdışı veri tek tıkla hesaba
- [x] Her gün ilk açılışta PC'ye otomatik tarihli yedek, son 30 gün (`yedekler/otomatik`, `src/main/autoBackup.ts`)
- [x] İnternet yokken son kopyadan salt okunur açılış (masaüstünde dosya, tarayıcıda IndexedDB; çıkışta silinir)

## Faz 5 – Telefon uygulamaları
- [x] Capacitor ile Android projesi (`android/`) + APK iş akışı (`.github/workflows/android.yml`, imza anahtarı varsa .aab)
- [x] iPhone projesi (`ios/`) + bulutta derleyip TestFlight'a yükleyen iş akışı (`ios.yml`; Apple hesabı olmadan denenemedi)
- [x] Uygulama ikonu, açılış ekranı (`assets/`, `npm run mobile:assets`), web manifesti (ana ekrana ekle)
- [x] Gizlilik politikası / KVKK metni: `src/renderer/public/gizlilik.html` → https://usogt.github.io/Puanto/gizlilik.html
- [x] Gizlilik metnine firma adresi ve iletişim e-postası eklendi
- [ ] KULLANICI: Play Console (25 $) / Apple Developer (99 $/yıl) hesapları ve GitHub Secrets (`docs/TELEFON.md`)

## Faz 6 – İyileştirme
- [x] Yalnızca değişen veriyi indirme (`supabase/artimli.sql`: `_changed_at`, `sync_deletes`, `pull_since`)
- [x] Anlık güncelleme (Supabase Realtime; form açıkken bekler, kendi değişikliğin ekranı yenilemez)
- [x] Telefonda PDF/Excel paylaşma (uygulamada paylaşma menüsü, telefon tarayıcısında Web Share; PDF telefonda dosya olarak üretilir)
- [ ] KULLANICI: Supabase'de `artimli.sql` çalıştır

## Faz 7 – Puanto: çok firmalı
- [x] Ad Puanto, yeni logo ve ikonlar, paket kimliği `app.puanto`
- [x] Her firma kendi işletmesi (`supabase/isletme.sql`): ayrı firma listesi, ayarlar, kategoriler, fırçalar, kayıtlar
- [x] İşletme kurma ekranı, Ayarlar → İşletme ve üyeler (e-postayla ekle, davet, çıkar, ayrıl)
- [x] Masaüstü eski EroMec verisini ilk açılışta yeni klasöre taşır
- [x] Depo usoGT/Puanto olarak yeniden adlandırıldı; site https://usogt.github.io/Puanto/

## Sırada ne olabilir
- Gerçek kullanımdan gelen geri bildirimler
- Çalışan/kayıt arama, toplu Excel içe aktarma
- Bildirimler (ör. ay sonu bordro hatırlatması)
