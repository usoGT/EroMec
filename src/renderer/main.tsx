import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SERVER_CONFIGURED } from './lib/auth';
import type { EroMecApi } from '../shared/api';
import './index.css';

declare global {
  interface Window {
    /** Masaüstü: ana süreçteki (PC'deki) veritabanına IPC köprüsü */
    eromecDesktop?: EroMecApi;
  }
}

async function start() {
  if (SERVER_CONFIGURED || (import.meta.env.MODE === 'web' && !window.eromecDesktop)) {
    // Çevrimiçi (masaüstü ya da tarayıcı) ve tarayıcı/telefon sürümü: veritabanı sayfanın içinde çalışır.
    const [{ installWebApi }, { setupNative }] = await Promise.all([import('../web/webApi'), import('../web/native')]);
    await installWebApi();
    void setupNative().catch((e) => console.error('[Puanto] telefon kurulumu:', e));
  } else {
    // Çevrimdışı masaüstü: veriler bu bilgisayardaki dosyada, ana süreçte.
    window.eromec = window.eromecDesktop;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
