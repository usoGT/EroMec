// Tarayıcı ve telefon sürümü: Electron ana süreci olmadan aynı veritabanı katmanını
// (sql.js) doğrudan sayfanın içinde çalıştırır. Veriler cihazda IndexedDB'de saklanır.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { Db } from '../main/db/connection';
import { migrate } from '../main/db/migrations';
import { createService } from '../main/db/service';
import { UserError } from '../main/db/validation';
import { API_METHODS, type EroMecApi } from '../shared/api';
import { formatPeriod, todayIso } from '../shared/dates';
import type { AppSettings, SiteFilter, ThemeMode } from '../shared/types';
import type { CopyMeta, EroMecHost } from '../shared/host';
import { READ_METHODS } from '../shared/api';
import { getSupabase, SERVER_CONFIGURED } from '../renderer/lib/auth';
import { installTracking, serverErrorMessage } from './sync';
import { validateBackup } from '../main/db/backup';
import { fingerprintOf, importBackup, importState } from './importBackup';
import { htmlToPdf, isTouchDevice, shareFile } from './native';
import { createEngine, type Engine, type Me, type PullResult, type PullSinceResult, type Remote } from './engine';

/** Arayüzün çevrimiçi durumu yönetmek için kullandığı uçlar (window.eromecSync) */
export interface SyncController {
  /** Sunucu yapılandırılmış mı (false ise veriler yalnızca bu cihazda durur) */
  readonly online: boolean;
  readonly me: Me | null;
  connect(): Promise<Me>;
  refresh(): Promise<Me>;
  disconnect(): Promise<void>;
  /** Şantiyenin üyeleri (sahip ilk sırada) */
  siteMembers(siteId: number): Promise<SiteMember[]>;
  /** Kayıtlı bir üyeyi e-postasıyla şantiyeye ekler (yalnızca sahip) */
  siteShare(siteId: number, email: string): Promise<SiteMember>;
  /** Üyeyi şantiyeden çıkarır (sahip herkesi, üye yalnızca kendini) */
  siteUnshare(siteId: number, userId: string): Promise<void>;
  /** Cihazdaki son kopyanın bilgisi (verilen hesaba aitse) */
  copyInfo(accountId: string): Promise<CopyMeta | null>;
  /** İnternet yokken son kopyayı salt okunur açar */
  openCopy(accountId: string): Promise<Me>;
  /** Son kopya salt okunur açık mı */
  readonly readOnly: boolean;
  /** Son refresh() ekranda görünen veriyi değiştirdi mi */
  readonly lastRefreshChanged: boolean;
  /** Başka cihazdaki değişiklikler için anlık bildirim; aboneliği bitiren işlev döner */
  onRemoteChange(cb: () => void): Promise<() => void>;
  /** Masaüstü: bu bilgisayardaki eski (çevrimdışı) verinin aktarılabilir olup olmadığı */
  legacyAvailable(): Promise<boolean>;
  /** Masaüstü: bu bilgisayardaki eski veriyi hesaba aktarır; sonuç özeti döner (vazgeçilirse null) */
  importLegacy(): Promise<string | null>;
}

export interface SiteMember { userId: string; email: string; fullName: string; isOwner: boolean }

declare global {
  interface Window {
    eromecSync?: SyncController;
  }
}

const THEME_KEY = 'eromec.theme';
const readTheme = (): ThemeMode => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
};

const supabaseRemote: Remote = {
  pull: async () => {
    const { data, error } = await (await getSupabase()).rpc('pull_all');
    if (error) throw error;
    return data as PullResult;
  },
  push: async (changes) => {
    const { error } = await (await getSupabase()).rpc('apply_changes', { changes });
    if (error) throw error;
  },
  nextEmployeeNo: async () => {
    const { data, error } = await (await getSupabase()).rpc('next_employee_no');
    if (error) throw error;
    return String(data);
  },
  pullSince: async (since) => {
    const { data, error } = await (await getSupabase()).rpc('pull_since', { since });
    if (error) throw error;
    return data as PullSinceResult;
  },
};

/** Sunucudaki herhangi bir değişiklikte (başka cihaz, paylaşım) haber verir. Aboneliği bitiren işlev döner. */
async function subscribeChanges(onChange: () => void): Promise<() => void> {
  const sb = await getSupabase();
  const channel = sb.channel('eromec-degisiklikler')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => onChange())
    .subscribe();
  return () => void sb.removeChannel(channel);
}

/** Sunucu işlevlerinin kendi (Türkçe) hata mesajları olduğu gibi gösterilir. */
const rpcError = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return new Error(err?.code === 'P0002' || (err?.code === '42501' && /[ışğüöçİ]/.test(err.message ?? '')) ? String(err.message) : serverErrorMessage(e));
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: { data: unknown; error: unknown };
  try {
    res = await (await getSupabase()).rpc(fn, args);
  } catch (e) {
    throw new Error(serverErrorMessage(e));
  }
  if (res.error) throw rpcError(res.error);
  return res.data as T;
}

