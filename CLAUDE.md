# EroMec – çalışma notları (Claude için)

Eroğlu Mechanic için personel, puantaj, bordro, mesai ve gider takibi. Arayüz tamamen Türkçe.

## Kullanıcıyla iletişim
- Kısa, samimi ("kanka") Türkçe yaz. Resmi dil ve uzun açıklama istemiyor.
- Kullanıcı teknik değil: komutları tek tek ver, Windows'ta `npm` yerine `npm.cmd` yaz.
- Commit'lere Claude imzası/Co-Authored-By EKLEME. Yazar: `usoGT <usoGT@users.noreply.github.com>`. Doğrudan `main`'e push edilir.
- Veritabanı şifresi ve Supabase `service_role` / `sb_secret_` anahtarı asla istenmez, yazılmaz. Yalnızca publishable anahtar kullanılır (`.env.web`, depoya girmez).

## Yapı
- `src/main/db/*` – bütün iş mantığı (sql.js/SQLite). Hem masaüstünde hem tarayıcıda aynı kod çalışır.
- `src/main` – Electron ana süreç (masaüstü, çevrimdışı, veriler PC'de).
- `src/renderer` – React + Tailwind arayüz. Telefonda (<768px) alt menü ve kart listeler (`useIsMobile`).
- `src/web` – tarayıcı/telefon sürümü: `webApi.ts` (window.eromec), `engine.ts` + `sync.ts` (Supabase eşitleme).
- `supabase/schema.sql` + `sync.sql` – sunucu şeması, RLS ve eşitleme işlevleri. Proje ref: `bpaeriysvjwhvyszjoxh`.
- Para kuruş (tam sayı), tarih ekranda gg.aa.yyyy, hafta Pazartesi başlar.

## Komutlar
- `npm test` (vitest) · `npm run build` (masaüstü) · `xvfb-run -a npx playwright test` (e2e)
- `npm run dev:web` / `npm run build:web` – tarayıcı sürümü (port 5180, `.env.web` gerekir)
- Değişiklikten sonra: typecheck + vitest + e2e geçmeli, sonra commit + push.

## Yol haritası
`docs/YOL-HARITASI.md` – hangi faz bitti, sırada ne var. Bir faz bitince orayı güncelle.
