// Sürüm kontrollü şema güncellemeleri. Şema sürümü PRAGMA user_version içinde tutulur.
// Yeni bir değişiklik gerektiğinde listenin SONUNA yeni bir migration eklenir;
// mevcut migration'lar asla değiştirilmez.
import type { Db } from './connection';
import { DEFAULT_STATUSES } from '../../shared/attendance';

export interface Migration {
  version: number;
  name: string;
  up: (db: Db) => void;
}

export const DEFAULT_CATEGORIES: { name: string; kind: 'salary' | 'overtime' | 'other' }[] = [
  { name: 'Personel maaşı', kind: 'salary' },
  { name: 'Ek mesai', kind: 'overtime' },
  { name: 'Yemek', kind: 'other' },
  { name: 'Yol ve ulaşım', kind: 'other' },
  { name: 'Yedek parça ve malzeme', kind: 'other' },
  { name: 'Kira', kind: 'other' },
  { name: 'Elektrik ve su', kind: 'other' },
  { name: 'Diğer', kind: 'other' },
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'İlk şema',
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE employees (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_no          TEXT    NOT NULL UNIQUE,
          full_name            TEXT    NOT NULL CHECK (length(trim(full_name)) > 0),
          position             TEXT    NOT NULL CHECK (length(trim(position)) > 0),
          monthly_salary_kurus INTEGER NOT NULL DEFAULT 0 CHECK (monthly_salary_kurus >= 0),
          overtime_rate_kurus  INTEGER NOT NULL DEFAULT 0 CHECK (overtime_rate_kurus >= 0),
          start_date           TEXT,
          status               TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
          phone                TEXT    NOT NULL DEFAULT '',
          notes                TEXT    NOT NULL DEFAULT '',
          created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE expense_categories (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
          kind       TEXT    NOT NULL CHECK (kind IN ('salary', 'overtime', 'other')),
          is_system  INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 100
        );

        CREATE TABLE overtime_records (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
          date              TEXT    NOT NULL,
          start_time        TEXT    NOT NULL,
          end_time          TEXT    NOT NULL,
          break_minutes     INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
          worked_minutes    INTEGER NOT NULL CHECK (worked_minutes > 0),
          hourly_rate_kurus INTEGER NOT NULL CHECK (hourly_rate_kurus >= 0),
          total_kurus       INTEGER NOT NULL CHECK (total_kurus >= 0),
          description       TEXT    NOT NULL DEFAULT '',
          created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX ux_overtime_employee_date_start ON overtime_records(employee_id, date, start_time);
        CREATE INDEX ix_overtime_date ON overtime_records(date);

        CREATE TABLE expenses (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          date          TEXT    NOT NULL,
          name          TEXT    NOT NULL,
          category_id   INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
          amount_kurus  INTEGER NOT NULL CHECK (amount_kurus >= 0),
          is_paid       INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0, 1)),
          description   TEXT    NOT NULL DEFAULT '',
          employee_id   INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
          salary_period TEXT,
          created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          CHECK (salary_period IS NULL OR employee_id IS NOT NULL)
        );
        -- Aynı çalışana aynı ay için ikinci bir maaş ödemesi kaydı açılamaz.
        CREATE UNIQUE INDEX ux_salary_payment ON expenses(employee_id, salary_period) WHERE salary_period IS NOT NULL;
        CREATE INDEX ix_expenses_date ON expenses(date);
        CREATE INDEX ix_expenses_category ON expenses(category_id);

        CREATE TABLE activity_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          entity     TEXT    NOT NULL,
          entity_id  INTEGER,
          action     TEXT    NOT NULL,
          summary    TEXT    NOT NULL
        );
      `);
      DEFAULT_CATEGORIES.forEach((c, i) => {
        db.run('INSERT INTO expense_categories (name, kind, is_system, sort_order) VALUES (?, ?, 1, ?)', [c.name, c.kind, i + 1]);
      });
      const defaults: [string, string][] = [
        ['companyName', 'Firmam'],
        ['appName', 'Puanto'],
        ['currency', 'TRY'],
      ];
      for (const [k, v] of defaults) db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    },
  },
  {
    version: 2,
    name: 'Firmalar, şantiyeler, günlük raporlar ve ek çalışan bilgileri',
    up: (db) => {
      db.exec(`
        CREATE TABLE companies (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
          tax_office TEXT    NOT NULL DEFAULT '',
          tax_no     TEXT    NOT NULL DEFAULT '',
          phone      TEXT    NOT NULL DEFAULT '',
          address    TEXT    NOT NULL DEFAULT '',
          notes      TEXT    NOT NULL DEFAULT '',
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sites (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
          name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
          address    TEXT    NOT NULL DEFAULT '',
          start_date TEXT,
          end_date   TEXT,
          status     TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
          notes      TEXT    NOT NULL DEFAULT '',
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (company_id, name)
        );

        -- Çalışanın şu an bağlı olduğu şantiye ve ek kişisel bilgiler
        ALTER TABLE employees ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;
        ALTER TABLE employees ADD COLUMN national_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN iban TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN bank_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN birth_date TEXT;
        ALTER TABLE employees ADD COLUMN address TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN blood_type TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN emergency_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN emergency_phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE employees ADD COLUMN sgk_no TEXT NOT NULL DEFAULT '';
        CREATE UNIQUE INDEX ux_employees_national_id ON employees(national_id) WHERE national_id <> '';
        CREATE INDEX ix_employees_site ON employees(site_id);

        -- Mesai ve gider kayıtlarının hangi şantiyeye ait olduğu (kayıt anındaki şantiye)
        ALTER TABLE overtime_records ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE RESTRICT;
        ALTER TABLE expenses ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE RESTRICT;
        CREATE INDEX ix_overtime_site ON overtime_records(site_id);
        CREATE INDEX ix_expenses_site ON expenses(site_id);

        -- Günlük rapor: bir gün için şantiye bazında (veya genel) tek rapor
        CREATE TABLE daily_reports (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          date       TEXT    NOT NULL,
          site_id    INTEGER REFERENCES sites(id) ON DELETE RESTRICT,
          weather    TEXT    NOT NULL DEFAULT '',
          work_done  TEXT    NOT NULL DEFAULT '',
          notes      TEXT    NOT NULL DEFAULT '',
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX ux_daily_report_date_site ON daily_reports(date, IFNULL(site_id, 0));
      `);
      // Mevcut şirket adıyla bir "ana firma" kaydı açılır (kullanıcı sonradan değiştirebilir).
      const company = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'companyName'`)?.value || 'Firmam';
      db.run('INSERT INTO companies (name) VALUES (?)', [company]);
    },
  },
  {
    version: 3,
    name: 'Puantaj',
    up: (db) => {
      db.exec(`
        -- Puantaj: her çalışan için günde tek kayıt (çalıştı, yarım gün, izin, rapor ...)
        CREATE TABLE attendance (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
          date        TEXT    NOT NULL,
          status      TEXT    NOT NULL CHECK (status IN ('X', 'Y', 'I', 'U', 'R', 'D', 'T', 'H')),
          site_id     INTEGER REFERENCES sites(id) ON DELETE RESTRICT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, date)
        );
        CREATE INDEX ix_attendance_date ON attendance(date);
        CREATE INDEX ix_attendance_site ON attendance(site_id);
      `);
    },
  },
  {
    version: 4,
    name: 'Bordro kayıtları',
    up: (db) => {
      db.exec(`
        -- Kaydedilen (kilitlenen) aylık bordro. Bağlı maaş ödemesi gideri silinirse bordro kaydı da silinir.
        CREATE TABLE payrolls (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
          period               TEXT    NOT NULL,
          expense_id           INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
          paid_half_days       INTEGER NOT NULL CHECK (paid_half_days BETWEEN 0 AND 60),
          monthly_salary_kurus INTEGER NOT NULL,
          normal_kurus         INTEGER NOT NULL CHECK (normal_kurus >= 0),
          overtime_minutes     INTEGER NOT NULL DEFAULT 0,
          overtime_kurus       INTEGER NOT NULL CHECK (overtime_kurus >= 0),
          total_kurus          INTEGER NOT NULL CHECK (total_kurus >= 0),
          official_kurus       INTEGER NOT NULL CHECK (official_kurus >= 0),
          cash_kurus           INTEGER NOT NULL CHECK (cash_kurus >= 0),
          daily_min_wage_kurus INTEGER NOT NULL DEFAULT 0,
          created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, period)
        );
      `);
    },
  },
  {
    version: 5,
    name: 'Düzenlenebilir puantaj fırçaları, bordroda mesai ödemesi',
    up: (db) => {
      db.exec(`
        CREATE TABLE attendance_statuses (
          code        TEXT    PRIMARY KEY,
          short       TEXT    NOT NULL CHECK (length(trim(short)) BETWEEN 1 AND 4),
          label       TEXT    NOT NULL CHECK (length(trim(label)) > 0),
          color       TEXT    NOT NULL,
          paid_half   INTEGER NOT NULL CHECK (paid_half IN (0, 1, 2)),
          worked_half INTEGER NOT NULL CHECK (worked_half IN (0, 1, 2)),
          is_system   INTEGER NOT NULL DEFAULT 0,
          sort_order  INTEGER NOT NULL DEFAULT 100
        );
      `);
      for (const st of DEFAULT_STATUSES) {
        db.run('INSERT INTO attendance_statuses (code, short, label, color, paid_half, worked_half, is_system, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
          [st.code, st.short, st.label, st.color, st.paidHalf, st.workedHalf, st.sortOrder]);
      }
      // Puantaj tablosu, sabit durum listesi yerine fırça tablosuna bağlanacak şekilde yeniden kurulur (veriler korunur).
      db.exec(`
        CREATE TABLE attendance_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
          date        TEXT    NOT NULL,
          status      TEXT    NOT NULL REFERENCES attendance_statuses(code) ON DELETE RESTRICT,
          site_id     INTEGER REFERENCES sites(id) ON DELETE RESTRICT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, date)
        );
        INSERT INTO attendance_new (id, employee_id, date, status, site_id, created_at, updated_at)
          SELECT id, employee_id, date, status, site_id, created_at, updated_at FROM attendance;
        DROP TABLE attendance;
        ALTER TABLE attendance_new RENAME TO attendance;
        CREATE INDEX ix_attendance_date ON attendance(date);
        CREATE INDEX ix_attendance_site ON attendance(site_id);
        CREATE INDEX ix_attendance_status ON attendance(status);

        -- Bordro: ücretli gün artık işaretlenen günlerden gelir (31'e kadar), mesai ödemesi ayrı gider kaydıdır.
        CREATE TABLE payrolls_new (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
          period               TEXT    NOT NULL,
          expense_id           INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
          overtime_expense_id  INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
          paid_half_days       INTEGER NOT NULL CHECK (paid_half_days BETWEEN 0 AND 62),
          monthly_salary_kurus INTEGER NOT NULL,
          normal_kurus         INTEGER NOT NULL CHECK (normal_kurus >= 0),
          overtime_minutes     INTEGER NOT NULL DEFAULT 0,
          overtime_kurus       INTEGER NOT NULL CHECK (overtime_kurus >= 0),
          total_kurus          INTEGER NOT NULL CHECK (total_kurus >= 0),
          official_kurus       INTEGER NOT NULL CHECK (official_kurus >= 0),
          cash_kurus           INTEGER NOT NULL CHECK (cash_kurus >= 0),
          daily_min_wage_kurus INTEGER NOT NULL DEFAULT 0,
          created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, period)
        );
        INSERT INTO payrolls_new (id, employee_id, period, expense_id, paid_half_days, monthly_salary_kurus, normal_kurus, overtime_minutes,
            overtime_kurus, total_kurus, official_kurus, cash_kurus, daily_min_wage_kurus, created_at)
          SELECT id, employee_id, period, expense_id, paid_half_days, monthly_salary_kurus, normal_kurus, overtime_minutes,
            overtime_kurus, total_kurus, official_kurus, cash_kurus, daily_min_wage_kurus, created_at FROM payrolls;
        DROP TABLE payrolls;
        ALTER TABLE payrolls_new RENAME TO payrolls;
      `);
    },
  },
  {
    version: 6,
    name: 'Kira ve Elektrik ve su kategorileri kaldırıldı; kategoriler düzenlenebilir',
    up: (db) => {
      // "Diğer" yoksa oluştur (bu iki kategorinin giderleri oraya taşınır, kayıt kaybolmaz)
      let other = db.get<{ id: number }>(`SELECT id FROM expense_categories WHERE name = 'Diğer'`)?.id;
      if (!other) other = db.run(`INSERT INTO expense_categories (name, kind, is_system, sort_order) VALUES ('Diğer', 'other', 0, 100)`).lastId;
      for (const name of ['Kira', 'Elektrik ve su']) {
        const c = db.get<{ id: number }>('SELECT id FROM expense_categories WHERE name = ? AND is_system = 1', [name]);
        if (!c) continue;
        db.run(`UPDATE expenses SET category_id = ?, updated_at = datetime('now') WHERE category_id = ?`, [other, c.id]);
        db.run('DELETE FROM expense_categories WHERE id = ?', [c.id]);
      }
      // Yalnızca bordronun kullandığı "Personel maaşı" ve "Ek mesai" korumalı kalır; diğerleri düzenlenip silinebilir.
      db.run(`UPDATE expense_categories SET is_system = CASE WHEN is_system = 1 AND kind IN ('salary', 'overtime') THEN 1 ELSE 0 END`);
    },
  },
  {
    version: 7,
    name: 'Kan grubu (özel nitelikli veri) artık tutulmuyor; mevcut değerler silindi',
    up: (db) => {
      db.run(`UPDATE employees SET blood_type = '', updated_at = datetime('now') WHERE blood_type <> ''`);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function getSchemaVersion(db: Db): number {
  return Number(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

/** Bekleyen migration'ları sırayla uygular. Her biri ayrı bir işlem içinde çalışır. */
export function migrate(db: Db): number {
  let current = getSchemaVersion(db);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Veritabanı bu uygulama sürümünden daha yeni (şema ${current}). Lütfen Puanto'nun güncel sürümünü kullanın.`,
    );
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.tx(() => {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}
