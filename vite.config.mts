import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Paketlenmiş uygulamada sıkı içerik güvenliği politikası (CSP): yalnızca yerel dosyalar.
const csp = (): Plugin => ({
  name: 'eromec-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'">`,
    ),
});

// Arayüz (renderer) derlemesi. Dosyalar göreli yollarla üretilir ki
// paketlenmiş uygulamada file:// üzerinden açılabilsin.
// "--mode web": tarayıcı/telefon sürümü (veritabanı sayfanın içinde çalışır), çıktı dist-web klasörüne.
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    root: r('./src/renderer'),
    envDir: r('.'), // .env.web proje kökünde durur
    base: './',
    plugins: web ? [react()] : [react(), csp()],
    build: { outDir: r(web ? './dist-web' : './dist'), emptyOutDir: true },
    server: web ? { port: 5180, strictPort: true, host: true, allowedHosts: true as const } : { port: 5173, strictPort: true },
    preview: { port: 5180, strictPort: true, host: true, allowedHosts: true as const },
  };
});
