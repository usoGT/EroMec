import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

async function start() {
  // Tarayıcı/telefon sürümünde (vite --mode web) veritabanı sayfanın içinde çalışır.
  if (import.meta.env.MODE === 'web' && !window.eromec) {
    const { installWebApi } = await import('../web/webApi');
    await installWebApi();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
