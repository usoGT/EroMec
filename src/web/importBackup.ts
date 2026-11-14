// Masaüstü yedeğini (EroMec .db) çevrimiçi veriye aktarma.
// Yedekteki satırlar yeni numaralarla mevcut (sunucudan inmiş) veritabanına eklenir; aradaki bağlar
// (çalışan → şantiye, gider → kategori, bordro → gider …) yeni numaralara çevrilir.
// Aynı adlı firma/şantiye/kategori ve aynı T.C. numaralı çalışan yeniden eklenmez, mevcut olanla eşleştirilir.
// Eklenen satırlar eşitleme izleyicisine düşer; checkpoint() her parçadan sonra onları sunucuya gönderir.
import type { Db } from '../main/db/connection';
import type { SqlValue } from 'sql.js';
import { SYNC_TABLES } from './sync';

/** Fabrika (ilk kurulum) ayarları: sunucuda hâlâ bu değerdeyse yedekteki değer alınır. */
const DEFAULT_SETTINGS: Record<string, string> = { companyName: 'Eroğlu Mechanic', appName: 'EroMec', currency: 'TRY' };
/** Cihaza özel ayarlar aktarılmaz */
const SKIP_SETTINGS = ['theme'];
/** Aynı yedeğin ikinci kez aktarılmasını önleyen işaretin ayar anahtarı */
export const importMarkerKey = (fingerprint: string) => `import:${fingerprint}`;

export interface ImportOptions {
  /** Yeni çalışanlara verilecek ilk numara (ör. sunucudan alınan "P0012") */
  firstEmployeeNo: string;
  /** Yedeği tanıtan kısa iz (dosya özeti); ikinci aktarımı engellemek için */
  fingerprint: string;
  /** Bu kadar satırda bir checkpoint() çağrılır */
  chunk?: number;
  /** Birikmiş değişiklikleri sunucuya gönderir */
  checkpoint?: () => Promise<void>;
}

export interface ImportResult {
  /** Tabloya göre eklenen satır sayısı */
  added: Record<string, number>;
  /** Mevcut kayıtla eşleştirilen (yeniden eklenmeyen) satır sayısı */
  matched: Record<string, number>;
  /** Aynısı zaten olduğu için ya da bağlı olduğu kayıt eklenemediği için atlanan satır sayısı */
  skipped: number;
  settings: number;
}

type Row = Record<string, SqlValue>;
const columnsOf = (db: Db, table: string) => db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

export class ImportError extends Error {}

/** Daha önce aktarılmış mı: işaret varsa durumunu ("başladı" / "tamamlandı") döndürür. */
export function importState(db: Db, fingerprint: string): string | null {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [importMarkerKey(fingerprint)])?.value ?? null;
}

