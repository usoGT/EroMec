// Çevrimiçi eşitleme: yerel (sql.js) veritabanı ile Supabase arasındaki satır alışverişi.
// Yerel veritabanı hesap motorudur; sunucudan gelen satırlarla doldurulur, her kayıt işleminde
// değişen satırlar tetikleyicilerle (_sync_changes) izlenir ve paket hâlinde sunucuya gönderilir.
import type { Db } from '../main/db/connection';
import type { SqlValue } from 'sql.js';

/** Eşitlenen tablolar (sunucudaki sync_tables() ile aynı sıra) ve birincil anahtarları */
export const SYNC_TABLES: { name: string; pk: string }[] = [
  { name: 'companies', pk: 'id' }, { name: 'sites', pk: 'id' }, { name: 'settings', pk: 'key' }, { name: 'expense_categories', pk: 'id' },
  { name: 'attendance_statuses', pk: 'code' }, { name: 'employees', pk: 'id' }, { name: 'overtime_records', pk: 'id' }, { name: 'expenses', pk: 'id' },
  { name: 'attendance', pk: 'id' }, { name: 'payrolls', pk: 'id' }, { name: 'daily_reports', pk: 'id' }, { name: 'activity_log', pk: 'id' },
];

// Yerelde 0/1 tutulan, sunucuda boolean olan sütunlar
const BOOL_COLS: Record<string, string[]> = { expenses: ['is_paid'], expense_categories: ['is_system'], attendance_statuses: ['is_system'] };
// Yerelde "YYYY-AA-GG SS:DD:SS" (UTC) metni, sunucuda timestamptz
const TIME_COLS = ['created_at', 'updated_at'];
// Boşsa sunucuya null gitmesi gereken tarih sütunları
const DATE_COLS = ['start_date', 'end_date', 'birth_date'];
/** Cihaza özel ayarlar sunucuya gönderilmez */
const LOCAL_SETTINGS = ['theme'];

export type Row = Record<string, unknown>;
export interface ChangeSet { deletes: { t: string; pk: string }[]; upserts: { t: string; row: Row }[] }
export type Snapshot = Record<string, Row[]>;

const columnsOf = (db: Db, table: string): string[] => db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

/** Değişiklik izleme tablolarını ve tetikleyicilerini kurar (bir kez). */
export function installTracking(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL);
    INSERT OR IGNORE INTO _sync_state (id, enabled) VALUES (1, 0);
    -- Aynı satır birden çok kez yazılabilir (benzersizlik kısıtı yok: dış komutun ON CONFLICT kuralı tetikleyiciyi de etkiler)
    CREATE TABLE IF NOT EXISTS _sync_changes (tbl TEXT NOT NULL, pk TEXT NOT NULL);
  `);
  for (const { name, pk } of SYNC_TABLES) {
    const on = `WHEN (SELECT enabled FROM _sync_state) = 1 BEGIN INSERT INTO _sync_changes (tbl, pk) VALUES ('${name}', `;
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS _sync_${name}_i AFTER INSERT ON ${name} ${on}NEW.${pk}); END;
      CREATE TRIGGER IF NOT EXISTS _sync_${name}_u AFTER UPDATE ON ${name} ${on}NEW.${pk}); END;
      CREATE TRIGGER IF NOT EXISTS _sync_${name}_d AFTER DELETE ON ${name} ${on}OLD.${pk}); END;
    `);
  }
}

export function setTracking(db: Db, enabled: boolean) {
  db.run('UPDATE _sync_state SET enabled = ?', [enabled ? 1 : 0]);
}

function toLocal(col: string, v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (TIME_COLS.includes(col) && typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return v as SqlValue;
}

function toServer(table: string, col: string, v: unknown): unknown {
  if (BOOL_COLS[table]?.includes(col)) return v === 1 || v === true;
  if (TIME_COLS.includes(col) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return `${v.replace(' ', 'T')}Z`;
  if (DATE_COLS.includes(col) && v === '') return null;
  return v;
}

/** Yerel bir satırı sunucunun beklediği tiplere çevirir. */
export function rowToServer(table: string, row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([c, v]) => [c, toServer(table, c, v)]));
}

