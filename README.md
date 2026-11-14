# EroMec — Eroğlu Mechanic

Personel, ek mesai ve gider takibi için Windows masaüstü uygulaması.
Tamamen **çevrim dışı** çalışır; bütün veriler bilgisayardaki tek bir SQLite dosyasında saklanır.
Kırmızı-siyah tema; sol menü **☰** düğmesiyle açılıp kapanır (kapalıyken yalnızca simgeler görünür, tercih hatırlanır). Gece modu vardır: sol menünün altındaki **“Gece moduna geç”** düğmesiyle veya Ayarlar → Görünüm ile açılır, seçim hatırlanır.

## Özellikler

| Bölüm | İşlevler |
|---|---|
| **Takvim** | Aylık takvimde her günün mesai süresi/tutarı, gider tutarı ve günlük rapor sayısı. Güne tıklayınca o günün raporları, mesaileri ve giderleri açılır; oradan günlük rapor yazılır, mesai / toplu mesai / gider eklenir. Firma veya şantiyeye göre süzülebilir. |
| **Puantaj** | Aylık çalışan × gün tablosu, koyu renkli hücreler. Varsayılan fırçalar: **8** Çalıştı, **4** Yarım gün, **0** Devamsız, İ Ücretli izin, Üİ Ücretsiz izin, R Raporlu, T Resmi tatil, H Hafta tatili. **Fırçalar düzenlenebilir**: hücre yazısı, ad, renk, ücretli gün ve çalışılan gün değeri değiştirilebilir, yeni fırça eklenebilir. Fırça seçip hücreye tıklama veya sürükleme, gün başlığına tıklayıp o günü herkese uygulama, **“Boş günleri doldur”** ile tek tıkla bütün ayı doldurma (dolu günlere dokunmaz). Çalışılan gün, izin, rapor, devamsız toplamları. **Mesai entegrasyonu:** hücrenin köşesinde o günkü mesai saati görünür; “Mesai ekle” fırçasıyla hücreye tıklayınca o kişiye, gün numarasına tıklayınca listedeki herkese mesai eklenir (Mesailer bölümüne kaydedilir); aylık mesai saati ve tutarı sütunları. **Excel (.xlsx)** ve **PDF** indirme: her şantiye ayrı sayfada, her çalışanın altında günlük “Mesai (saat)” satırı, renkli, imza alanlı. |
| **Bordro** | Her çalışanın aylık maaşı: **Ücretli gün** (puantajda işaretlenen günlerin toplamı; ay 30/31 çekmesi fark etmez), **Normal maaş** (aylık maaş ÷ 30 × ücretli gün), **Mesai parası**, **TOPLAM**, **Asgari** (günlük asgari ücret × ücretli gün — resmi / bankaya yatan) ve **Elden** (toplam − asgari). “Bordroya kaydet” değerleri kilitler ve Giderler’e iki satır açar: normal maaş (Personel maaşı) ve mesai parası (Ek mesai; raporda iki kez sayılmaz); “Geri al” ile kaldırılır. Excel ve PDF (imza sütunlu) indirme. Aynı maaş sütunları Puantaj ekranında ve puantaj çıktılarında da yer alır. |
| **Ana Sayfa** | Hızlı işlem düğmeleri; bugünkü puantaj (işaretlenmeyenleri tek tıkla “8” yapma); bu ayın bordrosu (toplam, asgari, elden); ödenmemiş giderler (tek tıkla “Ödendi”); şantiyelerin bu ayki giderleri; kısa son işlemler listesi. Aktif çalışan sayısı, bugünkü mesai süresi, bugünkü / bu haftaki / bu ayki gider, ödenmemiş borç, son işlemler tablosu. Hepsi veritabanındaki gerçek kayıtlardan hesaplanır. |
| **Çalışanlar** | Şantiye, T.C. kimlik no (kontrol hanesiyle doğrulanır), IBAN (mod-97 ile doğrulanır), banka, doğum tarihi, SGK sicil no, kan grubu, adres, acil durum kişisi. Ekleme, düzenleme (form veya hücreye tıklayarak), silme, arama, Aktif/Ayrılmış filtresi, detay penceresi, maaş ödemesi kaydı. Mesai veya maaş kaydı olan çalışan **silinmez**, “Ayrıldı” olarak işaretlenir. |
| **Mesailer** | **Toplu mesai**: bir şantiyedeki bütün çalışanlara tek tıkla aynı saatlerde mesai yazılır (kişi seçimi ve kişiye özel ücret değiştirilebilir, zaten kaydı olanlar atlanır). Şantiye sütunu ve filtresi. Ekleme, düzenleme, silme, tarih ve çalışan filtresi, günlük / haftalık / aylık / filtrelenmiş toplamlar. Süre ve tutar otomatik hesaplanır, gece yarısını aşan mesai desteklenir. |
| **Giderler** | Ekleme, düzenleme, silme, tarih / kategori / ödeme durumu filtresi, ada göre arama, filtrelenmiş toplam (ödenen / ödenmemiş). |
| **Şantiyeler** | Firmalar (ana firma, işveren firmalar) ve onlara bağlı şantiyeler. Şantiye detayında çalışan listesi, bu ayın giderleri, toplu çalışan atama. Kaydı olan şantiye silinmez, “Tamamlandı” yapılır. |
| **Raporlar** | İki sütun: solda **MALİYET** (yapılan işin bedeli: puantajdan personel maliyeti + mesai + diğer giderler), sağda **GİDER** (kaydedilen ödemeler: maaş, mesai, diğer; ödenen / borç), altta **FARK**. Firma veya şantiye bazında süzme; Günlük, haftalık, aylık ve özel tarih aralığı. Maaş gideri, mesai maliyeti, diğer giderler, toplam gider, ödenen ve ödenmemiş (borç). **CSV (Excel)** ve **PDF** olarak kaydetme. |
| **Ayarlar** | Şirket adı, uygulama adı, para birimi simgesi, **günlük asgari ücret**, gider kategorileri (ekleme, ad/tür değiştirme, silme — içinde gider olan kategori silinirken giderler seçilen kategoriye taşınır; “Personel maaşı” ve “Ek mesai” bordro için korumalıdır), görünüm (gündüz / gece modu / Windows ayarına göre), veritabanı yedeği alma, yedekten geri yükleme (onaylı), yeni gider kategorisi ekleme. |

