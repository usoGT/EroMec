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
import { getSupabase, SERVER_CONFIGURED } from '../renderer/lib/auth';
import { installTracking } from './sync';
import { createEngine, type Engine, type Me, type PullResult, type Remote } from './engine';

/** Arayüzün çevrimiçi durumu yönetmek için kullandığı uçlar (window.eromecSync) */
export interface SyncController {
  /** Sunucu yapılandırılmış mı (false ise veriler yalnızca bu cihazda durur) */
  readonly online: boolean;
  readonly me: Me | null;
  connect(): Promise<Me>;
  refresh(): Promise<Me>;
  disconnect(): Promise<void>;
}

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

  type Handler = (arg: any) => unknown | Promise<unknown>;
  const extra: Partial<Record<keyof EroMecApi, Handler>> = {
    reportExportCsv: async (a: { from: string; to: string; title: string } & SiteFilter) => {
      const { buildReportCsv } = await import('../main/db/export');
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      const name = `${safeFileName(`EroMec ${data.title}`)}.csv`;
      download(name, buildReportCsv(data), 'text/csv;charset=utf-8');
      return { saved: true, path: name };
    },
    reportExportPdf: async (a: { from: string; to: string; title: string } & SiteFilter) => {
      const { buildReportHtml } = await import('../main/db/export');
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      printHtml(buildReportHtml(data));
      return { saved: true, path: 'yazdırma penceresi' };
    },
    attendanceExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter) => {
      const m = await import('../main/db/attendance-export');
      const data = service.attendanceExportData(a?.month, a);
      if (a?.format === 'pdf') {
        printHtml(m.buildAttendanceHtml(data));
        return { saved: true, path: 'yazdırma penceresi' };
      }
      const name = `${safeFileName(`Puantaj ${formatPeriod(data.month.month)}${scopeSuffix(data.scopeLabel)}`)}.xlsx`;
      download(name, await m.buildAttendanceXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { saved: true, path: name };
    },
    payrollExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter) => {
      const m = await import('../main/db/payroll-export');
      const data = service.payrollExportData(a?.month, a);
      if (a?.format === 'pdf') {
        printHtml(m.buildPayrollHtml(data));
        return { saved: true, path: 'yazdırma penceresi' };
      }
      const name = `${safeFileName(`Bordro ${formatPeriod(data.payroll.month)}${scopeSuffix(data.scopeLabel)}`)}.xlsx`;
      download(name, await m.buildPayrollXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { saved: true, path: name };
    },
    backupCreate: () => {
      const name = `EroMec-Yedek-${todayIso()}.db`;
      download(name, service.backupBytes(), 'application/octet-stream');
      return { saved: true, path: name };
    },
    backupRestore: async () => {
      if (online) throw new UserError('Çevrimiçi sürümde yedekten geri yükleme henüz yok. Yedek dosyasını masaüstü uygulamasında açabilirsiniz.');
      const file = await pickFile('.db,.sqlite,.sqlite3');
      if (!file) return { restored: false };
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
        return engine ? await engine.call(name, () => handler(arg)) : await handler(arg);
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
    ? { online: true, get me() { return e.me; }, connect: () => e.connect(), refresh: () => e.refresh(), disconnect: () => e.disconnect() }
    : { online: false, me: null, connect: () => Promise.reject(new Error('Sunucu bağlı değil.')), refresh: () => Promise.reject(new Error('Sunucu bağlı değil.')), disconnect: () => Promise.resolve() };
}
