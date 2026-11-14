# EroMec – çalışma notları (Claude için)

Eroğlu Mechanic için personel, puantaj, bordro, mesai ve gider takibi. Arayüz tamamen Türkçe.

## Kullanıcıyla iletişim
- Kısa, samimi ("kanka") Türkçe yaz. Resmi dil ve uzun açıklama istemiyor.
- Kullanıcı teknik değil: komutları tek tek ver, Windows'ta `npm` yerine `npm.cmd` yaz.
- Commit'lere Claude imzası/Co-Authored-By EKLEME. Yazar: `usoGT <usoGT@users.noreply.github.com>`. Doğrudan `main`'e push edilir.
- Veritabanı şifresi ve Supabase `service_role` / `sb_secret_` anahtarı asla istenmez, yazılmaz. Yalnızca publishable anahtar kullanılır (`.env.web`, depoya girmez).

## Yapı
- `src/main/db/*` – bütün iş mantığı (sql.js/SQLite). Hem masaüstünde hem tarayıcıda aynı kod çalışır.
- `src/main` – Electron ana süreç. Derlemede Supabase değerleri varsa (`.env.web` ya da `VITE_SUPABASE_*` ortam değişkenleri, `scripts/server-env.mjs`) masaüstü de girişle çalışır ve arayüz web motorunu (`src/web`) kullanır; yoksa veriler PC'deki dosyada, IPC ile (`window.eromecDesktop`). `src/main/host.ts`: son kopya + günlük otomatik yedek. `EROMEC_DATA_DIR` verilirse Electron profili de oraya gider.
- `src/renderer` – React + Tailwind arayüz. Telefonda (<768px) alt menü ve kart listeler (`useIsMobile`).
- `src/web` – tarayıcı/telefon sürümü: `webApi.ts` (window.eromec), `engine.ts` + `sync.ts` (Supabase eşitleme).
- `supabase/schema.sql` + `sync.sql` + `uyelik.sql` + `paylasim.sql` + `artimli.sql` (bu sırayla çalışır; `tests/pg.ts` hepsini PGlite'ta kurar) – sunucu şeması, RLS ve eşitleme işlevleri. Proje ref: `bpaeriysvjwhvyszjoxh`.
- Yetki (supabase/uyelik.sql): ayrı yönetici yok. Her üye kendi açtığı şantiyeleri ve kendi yazdığı kayıtları görür; firma, ayar, kategori ve fırçalar ortaktır (herkes düzenler, kullanıcı kararı). Şantiye sahibi e-postayla üye ekler (paylasim.sql).
- Web yayını: GitHub Pages (`.github/workflows/web.yml`), Supabase değerleri depo değişkenlerinde (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Masaüstü kurulumu (`desktop.yml`), Android (`android.yml`), iPhone/TestFlight (`ios.yml`) da Actions'ta.
- Telefon: Capacitor (`capacitor.config.json`, `android/`, `ios/`), webDir `dist-web`. Telefona özel kod `src/web/native.ts` (paylaşma, HTML→PDF, geri tuşu). Ayrıntı: `docs/TELEFON.md`.
- Eşitleme: tam indirme `pull_all`, sonra artımlı `pull_since` (`applyIncremental`), Realtime ile anlık; internet yoksa son kopya salt okunur (`READ_METHODS`).
- Para kuruş (tam sayı), tarih ekranda gg.aa.yyyy, hafta Pazartesi başlar.

## Komutlar
- `npm test` (vitest; sunucu SQL'i de `tests/server-sql.test.ts` ile PGlite'ta denenir) · `npm run build` (masaüstü) · `xvfb-run -a npx playwright test` (e2e; çevrimdışı derleme ister: `.env.web` varsa `EROMEC_OFFLINE=1` ile derle)
- `npm run dev:web` / `npm run build:web` – tarayıcı sürümü (port 5180, `.env.web` gerekir)
- Değişiklikten sonra: typecheck + vitest + e2e geçmeli, sonra commit + push.

## Yol haritası
`docs/YOL-HARITASI.md` – hangi faz bitti, sırada ne var. Bir faz bitince orayı güncelle.