export async function importBackup(target: Db, source: Db, opts: ImportOptions): Promise<ImportResult> {
  const chunk = opts.chunk ?? 800;
  const result: ImportResult = { added: {}, matched: {}, skipped: 0, settings: 0 };
  const maps = new Map<string, Map<SqlValue, SqlValue>>(SYNC_TABLES.map((t) => [t.name, new Map()]));
  let pending = 0;
  const tick = async (n = 1) => {
    pending += n;
    if (pending >= chunk && opts.checkpoint) {
      pending = 0;
      await opts.checkpoint();
    }
  };
  const marker = importMarkerKey(opts.fingerprint);
  const setMarker = (v: string) => target.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [marker, v]);

  // İşaret ilk pakette gider: yarıda kalan bir aktarım tekrar başlatılırsa kayıtlar çift olmasın.
  setMarker(`başladı ${new Date().toISOString()}`);
  if (opts.checkpoint) await opts.checkpoint();

  let empNo = Number(/^P(\d+)$/.exec(opts.firstEmployeeNo)?.[1] ?? NaN);
  if (!Number.isFinite(empNo)) {
    empNo = 1 + (target.get<{ n: number }>(`SELECT COALESCE(MAX(CAST(substr(employee_no, 2) AS INTEGER)), 0) AS n FROM employees WHERE employee_no GLOB 'P[0-9]*'`)?.n ?? 0);
  }

  for (const { name, pk } of SYNC_TABLES) {
    const cols = columnsOf(target, name).filter((c) => columnsOf(source, name).includes(c));
    const fks = target.all<{ from: string; table: string }>(`PRAGMA foreign_key_list(${name})`);
    const map = maps.get(name)!;
    const add = (k: string, n = 1) => ((result.added[k] = (result.added[k] ?? 0) + n));
    const match = (k: string) => ((result.matched[k] = (result.matched[k] ?? 0) + 1));

    for (const src of source.all<Row>(`SELECT * FROM ${name} ORDER BY ${pk}`)) {
      // Bağları yeni numaralara çevir; bağlı olduğu satır eklenemediyse bu satır da atlanır.
      const row: Row = { ...src };
      let broken = false;
      for (const fk of fks) {
        const v = row[fk.from];
        if (v === null || v === undefined) continue;
        if (fk.table === 'attendance_statuses') continue; // kod olduğu gibi kalır (aşağıda eklenir/eşleşir)
        const to = maps.get(fk.table)?.get(v);
        if (to === undefined) broken = true;
        else row[fk.from] = to;
      }
      if (broken) {
        result.skipped += 1;
        continue;
      }

      if (name === 'settings') {
        const key = String(row.key);
        if (SKIP_SETTINGS.includes(key) || key.startsWith('import:')) continue;
        const cur = target.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value;
        if (cur === row.value) continue;
        if (cur === undefined || cur === DEFAULT_SETTINGS[key]) {
          target.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, row.value]);
          result.settings += 1;
          await tick();
        }
        continue;
      }

      if (name === 'attendance_statuses') {
        if (target.get('SELECT 1 FROM attendance_statuses WHERE code = ?', [row.code])) match(name);
        else {
          const c = cols;
          target.run(`INSERT INTO attendance_statuses (${c.join(', ')}) VALUES (${c.map(() => '?').join(', ')})`, c.map((k) => row[k]));
          add(name);
          await tick();
        }
        continue;
      }

      // Aynı kayıt zaten varsa onunla eşleştir
      const existing =
        name === 'companies' ? target.get<{ id: number }>('SELECT id FROM companies WHERE name = ? COLLATE NOCASE', [row.name])
        : name === 'sites' ? target.get<{ id: number }>('SELECT id FROM sites WHERE company_id = ? AND name = ?', [row.company_id, row.name])
        : name === 'expense_categories' ? target.get<{ id: number }>('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE', [row.name])
        : name === 'employees' && row.national_id ? target.get<{ id: number }>('SELECT id FROM employees WHERE national_id = ?', [row.national_id])
        : undefined;
      if (existing) {
        map.set(src[pk], existing.id);
        match(name);
        continue;
      }

      if (name === 'employees') row.employee_no = `P${String(empNo++).padStart(4, '0')}`;
      const c = cols.filter((k) => k !== pk);
      target.run(`INSERT OR IGNORE INTO ${name} (${c.join(', ')}) VALUES (${c.map(() => '?').join(', ')})`, c.map((k) => row[k]));
      if (target.get<{ n: number }>('SELECT changes() AS n')!.n === 0) {
        // Aynısı zaten var (ör. aynı gün puantajı, aynı ayın maaş ödemesi)
        result.skipped += 1;
        continue;
      }
      map.set(src[pk], target.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id);
      add(name);
      await tick();
    }
  }

  setMarker(`tamamlandı ${new Date().toISOString()}`);
  if (opts.checkpoint) await opts.checkpoint();
  return result;
}

/** Yedek dosyasının kısa izi (SHA-256'nın ilk 16 hanesi) */
export async function fingerprintOf(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
