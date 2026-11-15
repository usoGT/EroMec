// Bütün ikonları scripts/logo.mjs çiziminden üretir:
//   build/icon.png (masaüstü; electron-builder Windows .ico'yu bundan yapar), web favicon ve iPhone ikonu,
//   assets/*.png (telefon; ardından "capacitor-assets generate" Android/iOS boyutlarını çıkarır).
import sharp from 'sharp';
import fs from 'node:fs';
import { BLACK, framed, mark, svg } from './logo.mjs';

const BG = '#0d0d0d';
const centered = (scale) => `<g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${mark()}</g>`;
const out = (file, body, size, bg) => sharp(Buffer.from(svg(size, body, bg))).resize(size, size).png().toFile(file);

fs.mkdirSync('assets', { recursive: true });
fs.mkdirSync('build', { recursive: true });
await out('build/icon.png', framed(), 512);
await out('src/renderer/public/favicon.png', framed(), 64);
await out('src/renderer/public/apple-touch-icon.png', framed(), 180, BLACK);
await out('assets/icon-only.png', framed(), 1024, BLACK);
// Android uyarlanabilir ikon: ön plan güvenli alanda (ortadaki %66), arka plan düz
await out('assets/icon-foreground.png', centered(0.62), 1024);
await out('assets/icon-background.png', '', 1024, BLACK);
await out('assets/splash.png', centered(0.22), 2732, BG);
await out('assets/splash-dark.png', centered(0.22), 2732, BG);
for (const n of [48, 72, 96, 128, 192, 256, 512]) {
  await sharp(Buffer.from(svg(n, framed()))).resize(n, n).webp().toFile(`src/renderer/public/icons/icon-${n}.webp`);
}
console.log('ikonlar hazır');