## Hesaplama kuralları

- Para değerleri veritabanında **kuruş cinsinden tam sayı** olarak saklanır (kayan nokta hatası yoktur).
- **Mesai süresi** = bitiş − başlangıç − mola. Bitiş saati başlangıçtan küçükse mesai ertesi güne geçmiş sayılır (ör. 22:00–01:30). Sıfır veya negatif süre kaydedilemez.
- **Mesai tutarı** = süre × saatlik ücret (en yakın kuruşa yuvarlanır). Saatlik ücret çalışan kartından gelir, kayıtta değiştirilebilir. Her mesai kaydı kendi ücretini ve tutarını saklar; çalışanın maaşı/ücreti sonradan değişse de **eski kayıtlar değişmez**.
- **Toplam gider** = Maaş ödemeleri + Mesai maliyeti + Diğer giderler.
  - *Maaş gideri*: Giderler’de “Personel maaşı” kategorisinde kaydedilen **gerçek ödemeler**. Çalışan kartındaki aylık maaş yalnızca bilgidir, gidere eklenmez. Maaşlar otomatik oluşturulmaz.
  - *Mesai maliyeti*: Mesailer bölümündeki kayıtlardan gelir, raporda ayrı kalem olarak gösterilir ve toplam gidere **dahildir**.
  - *“Ek mesai” kategorisindeki gider kayıtları* yalnızca ödeme takibi içindir; aynı mesainin iki kez sayılmaması için toplam gidere **dahil edilmez** (raporda ayrıca belirtilir).
- **Ödenen / Ödenmemiş (borç)**: Giderler tablosundaki kayıtların ödeme durumundan hesaplanır.
- Hafta **pazartesi** başlar. Tarihler ekranda **GG.AA.YYYY** biçimindedir.
- Aynı çalışana aynı ay için ikinci **maaş ödemesi** kaydı açılamaz (veritabanı düzeyinde engellenir). Aynı çalışana aynı tarih + başlangıç saatinde ikinci mesai açılamaz. Benzer çalışan/gider/mesai kayıtlarında kullanıcıdan onay istenir.

## Gereksinimler (geliştirme için)

- Node.js 20 veya üzeri (22 önerilir) ve npm
- Windows 10/11 (kurulum dosyası üretmek için önerilir). Linux’ta da derlenebilir, bunun için `wine` gerekir (aşağıya bakın).

## Çalıştırma

```bash
npm install          # bağımlılıkları kurar (ilk seferde bir kez)
npm run dev          # geliştirme modunda uygulamayı açar
```

Diğer komutlar:

```bash
npm run build        # tip kontrolü + arayüz ve ana süreç derlemesi (dist/, dist-electron/)
npm start            # derlenmiş uygulamayı açar (önce npm run build)
npm test             # birim ve veritabanı testleri (Vitest)
npm run test:e2e     # gerçek Electron penceresiyle uçtan uca test (Playwright; ekransız Linux’ta: xvfb-run -a npm run test:e2e)
```

