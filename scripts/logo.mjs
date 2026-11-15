// Puanto logosu (64 birimlik ızgara): siyah kutu, kırmızı "P", beyaz onay işareti (puantaj ✓).
// Uygulama içi logo (src/renderer/components/Logo.tsx) ve bütün ikonlar bu çizimden üretilir.
export const RED = '#c62828';
export const BLACK = '#0a0a0a';

/** "P" + onay işareti (kutu olmadan) */
export const mark = (red = RED) => `
  <rect x="15" y="12" width="9" height="40" rx="1.5" fill="${red}"/>
  <path d="M15 12 H32 A12 12 0 0 1 32 36 H15 V28 H32 A4 4 0 0 0 32 20 H15 Z" fill="${red}"/>
  <path d="M33 45 L39 51 L52 36" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Çerçeveli uygulama ikonu */
export const framed = (red = RED) => `<rect x="1" y="1" width="62" height="62" rx="13" fill="${BLACK}" stroke="${red}" stroke-width="2"/>${mark(red)}`;

export const svg = (size, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ''}${body}</svg>`;