const siteApi = {
  siteMembers: async (siteId: number): Promise<SiteMember[]> =>
    (await rpc<{ user_id: string; email: string; full_name: string; is_owner: boolean }[]>('site_members_list', { sid: siteId }))
      .map((m) => ({ userId: m.user_id, email: m.email, fullName: m.full_name, isOwner: m.is_owner })),
  siteShare: async (siteId: number, email: string): Promise<SiteMember> => {
    const r = await rpc<{ userId: string; email: string; fullName: string }>('site_share', { sid: siteId, member_email: email });
    return { ...r, isOwner: false };
  },
  siteUnshare: (siteId: number, userId: string) => rpc<void>('site_unshare', { sid: siteId, member_id: userId }),
};

const IDB_NAME = 'eromec';
const STORE = 'files';
const KEY = 'eromec.db';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | undefined> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetKey<T>(key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(entries: [string, unknown][], remove: string[] = []): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    for (const [k, v] of entries) tx.objectStore(STORE).put(v, k);
    for (const k of remove) tx.objectStore(STORE).delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Tarayıcı/telefon: son kopya IndexedDB'de durur (çıkışta silinir). */
const browserHost: EroMecHost = {
  desktop: false,
  saveCopy: async (bytes, meta) => {
    await idbSet([['son-kopya', bytes], ['son-kopya-meta', meta]]);
    return {};
  },
  loadCopy: async () => {
    const [bytes, meta] = await Promise.all([idbGetKey<Uint8Array>('son-kopya'), idbGetKey<CopyMeta>('son-kopya-meta')]);
    return bytes && meta ? { bytes, meta } : null;
  },
  clearCopy: () => idbSet([], ['son-kopya', 'son-kopya-meta']),
};

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Rapor';
}