## Windows kurulum dosyası (.exe) oluşturma

```bash
npm run dist:win             # release/EroMec-Kurulum-1.8.0.exe (NSIS kurulum sihirbazı)
npm run dist:win:portable    # release/EroMec-Tasinabilir-1.8.0.exe (kurulumsuz, tek dosya)
```

- Kurulum Türkçe’dir; kurulum klasörü seçilebilir, masaüstü ve Başlat menüsü kısayolu oluşturulur.
- Kurulum dosyası kod imzası taşımadığı için Windows SmartScreen ilk açılışta uyarı verebilir: **“Ek bilgi” → “Yine de çalıştır”**.
- Windows dışında (Linux) derlerken NSIS adımı için 64 ve 32 bit `wine` gerekir:
  `sudo dpkg --add-architecture i386 && sudo apt update && sudo apt install wine64 wine32:i386`

## Verilerin yeri ve yedekleme

- Veritabanı: `%APPDATA%\EroMec\eromec.db` (Ayarlar sayfasında tam yol gösterilir).
- **Ayarlar → Yedek al** ile `.db` dosyası olarak yedek alınır.
- **Ayarlar → Yedekten geri yükle** önce onay ister, ardından mevcut verinin otomatik bir kopyasını `%APPDATA%\EroMec\yedekler\` klasörüne kaydeder ve sonra yedeği yükler.
- Uygulamayı kaldırmak verileri **silmez**.

## Proje yapısı

```
src/
  shared/            Ortak kod: tipler, IPC sözleşmesi, para/tarih/mesai hesapları
  main/              Electron ana süreç
    main.ts          Pencere, güvenlik ayarları, ağ engelleme
    preload.ts       Arayüze yalnızca tanımlı API’yi açar (contextBridge)
    ipc.ts           IPC işleyicileri, dosya kaydetme/açma pencereleri
    db/              Veritabanı katmanı (Electron’dan bağımsız, test edilebilir)
      connection.ts  sql.js (SQLite) bağlantısı, atomik dosyaya yazma
      migrations.ts  Sürüm kontrollü şema (PRAGMA user_version)
      employees.ts, overtime.ts, expenses.ts, reports.ts, settings.ts, activity.ts
      backup.ts      Yedek doğrulama ve geri yükleme
      export.ts      CSV ve PDF (HTML) rapor üretimi
  renderer/          React + TypeScript + Tailwind arayüzü
    pages/           Ana Sayfa, Çalışanlar, Mesailer, Giderler, Raporlar, Ayarlar
    components/      Excel benzeri tablo (sıralama + hücrede düzenleme), pencereler, alanlar
tests/               Vitest birim/veritabanı testleri
e2e/                 Playwright uçtan uca testi
build/               Uygulama simgesi
```

### Veritabanı tabloları

`employees`, `overtime_records`, `expenses`, `expense_categories`, `settings`, `activity_log`, `companies`, `sites`, `daily_reports`, `attendance`, `attendance_statuses`, `payrolls`.
Şema sürüm 2 ile firmalar, şantiyeler, günlük raporlar ve ek çalışan bilgileri eklendi; sürüm 3 ile puantaj, sürüm 4 ile bordro kayıtları, sürüm 5 ile düzenlenebilir puantaj fırçaları eklendi, sürüm 6 ile “Kira” ve “Elektrik ve su” kategorileri kaldırıldı (giderleri “Diğer”e taşındı); eski veritabanları açılışta kayıpsız güncellenir.
Yabancı anahtarlar `ON DELETE RESTRICT` ile tanımlıdır; geçmiş kayıtlar yanlışlıkla silinemez.
Şema değişikliği gerektiğinde `src/main/db/migrations.ts` dosyasındaki listeye yeni bir migration eklenir; mevcut olanlar değiştirilmez.

### Güvenlik

- Arayüzde Node.js erişimi kapalıdır (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Veritabanı işlemleri yalnızca `preload` ile açılan, listesi sabit IPC kanalları üzerinden yapılır; girdiler ana süreçte doğrulanır.
- Paketlenmiş uygulamada sıkı CSP uygulanır ve yerel dosyalar dışındaki bütün ağ istekleri engellenir.
- Aynı anda yalnızca bir EroMec penceresi çalışır (aynı veritabanına çift yazma önlenir).

### Teknik not: SQLite

SQLite, yerel derleme gerektirmeyen WebAssembly sürümü (**sql.js**) ile kullanılır. Böylece Windows kurulum dosyası
herhangi bir platformda sorunsuz üretilebilir. Veritabanı her kayıttan sonra diske atomik olarak yazılır
(önce geçici dosya, sonra yeniden adlandırma), bu sayede elektrik kesintisinde dosya yarım kalmaz.
