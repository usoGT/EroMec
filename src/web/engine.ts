// Çevrimiçi motor: API çağrılarını sıraya koyar, her çağrıdan sonra değişiklikleri sunucuya gönderir,
// sunucu reddederse yerel veriyi sunucudakiyle yeniden eşitler. Tarayıcıya bağlı değildir (testte Node'da çalışır).
import type { Db } from '../main/db/connection';
import { setReservedEmployeeNo } from '../main/db/employees';
import { READ_METHODS, type EroMecApi } from '../shared/api';
import { UserError } from '../main/db/validation';
import { applyIncremental, clearChanges, collectChanges, installTracking, loadSnapshot, serverErrorMessage, setTracking, type ChangeSet, type Snapshot } from './sync';

export interface Me { id: string; email: string; fullName: string; role: 'admin' | 'chief'; siteIds: number[] }
export interface PullResult { data: Snapshot; me: Me | null; ids: Record<string, number>; serverTime?: string }
export interface PullSinceResult { data: Snapshot; deletes: { t: string; pk: string }[]; me: Me | null; serverTime: string }

/** Artımlı indirmede, eşzamanlı işlemlerin geç görünen satırları kaçmasın diye geriye bu kadar pay bırakılır. */
export const SINCE_MARGIN_MS = 2 * 60_000;

/** Sunucuyla konuşan katman (tarayıcıda Supabase istemcisi) */
export interface Remote {
  pull(): Promise<PullResult>;
  push(changes: ChangeSet): Promise<void>;
  nextEmployeeNo(): Promise<string>;
  /** Yalnızca verilen zamandan sonra değişenler (sunucuda artimli.sql kurulu değilse yoktur ya da hata verir) */
  pullSince?(since: string): Promise<PullSinceResult>;
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
  /** Yalnızca call() içinden: o ana kadar birikmiş değişiklikleri hemen gönderir (uzun işlemleri parçalamak için). */
  checkpoint(): Promise<void>;
  /** Sunucudan yeni bir çalışan numarası alır. */
  nextEmployeeNo(): Promise<string>;
  /** İnternet yokken: cihazdaki son kopyayı salt okunur açar (yalnızca okuma işlemleri çalışır). */
  openCopy(bytes: Uint8Array, me: Me): Promise<Me>;
  readonly me: Me | null;
  readonly connected: boolean;
  /** Son kopya salt okunur açık */
  readonly readOnly: boolean;
  /** Son refresh() yerel veride bir şey değiştirdi mi (değiştirmediyse ekran yenilenmeyebilir) */
  readonly lastRefreshChanged: boolean;
}

export const READ_ONLY_MESSAGE = 'İnternet bağlantısı yok: veriler son kopyadan salt okunur açıldı. Değişiklik yapmak için internete bağlanıp “Tekrar bağlan”a basın.';

export function createEngine(db: Db, remote: Remote): Engine {
  // Boş (yalnızca varsayılan satırların olduğu) veritabanının kopyası: çıkışta buna dönülür.
  const blank = db.exportBytes();
  let me: Me | null = null;
  let connected = false;
  let readOnly = false;
  let serverTime: string | null = null; // son indirmenin sunucu saati (artımlı indirme için)
  let lastRefreshChanged = true;
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
      const msg = serverErrorMessage(e);
      throw new Error(/ulaşılamadı/.test(msg) ? 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.' : msg);
    }
    if (!res.me) throw new Error('Hesap profili bulunamadı. Çıkış yapıp tekrar giriş yapın.');
    loadSnapshot(db, res.data, res.ids);
    me = res.me;
    connected = true;
    readOnly = false;
    serverTime = res.serverTime ?? null;
    stale = false;
    return me;
  };

  /** Artımlı indirme; olmuyorsa (eski sunucu, çok eski kopya, görünürlük değişti) tam indirme. Değişen satır sayısı. */
  const pullChanges = async (): Promise<number> => {
    if (!remote.pullSince || !serverTime || !me) {
      await pull();
      return Number.POSITIVE_INFINITY;
    }
    let res: PullSinceResult;
    try {
      res = await remote.pullSince(new Date(new Date(serverTime).getTime() - SINCE_MARGIN_MS).toISOString());
    } catch (e) {
      const msg = serverErrorMessage(e);
      if (/ulaşılamadı/.test(msg)) throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
      await pull(); // ör. pull_since yok ya da "çok eski"
      return Number.POSITIVE_INFINITY;
    }
    // Paylaşılan şantiyeler değiştiyse eski kayıtlar da görünür/gizli olur: baştan indir.
    const sameSites = !!res.me && [...res.me.siteIds].sort().join(',') === [...me.siteIds].sort().join(',');
    if (!res.me || !sameSites) {
      await pull();
      return Number.POSITIVE_INFINITY;
    }
    try {
      const n = applyIncremental(db, res.data, res.deletes);
      me = res.me;
      serverTime = res.serverTime;
      return n;
    } catch {
      await pull(); // ör. yerelde beklenmeyen çakışma
      return Number.POSITIVE_INFINITY;
    }
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
    get readOnly() { return readOnly; },
    openCopy: (bytes, owner) => enqueue(async () => {
      db.replaceWith(bytes);
      installTracking(db); // eski bir kopyada izleme tabloları olmayabilir
      setTracking(db, false);
      me = owner;
      connected = false;
      stale = false;
      readOnly = true;
      return owner;
    }),
    checkpoint: () => (connected ? flush() : Promise.resolve()),
    nextEmployeeNo: () => remote.nextEmployeeNo().catch((e) => { throw new Error(serverErrorMessage(e)); }),
    connect: () => enqueue(pull),
    get lastRefreshChanged() { return lastRefreshChanged; },
    refresh: () => enqueue(async () => {
      await flush();
      lastRefreshChanged = (await pullChanges()) > 0;
      return me!;
    }),
    disconnect: () => enqueue(async () => {
      connected = false;
      readOnly = false;
      me = null;
      stale = false;
      db.replaceWith(blank);
      setTracking(db, false);
    }),
    call: (name, fn) => enqueue(async () => {
      if (readOnly) {
        if (!READ_METHODS.has(name as keyof EroMecApi)) throw new UserError(READ_ONLY_MESSAGE);
        return fn();
      }
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
