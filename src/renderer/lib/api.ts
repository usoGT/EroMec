import type { EroMecApi } from '../../shared/api';

declare global {
  interface Window {
    eromec?: EroMecApi;
  }
}

/** Ana süreçteki veritabanına güvenli IPC üzerinden erişim. */
export const api: EroMecApi = new Proxy({} as EroMecApi, {
  get(_t, prop: string) {
    const real = window.eromec;
    if (!real) throw new Error('Puanto arka plan bağlantısı bulunamadı. Uygulamayı Puanto içinden açın.');
    return (real as unknown as Record<string, unknown>)[prop];
  },
});

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Electron'un eklediği "Error invoking remote method ..." önekini temizle
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
