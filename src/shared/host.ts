// Çevrimiçi sürümün cihazla konuştuğu küçük arayüz: son kopya (internet yokken salt okunur açılış)
// ve masaüstünde PC'ye günlük otomatik yedek. Masaüstünde ana süreç (IPC), tarayıcıda IndexedDB uygular.

export interface CopyOwner { id: string; email: string; fullName: string; role: 'admin' | 'chief'; siteIds: number[] }
export interface CopyMeta {
  /** Kopyanın alındığı an (ISO) */
  savedAt: string;
  /** Kopyanın sahibi: başka hesap girerse kullanılmaz */
  me: CopyOwner;
}

export interface EroMecHost {
  /** Masaüstü mü (PC'ye günlük yedek alınır) */
  readonly desktop: boolean;
  /** Son kopyayı yazar; masaüstünde o günün otomatik yedeği yoksa onu da yazar. */
  saveCopy(bytes: Uint8Array, meta: CopyMeta): Promise<{ dailyBackup?: string }>;
  loadCopy(): Promise<{ bytes: Uint8Array; meta: CopyMeta } | null>;
  /** Çıkışta son kopya silinir (masaüstündeki günlük yedekler kalır). */
  clearCopy(): Promise<void>;
  /** Masaüstü: bu bilgisayardaki eski (çevrimdışı) veritabanı; yoksa ya da boşsa null */
  legacyDb?(): Promise<Uint8Array | null>;
  /** Masaüstü: otomatik yedeklerin klasörü */
  backupDir?(): Promise<string>;
}

declare global {
  interface Window {
    eromecHost?: EroMecHost;
  }
}

/** Otomatik yedeklerin saklandığı gün sayısı */
export const AUTO_BACKUP_DAYS = 30;
