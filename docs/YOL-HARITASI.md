# EroMec yol haritası

## Biten
- Masaüstü uygulaması (Windows, çevrimdışı) – 1.8.0
- Telefon arayüzü: alt menü, kart listeler, puantaj kaydırma çubuğu, toplu puantaj
- E-posta ile giriş / kayıt (Supabase Auth)
- Çevrimiçi veri: girişte indir, her kayıtta sunucuya gönder, reddedilirse geri al
- Yetki: ayrı yönetici yok; her üye kendi açtığı şantiyeleri ve kendi yazdığı kayıtları görür. Firma, ayar, kategori ve fırçalar ortak.

## Faz 3 – Gerçek kullanıma hazırlık
- [x] Web'i internete koy: GitHub Pages iş akışı (`.github/workflows/web.yml`), adres https://usogt.github.io/EroMec/
- [x] Masaüstündeki mevcut veriyi Supabase'e taşıma: Ayarlar → Masaüstü yedeğini aktar (`src/web/importBackup.ts`)
- [x] Bir şantiyeyi başka üyeyle paylaşma: Şantiyeler → Paylaş, e-postayla (`supabase/paylasim.sql`)
- [x] Ortak listeler (firma, ayar, kategori, fırça): karar → herkes düzenleyebilir (şimdiki gibi kalıyor)
- [x] Şifre yenileme linkinden gelince yeni şifre ekranı
- [x] Kendi mail servisi: Resend SMTP kurulum adımları + Türkçe mail şablonları (`supabase/KURULUM.md`, `mail-sablonlari.md`)
- [ ] KULLANICI: Supabase'de `paylasim.sql` çalıştır; GitHub'da Pages + iki değişkeni ayarla; Supabase Site URL'ini değiştir
- [ ] KULLANICI: Resend hesabı + alan adı, Supabase SMTP ayarı
- [ ] KULLANICI: İlk gerçek giriş denemesi (kayıt ol, giriş yap, veri gir, masaüstü yedeğini aktar)

## Faz 4 – Masaüstü + PC yedeği
- [ ] Masaüstü uygulaması da giriş yapıp Supabase'e bağlansın
- [ ] Her açılışta ve günde bir PC'ye otomatik tarihli yedek (son 30 gün)
- [ ] İnternet yokken son kopyadan salt okunur açılış

## Faz 5 – Telefon uygulamaları
- [ ] Capacitor ile Android APK
- [ ] iPhone paketi, bulut derleme (Mac yok), TestFlight
- [ ] Uygulama ikonu, açılış ekranı, gizlilik politikası / KVKK metni

## Faz 6 – İyileştirme
- [ ] Yalnızca değişen veriyi indirme (şu an her açılışta hepsi iniyor)
- [ ] Anlık güncelleme (başka cihazdaki değişiklik kendiliğinden gelsin)
- [ ] Telefonda PDF/Excel paylaşma
