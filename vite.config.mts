import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { serverEnv } from './scripts/server-env.mjs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Paketlenmiş masaüstü uygulamasında sıkı içerik güvenliği politikası (CSP): yalnızca yerel dosyalar
// ve (yapılandırılmışsa) Supabase sunucusu.
const csp = (server: string): Plugin => ({
  name: 'eromec-csp',
  apply: 'build',
  transformIndexHtml: (html) => {
    const connect = server ? `'self' ${server} ${server.replace(/^http/, 'ws')}` : `'none'`;
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${connect}; object-src 'none'; base-uri 'none'">`,
    );
  },
});

// Arayüz (renderer) derlemesi. Dosyalar göreli yollarla üretilir ki
// paketlenmiş uygulamada file:// üzerinden açılabilsin.
// "--mode web": tarayıcı/telefon sürümü (veritabanı sayfanın içinde çalışır), çıktı dist-web klasörüne.
// Supabase değerleri (.env.web ya da ortam değişkenleri) her iki derlemeye de girer: masaüstü de girişle çalışır.
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  const env = serverEnv(r('.'));
  return {
    root: r('./src/renderer'),
    envDir: false,
    base: './',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.key),
    },
    plugins: web ? [react()] : [react(), csp(env.url)],
    build: { outDir: r(web ? './dist-web' : './dist'), emptyOutDir: true },
    server: web ? { port: 5180, strictPort: true, host: true, allowedHosts: true as const } : { port: 5173, strictPort: true },
    preview: { port: 5180, strictPort: true, host: true, allowedHosts: true as const },
  };
});
