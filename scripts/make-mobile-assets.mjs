// Telefon uygulamasının ikon ve açılış ekranı kaynaklarını (assets/*.png) üretir; ardından
// "npx capacitor-assets generate" bunlardan Android/iOS boyutlarını çıkarır.
// Çizim src/renderer/components/Logo.tsx ve scripts/make-icon.py ile aynıdır (64 birimlik ızgara).
import sharp from 'sharp';
import fs from 'node:fs';

const RED = '#dc2626';
const BLACK = '#0a0a0a';
const BG = '#0d0d0d';

/** 64×64 ızgarada logo içi (E harfi + altıgen somun) */
const mark = `
  <rect x="14" y="13" width="9" height="38" rx="1.5" fill="${RED}"/>
  <rect x="14" y="13" width="33" height="8" rx="1.5" fill="${RED}"/>
  <rect x="14" y="28" width="22" height="8" rx="1.5" fill="${RED}"/>
  <rect x="14" y="43" width="33" height="8" rx="1.5" fill="${RED}"/>
  <polygon points="50,25.5 55.6,28.75 55.6,35.25 50,38.5 44.4,35.25 44.4,28.75" fill="#fff"/>
  <circle cx="50" cy="32" r="2.6" fill="${BLACK}"/>`;

const svg = (size, body, bg) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ''}${body}</svg>`);

/** Logoyu (çerçevesiz) verilen ölçekte ortaya yerleştirir */
const centered = (scale) => `<g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${mark}</g>`;
/** Uygulama ikonundaki çerçeveli kutu */
const framed = `<rect x="1" y="1" width="62" height="62" rx="13" fill="${BLACK}" stroke="${RED}" stroke-width="2"/>${mark}`;

fs.mkdirSync('assets', { recursive: true });
const out = (file, buf, size) => sharp(buf).resize(size, size).png().toFile(file);
await out('assets/icon-only.png', svg(1024, framed, BLACK), 1024);
// Android uyarlanabilir ikon: ön plan güvenli alanda (ortadaki %66), arka plan düz
await out('assets/icon-foreground.png', svg(1024, centered(0.62)), 1024);
await out('assets/icon-background.png', svg(1024, '', BLACK), 1024);
await out('assets/splash.png', svg(2732, centered(0.22), BG), 2732);
await out('assets/splash-dark.png', svg(2732, centered(0.22), BG), 2732);
console.log('assets/ hazır');
// iPhone "Ana ekrana ekle" ikonu (web sürümü)
await sharp('assets/icon-only.png').resize(180, 180).png().toFile('src/renderer/public/apple-touch-icon.png');