function download(name: string, data: string | Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** HTML'i görünmez bir çerçevede açıp yazdırma penceresini gösterir (oradan "PDF olarak kaydet"). */
function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Telefonda paylaşma menüsü, bilgisayarda indirme */
async function deliver(name: string, data: string | Uint8Array, type: string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (!(await shareFile(name, bytes, type))) download(name, data, type);
  return { saved: true, path: name };
}

/** PDF: bilgisayarda yazdırma penceresi ("PDF olarak kaydet"), telefonda PDF dosyası üretip paylaşma */
async function deliverPdf(name: string, html: string) {
  if (!isTouchDevice()) {
    printHtml(html);
    return { saved: true, path: 'yazdırma penceresi' };
  }
  return deliver(name, await htmlToPdf(html), 'application/pdf');
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const offline = () => Promise.reject(new Error('Sunucu bağlı değil.'));

const scopeSuffix = (label: string) => (label.startsWith('Bütün') ? '' : ` ${label.replace(/ \(bütün şantiyeler\)$/, '')}`);

export async function installWebApi(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const online = SERVER_CONFIGURED;
  // Çevrimiçi sürümde veri sunucudan gelir; cihazdaki eski yerel kopya kullanılmaz.
  const stored = online ? undefined : await idbGet().catch(() => undefined);

  // Yazmalar sırayla ve en son hâliyle kaydedilir.
  let pending: Uint8Array | null = null;
  let writing = false;
  const save = (bytes: Uint8Array) => {
    pending = bytes;
    if (writing) return;
    writing = true;
    void (async () => {
      while (pending) {
        const b = pending;
        pending = null;
        await idbPut(b).catch((e) => console.error('[EroMec] kayıt hatası:', e));
      }
      writing = false;
    })();
  };

  const db = online
    ? new Db(SQL, new SQL.Database(), null)
    : new Db(SQL, stored ? new SQL.Database(stored) : new SQL.Database(), 'Bu cihaz (tarayıcı deposu)', save);
  migrate(db);
  db.persist();
  const service = createService(db);
  let engine: Engine | null = null;
  if (online) {
    installTracking(db);
    engine = createEngine(db, supabaseRemote);
  }

  /** Çevrimiçi sürüm: masaüstü yedeğindeki verileri hesaba (sunucuya) ekler; mevcut veriler silinmez. */
  const importToServer = async (eng: Engine, fileName: string, bytes: Uint8Array) => {
    const file = { name: fileName };
    const clean = validateBackup(db, bytes);
    const fp = await fingerprintOf(bytes);
    const state = importState(db, fp);
    if (state?.startsWith('tamamlandı')) throw new UserError(`Bu yedek (${file.name}) daha önce aktarılmış. Kayıtlar çift olmasın diye tekrar aktarılmadı.`);
    if (state && !window.confirm(`Bu yedeğin aktarımı daha önce yarıda kalmış.

Tekrar aktarılırsa yarıda kalan kısımdaki bazı kayıtlar (gider, mesai) çift olabilir. Yine de devam edilsin mi?`)) {
      return { restored: false };
    }
    const src = new Db(SQL, new SQL.Database(clean), null);
    try {
      const count = (t: string) => src.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0;
      const ok = window.confirm(
        `“${file.name}” yedeğindeki veriler hesabınıza aktarılacak:

` +
        `• ${count('sites')} şantiye, ${count('employees')} çalışan
• ${count('attendance')} puantaj, ${count('overtime_records')} mesai, ${count('expenses')} gider kaydı

` +
        'Mevcut verileriniz silinmez. Aynı adlı firma/şantiye/kategori ve aynı T.C. numaralı çalışan yeniden eklenmez. ' +
        'Aktarılan şantiyeleri yalnızca siz görürsünüz (sonra paylaşabilirsiniz). Devam edilsin mi?',
      );
      if (!ok) return { restored: false };
      const r = await importBackup(db, src, { firstEmployeeNo: await eng.nextEmployeeNo(), fingerprint: fp, checkpoint: () => eng.checkpoint() })
        .catch((e) => { throw new Error(`Aktarım yarıda kaldı: ${(e as Error).message} O ana kadar aktarılan kayıtlar hesabınızda duruyor.`); });
      const n = (t: string) => r.added[t] ?? 0;
      const parts = [
        n('sites') && `${n('sites')} şantiye`, n('employees') && `${n('employees')} çalışan`, n('attendance') && `${n('attendance')} puantaj`,
        n('overtime_records') && `${n('overtime_records')} mesai`, n('expenses') && `${n('expenses')} gider`, n('payrolls') && `${n('payrolls')} bordro`,
      ].filter(Boolean);
      const matched = Object.values(r.matched).reduce((a, b) => a + b, 0);
      return {
        restored: true,
        path: file.name,
        imported: `Aktarıldı: ${parts.length ? parts.join(', ') : 'yeni kayıt yok'}.${matched ? ` ${matched} kayıt mevcut olanla eşleştirildi.` : ''}${r.skipped ? ` ${r.skipped} kayıt zaten olduğu için atlandı.` : ''}`,
      };
    } finally {
      src.close();
    }
  };

  type Handler = (arg: any) => unknown | Promise<unknown>;
  const host: EroMecHost = window.eromecHost ?? browserHost;
  // Son kopya: her değişiklikten kısa süre sonra (ve bağlanınca) cihaza yazılır.
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  const saveCopyNow = async () => {
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = null;
    if (!engine?.connected || !engine.me) return;
    try {
      await host.saveCopy(db.exportBytes(), { savedAt: new Date().toISOString(), me: engine.me });
    } catch (e) {
      console.error('[EroMec] son kopya yazılamadı:', e);
    }
  };
  const scheduleCopy = () => {
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => void saveCopyNow(), 2000);
  };
  const extra: Partial<Record<keyof EroMecApi, Handler>> = {
    reportExportCsv: async (a: { from: string; to: string; title: string } & SiteFilter) => {
      const { buildReportCsv } = await import('../main/db/export');
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      return deliver(`${safeFileName(`EroMec ${data.title}`)}.csv`, buildReportCsv(data), 'text/csv;charset=utf-8');
    },
    reportExportPdf: async (a: { from: string; to: string; title: string } & SiteFilter) => {
      const { buildReportHtml } = await import('../main/db/export');
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      return deliverPdf(`${safeFileName(`EroMec ${data.title}`)}.pdf`, buildReportHtml(data));
    },
    attendanceExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter) => {
      const m = await import('../main/db/attendance-export');
      const data = service.attendanceExportData(a?.month, a);
      const base = safeFileName(`Puantaj ${formatPeriod(data.month.month)}${scopeSuffix(data.scopeLabel)}`);
      if (a?.format === 'pdf') return deliverPdf(`${base}.pdf`, m.buildAttendanceHtml(data));
      return deliver(`${base}.xlsx`, await m.buildAttendanceXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    },
    payrollExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter) => {
      const m = await import('../main/db/payroll-export');
      const data = service.payrollExportData(a?.month, a);
      const base = safeFileName(`Bordro ${formatPeriod(data.payroll.month)}${scopeSuffix(data.scopeLabel)}`);
      if (a?.format === 'pdf') return deliverPdf(`${base}.pdf`, m.buildPayrollHtml(data));
      return deliver(`${base}.xlsx`, await m.buildPayrollXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    },
    backupCreate: () => deliver(`EroMec-Yedek-${todayIso()}.db`, service.backupBytes(), 'application/octet-stream'),
    backupRestore: async () => {
      const file = await pickFile('.db,.sqlite,.sqlite3');
      if (!file) return { restored: false };
      if (engine) return importToServer(engine, file.name, new Uint8Array(await file.arrayBuffer()));
      if (!window.confirm(`Mevcut bütün verilerin üzerine yazılacak.\n\nSeçilen yedek: ${file.name}\n\nŞu anki veriler önce güvenlik amacıyla indirilecek. Devam edilsin mi?`)) {
        return { restored: false };
      }
      const safetyCopy = `EroMec-geri-yukleme-oncesi-${todayIso()}.db`;
      download(safetyCopy, service.backupBytes(), 'application/octet-stream');
      service.restore(new Uint8Array(await file.arrayBuffer()));
      return { restored: true, path: file.name, safetyCopy };
    },
  };

  if (online) {
    // Görünüm (gece modu) cihaza özeldir: sunucuya yazılmaz, tarayıcıda saklanır.
    extra.settingsGet = () => ({ ...service.settingsGet(), theme: readTheme() });
    extra.settingsSave = (s: AppSettings) => {
      try {
        localStorage.setItem(THEME_KEY, s.theme);
      } catch {
        /* depolama kapalıysa yalnızca bu oturumda geçerli */
      }
      const cur = service.settingsGet();
      const same = cur.companyName === s.companyName && cur.appName === s.appName && cur.currency === s.currency && cur.dailyMinWageKurus === s.dailyMinWageKurus;
      const saved = same ? cur : service.settingsSave({ ...s, theme: cur.theme });
      return { ...saved, theme: s.theme };
    };
    extra.dbInfo = () => ({ ...service.dbInfo(), path: 'Supabase (çevrimiçi)' });
  }

  const api: Record<string, (arg?: unknown) => Promise<unknown>> = {};
  for (const name of API_METHODS) {
    const handler = extra[name] ?? ((service as unknown as Record<string, Handler>)[name] as Handler | undefined);
    if (!handler) throw new Error(`İşleyici eksik: ${name}`);
    api[name] = async (arg?: unknown) => {
      try {
        if (!engine) return await handler(arg);
        const result = await engine.call(name, () => handler(arg));
        if (!READ_METHODS.has(name)) scheduleCopy();
        return result;
      } catch (err) {
        if (err instanceof UserError) throw new Error(err.message);
        console.error(`[EroMec] ${name} hatası:`, err);
        // Motorun (eşitleme) hataları zaten kullanıcıya gösterilecek biçimdedir.
        if (engine && err instanceof Error && !/^(SQLITE|no such|UNIQUE|FOREIGN|NOT NULL|CHECK)/i.test(err.message) && !(err instanceof TypeError)) throw err;
        throw new Error(`Beklenmeyen bir hata oluştu: ${(err as Error)?.message ?? String(err)}`);
      }
    };
  }
  window.eromec = Object.freeze(api) as unknown as EroMecApi;
  const e = engine;
  window.eromecSync = e
    ? {
      online: true,
      get me() { return e.me; },
      get readOnly() { return e.readOnly; },
      get lastRefreshChanged() { return e.lastRefreshChanged; },
      onRemoteChange: (cb) => subscribeChanges(cb),
      connect: async () => {
        const me = await e.connect();
        await saveCopyNow();
        return me;
      },
      refresh: async () => {
        const me = await e.refresh();
        if (e.lastRefreshChanged) await saveCopyNow();
        return me;
      },
      disconnect: async () => {
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = null;
        await e.disconnect();
        await host.clearCopy().catch((err) => console.error('[EroMec] son kopya silinemedi:', err));
      },
      copyInfo: async (accountId) => {
        const c = await host.loadCopy().catch(() => null);
        return c && c.meta.me.id === accountId ? c.meta : null;
      },
      openCopy: async (accountId) => {
        const c = await host.loadCopy();
        if (!c || c.meta.me.id !== accountId) throw new Error('Bu cihazda bu hesaba ait bir kopya yok.');
        return e.openCopy(c.bytes, c.meta.me);
      },
      legacyAvailable: async () => !!(await host.legacyDb?.().catch(() => null)),
      importLegacy: async () => {
        const bytes = await host.legacyDb?.();
        if (!bytes) throw new Error('Bu bilgisayarda aktarılacak eski veri bulunamadı.');
        const r = await e.call('backupRestore', () => importToServer(e, 'Bu bilgisayardaki eski veriler', bytes));
        await saveCopyNow();
        return r.imported ?? null;
      },
      ...siteApi,
    }
    : {
      online: false, me: null, readOnly: false, lastRefreshChanged: false, onRemoteChange: async () => () => undefined, connect: offline, refresh: offline, disconnect: () => Promise.resolve(),
      siteMembers: offline, siteShare: offline, siteUnshare: offline, copyInfo: async () => null, openCopy: offline,
      legacyAvailable: async () => false, importLegacy: offline,
    };
}