/** Yerel veritabanını sunucudan gelen satırlarla baştan doldurur ve yeni kayıt numaralarının başlangıcını ayarlar. */
export function loadSnapshot(db: Db, data: Snapshot, ids: Record<string, number>) {
  setTracking(db, false);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      for (const { name } of [...SYNC_TABLES].reverse()) db.run(`DELETE FROM ${name}`);
      for (const { name } of SYNC_TABLES) {
        const rows = data[name] ?? [];
        const cols = columnsOf(db, name);
        if (rows.length) {
          db.runMany(
            `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            rows.map((r) => cols.map((c) => toLocal(c, r[c]))),
          );
        }
        const start = ids[name];
        if (typeof start === 'number') {
          db.run('DELETE FROM sqlite_sequence WHERE name = ?', [name]);
          db.run('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [name, start - 1]);
        }
      }
      db.run('DELETE FROM _sync_changes');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  setTracking(db, true);
}

/**
 * Artımlı indirme: sunucuda son indirmeden beri değişen satırları ve silinenleri yerel veriye işler.
 * Yerelde zaten aynısı olan satırlar sayılmaz; gerçekten değişen satır sayısını döndürür
 * (0 ise ekranın yenilenmesine gerek yoktur — ör. kendi gönderdiğimiz değişikliğin geri gelmesi).
 */
export function applyIncremental(db: Db, data: Snapshot, deletes: { t: string; pk: string }[]): number {
  let changed = 0;
  setTracking(db, false);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      for (const d of deletes) {
        const def = SYNC_TABLES.find((t) => t.name === d.t);
        if (!def) continue;
        db.run(`DELETE FROM ${def.name} WHERE CAST(${def.pk} AS TEXT) = ?`, [String(d.pk)]);
        changed += db.get<{ n: number }>('SELECT changes() AS n')!.n;
      }
      for (const { name, pk } of SYNC_TABLES) {
        const rows = data[name];
        if (!rows?.length) continue;
        const cols = columnsOf(db, name);
        const updates = cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`).join(', ');
        const sql = `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(${pk}) DO ${updates ? `UPDATE SET ${updates}` : 'NOTHING'}`;
        for (const r of rows) {
          const values = cols.map((c) => toLocal(c, r[c]));
          const cur = db.get<Row>(`SELECT * FROM ${name} WHERE ${pk} = ?`, [values[cols.indexOf(pk)]]);
          if (cur && cols.every((c, i) => (cur[c] ?? null) === values[i])) continue;
          db.run(sql, values);
          changed += 1;
        }
      }
      db.run('DELETE FROM _sync_changes');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    setTracking(db, true);
  }
  return changed;
}

/** Son gönderimden beri değişen satırların şu anki hâli; değişiklik yoksa null. */
export function collectChanges(db: Db): ChangeSet | null {
  const changed = db.all<{ tbl: string; pk: string }>('SELECT DISTINCT tbl, pk FROM _sync_changes');
  const out: ChangeSet = { deletes: [], upserts: [] };
  for (const { tbl, pk } of changed) {
    const def = SYNC_TABLES.find((t) => t.name === tbl);
    if (!def) continue;
    if (tbl === 'settings' && LOCAL_SETTINGS.includes(pk)) continue;
    const row = db.get<Row>(`SELECT * FROM ${tbl} WHERE CAST(${def.pk} AS TEXT) = ?`, [pk]);
    if (!row) out.deletes.push({ t: tbl, pk });
    else out.upserts.push({ t: tbl, row: rowToServer(tbl, row) });
  }
  return out.deletes.length || out.upserts.length ? out : null;
}

export function clearChanges(db: Db) {
  db.run('DELETE FROM _sync_changes');
}

// Sunucu (Postgres) hatalarının kullanıcıya gösterilecek karşılıkları
const CONSTRAINTS: [RegExp, string][] = [
  [/ux_employees_national_id/, 'Bu T.C. kimlik numarası başka bir çalışanda kayıtlı.'],
  [/employees_employee_no_key|ux_employees_no/, 'Aynı anda başka bir çalışan eklendi; lütfen tekrar deneyin.'],
  [/ux_expense_categories_name/, 'Bu adda bir kategori zaten var.'],
  [/ux_companies_name/, 'Bu adda bir firma zaten var.'],
  [/sites_company_id_name_key/, 'Bu firmada aynı adda bir şantiye zaten var.'],
  [/ux_salary_payment/, 'Bu çalışana bu ay için zaten ödeme kaydı var.'],
  [/ux_daily_report_date_site/, 'Bu gün ve şantiye için zaten bir günlük rapor var.'],
  [/attendance_employee_id_date_key/, 'Bu gün için puantaj az önce başka bir cihazdan girildi; sayfayı yenileyin.'],
];

export function serverErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; details?: string };
  const text = `${e.message ?? ''} ${e.details ?? ''}`;
  if (e.code === '42501' || /row-level security/i.test(text)) return 'Bu işlem için yetkiniz yok. Kayıt, size atanmış bir şantiyeye ait olmalı.';
  if (e.code === '23505') return CONSTRAINTS.find(([re]) => re.test(text))?.[1] ?? 'Aynı kayıt zaten var (başka bir cihazdan eklenmiş olabilir).';
  if (e.code === '23503') return 'Bu kayıt başka kayıtlarda kullanılıyor ya da bağlı olduğu kayıt artık yok. Sayfayı yenileyip tekrar deneyin.';
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(text)) return 'Sunucuya ulaşılamadı; değişiklik kaydedilmedi. İnternet bağlantınızı kontrol edin.';
  return `Sunucu değişikliği kabul etmedi: ${e.message ?? String(err)}`;
}
