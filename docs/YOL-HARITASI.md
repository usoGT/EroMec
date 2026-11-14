# EroMec yol haritası

## Biten
- Masaüstü uygulaması (Windows, çevrimdışı) – 1.8.0
- Telefon arayüzü: alt menü, kart listeler, puantaj kaydırma çubuğu, toplu puantaj
- E-posta ile giriş / kayıt (Supabase Auth)
- Çevrimiçi veri: girişte indir, her kayıtta sunucuya gönder, reddedilirse geri al
- Yönetici: kullanıcı rolleri ve şantiye atamaları (Ayarlar)

## Faz 3 – Gerçek kullanıma hazırlık
- [ ] İlk gerçek giriş denemesi (kullanıcı kayıt olur, yönetici yapılır)
- [ ] Web'i internete koy (Vercel/Netlify); Supabase site_url ve onay linkini o adrese çevir
- [ ] Masaüstündeki mevcut veriyi Supabase'e taşıma (yedek dosyasından içe aktar)
- [ ] Şef ekranı: şantiye seçimi otomatik gelsin, yetkisi olmayan ayarlar gizlensin
- [ ] Kendi mail servisi (Supabase'in saatte 2 mail sınırı var)

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
