// Çevrimiçi motor: API çağrılarını sıraya koyar, her çağrıdan sonra değişiklikleri sunucuya gönderir,
// sunucu reddederse yerel veriyi sunucudakiyle yeniden eşitler. Tarayıcıya bağlı değildir (testte Node'da çalışır).
import type { Db } from '../main/db/connection';
import { setReservedEmployeeNo } from '../main/db/employees';
import { clearChanges, collectChanges, loadSnapshot, serverErrorMessage, setTracking, type ChangeSet, type Snapshot } from './sync';

export interface Me { id: string; email: string; fullName: string; role: 'admin' | 'chief'; siteIds: number[] }
export interface PullResult { data: Snapshot; me: Me | null; ids: Record<string, number> }

/** Sunucuyla konuşan katman (tarayıcıda Supabase istemcisi) */
export interface Remote {
  pull(): Promise<PullResult>;
  push(changes: ChangeSet): Promise<void>;
  nextEmployeeNo(): Promise<string>;
}

export interface Engine {
  /** Bir API işlemini sıradaki diğer işlemler bitince çalıştırır; bağlıysa değişiklikleri sunucuya gönderir. */
  call<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
  /** Giriş sonrası: sunucudaki veriyi indirir ve izlemeyi başlatır. */
  connect(): Promise<Me>;
  /** Sunucudaki güncel veriyi yeniden indirir. */
  refresh(): Promise<Me>;
  /** Çıkış: yerel veriyi boşaltır. */
  disconnect(): Promise<void>;
  readonly me: Me | null;
  readonly connected: boolean;
}

export function createEngine(db: Db, remote: Remote): Engine {
  // Boş (yalnızca varsayılan satırların olduğu) veritabanının kopyası: çıkışta buna dönülür.
  const blank = db.exportBytes();
  let me: Me | null = null;
  let connected = false;
  let stale = false; // yerel veri sunucudan sapmış olabilir; bir sonraki işlemden önce yeniden indirilir
  let chain: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn);
    chain = p.catch(() => undefined);
    return p;
  };

  const pull = async (): Promise<Me> => {
    let res: PullResult;
    try {
      res = await remote.pull();
    } catch (e) {
      throw new Error(serverErrorMessage(e));
    }
    if (!res.me) throw new Error('Hesap profili bulunamadı. Çıkış yapıp tekrar giriş yapın.');
    loadSnapshot(db, res.data, res.ids);
    me = res.me;
    connected = true;
    stale = false;
    return me;
  };

  /** Yerelde birikmiş değişiklikleri gönderir; sunucu reddederse yerel veriyi geri alır ve hatayı fırlatır. */
  const flush = async () => {
    const changes = collectChanges(db);
    if (!changes) return;
    try {
      await remote.push(changes);
      clearChanges(db);
    } catch (e) {
      stale = true;
      await pull().catch(() => undefined); // çevrimdışıysa bir sonraki işlemde yeniden denenir
      throw new Error(serverErrorMessage(e));
    }
  };

  return {
    get me() { return me; },
    get connected() { return connected; },
    connect: () => enqueue(pull),
    refresh: () => enqueue(async () => {
      await flush();
      return pull();
    }),
    disconnect: () => enqueue(async () => {
      connected = false;
      me = null;
      stale = false;
      db.replaceWith(blank);
      setTracking(db, false);
    }),
    call: (name, fn) => enqueue(async () => {
      if (!connected) return fn();
      if (stale) await pull();
      if (name === 'employeeCreate') setReservedEmployeeNo(await remote.nextEmployeeNo().catch((e) => { throw new Error(serverErrorMessage(e)); }));
      let result: Awaited<ReturnType<typeof fn>>;
      try {
        result = await fn();
      } catch (err) {
        await flush().catch(() => undefined); // hata öncesinde tamamlanmış bir kayıt varsa o yine gönderilir
        throw err;
      } finally {
        setReservedEmployeeNo(null);
      }
      await flush();
      return result;
    }),
  };
}
