// Puantaj: çalışan × gün tablosu.
import type { AttendanceEntry, AttendanceMonth, AttendanceRow, SiteFilter } from '../../shared/types';
import type { AttendanceStatus, StatusDef } from '../../shared/attendance';
import type { StatusInput } from '../../shared/types';
import { addDays, formatPeriod, monthRange, parseIsoDate, todayIso } from '../../shared/dates';
import type { Db } from './connection';
import { logActivity } from './activity';
import { optionalSiteId, siteCondition } from './sites';
import { fail, id, isoDate, requiredText, trKey } from './validation';
import { getSettings } from './settings';

function monthDays(month: string): string[] {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Ay seçimi geçersiz.');
  const { from, to } = monthRange(`${month}-01`);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Seçilen ayın puantajı. Listede: kapsamdaki aktif çalışanlar + o ay kapsamda puantaj kaydı olan herkes
 * (sonradan ayrılan veya başka şantiyeye geçen çalışanlar da geçmiş aylarda görünür).
 */
export function attendanceMonth(db: Db, month: string, filter?: SiteFilter): AttendanceMonth {
  const days = monthDays(month);
  const from = days[0];
  const to = days[days.length - 1];
  const ec = siteCondition('e', filter);
  const ac = siteCondition('a', filter);
  const oc = siteCondition('o', filter);

  const rows = db.all<Omit<AttendanceRow, 'cells' | 'overtime' | 'overtimeMinutes' | 'overtimeKurus'>>(
    `SELECT e.id AS employeeId, e.employee_no AS employeeNo, e.full_name AS fullName, e.position,
            e.monthly_salary_kurus AS monthlySalaryKurus,
            e.national_id AS nationalId, e.status, e.site_id AS siteId, s.name AS siteName, c.name AS companyName
     FROM employees e LEFT JOIN sites s ON s.id = e.site_id LEFT JOIN companies c ON c.id = s.company_id
     WHERE (e.status = 'active'${ec ? ` AND ${ec.sql}` : ''})
        OR e.id IN (SELECT a.employee_id FROM attendance a WHERE a.date >= ? AND a.date <= ?${ac ? ` AND ${ac.sql}` : ''})
        OR e.id IN (SELECT o.employee_id FROM overtime_records o WHERE o.date >= ? AND o.date <= ?${oc ? ` AND ${oc.sql}` : ''})
     ORDER BY s.name IS NULL, s.name COLLATE NOCASE, e.full_name COLLATE NOCASE`,
    [...(ec?.params ?? []), from, to, ...(ac?.params ?? []), from, to, ...(oc?.params ?? [])],
  );
  const byId = new Map<number, AttendanceRow>(rows.map((r) => [r.employeeId, { ...r, cells: {}, overtime: {}, overtimeMinutes: 0, overtimeKurus: 0 }]));

  for (const a of db.all<{ employee_id: number; date: string; status: AttendanceStatus }>(
    `SELECT a.employee_id, a.date, a.status FROM attendance a WHERE a.date >= ? AND a.date <= ?${ac ? ` AND ${ac.sql}` : ''}`,
    [from, to, ...(ac?.params ?? [])],
  )) {
    const row = byId.get(a.employee_id);
    if (row) row.cells[a.date] = a.status;
  }
  // Günlük mesai süreleri ve aylık mesai toplamları (Mesailer bölümündeki kayıtlardan)
  for (const o of db.all<{ employee_id: number; date: string; m: number; k: number }>(
    `SELECT o.employee_id, o.date, SUM(o.worked_minutes) AS m, SUM(o.total_kurus) AS k FROM overtime_records o
     WHERE o.date >= ? AND o.date <= ?${oc ? ` AND ${oc.sql}` : ''} GROUP BY o.employee_id, o.date`,
    [from, to, ...(oc?.params ?? [])],
  )) {
    const row = byId.get(o.employee_id);
    if (!row) continue;
    row.overtime[o.date] = o.m;
    row.overtimeMinutes += o.m;
    row.overtimeKurus += o.k;
  }
  return { month, days, rows: [...byId.values()], dailyMinWageKurus: getSettings(db).dailyMinWageKurus, statuses: listStatuses(db) };
}

/** Puantaj kaydının yazılacağı şantiye: verildiyse o, yoksa çalışanın şu anki şantiyesi. */
function siteFor(db: Db, employeeId: number, siteId: number | null | undefined): number | null {
  if (siteId !== undefined) return optionalSiteId(db, siteId);
  return db.get<{ site_id: number | null }>('SELECT site_id FROM employees WHERE id = ?', [employeeId])?.site_id ?? null;
}

/** Hücreleri toplu yazar veya temizler. Hepsi tek veritabanı işleminde yapılır. */
export function setAttendance(db: Db, entries: AttendanceEntry[], siteId?: number | null): { changed: number } {
  if (!Array.isArray(entries) || entries.length === 0) fail('Değiştirilecek hücre yok.');
  if (entries.length > 20000) fail('Tek seferde çok fazla hücre değiştirilemez.');
  const known = new Set(listStatuses(db).map((s) => s.code));
  const checked = entries.map((e) => {
    const employeeId = id(e?.employeeId, 'Çalışan');
    const date = isoDate(e?.date, 'Tarih');
    if (e.status !== null && !known.has(e.status)) fail('Geçersiz puantaj durumu.');
    return { employeeId, date, status: e.status };
  });
  const knownEmp = new Set(db.all<{ id: number }>('SELECT id FROM employees').map((r) => r.id));
  if (checked.some((e) => !knownEmp.has(e.employeeId))) fail('Seçilen çalışanlardan biri bulunamadı.');
  let changed = 0;
  db.tx(() => {
    for (const e of checked) {
      if (e.status === null) {
        changed += db.run('DELETE FROM attendance WHERE employee_id = ? AND date = ?', [e.employeeId, e.date]).changes;
      } else {
        db.run(
          `INSERT INTO attendance (employee_id, date, status, site_id) VALUES (?, ?, ?, ?)
           ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, site_id = excluded.site_id, updated_at = datetime('now')`,
          [e.employeeId, e.date, e.status, siteFor(db, e.employeeId, siteId)],
        );
        changed++;
      }
    }
    const months = [...new Set(checked.map((e) => e.date.slice(0, 7)))].map(formatPeriod).join(', ');
    logActivity(db, 'attendance', null, 'update', `Puantaj güncellendi: ${changed} hücre (${months})`);
  });
  return { changed };
}

/**
 * Boş hücreleri doldurur: pazartesi–cuma (ve isteğe bağlı cumartesi) "Çalıştı", diğer günler "Hafta tatili".
 * Dolu hücrelere dokunmaz; çalışanın işe başlama tarihinden önceki günler atlanır.
 */
export function fillAttendance(
  db: Db,
  args: { month: string; employeeIds: number[]; workSaturday: boolean; untilToday: boolean; siteId?: number | null; today?: string },
): { changed: number } {
  const days = monthDays(args?.month);
  if (!Array.isArray(args.employeeIds) || args.employeeIds.length === 0) fail('Doldurulacak çalışan yok.');
  const today = args.today ? isoDate(args.today, 'Tarih') : todayIso();
  const entries: AttendanceEntry[] = [];
  for (const employeeIdRaw of args.employeeIds) {
    const employeeId = id(employeeIdRaw, 'Çalışan');
    const emp = db.get<{ start_date: string | null }>('SELECT start_date FROM employees WHERE id = ?', [employeeId]);
    if (!emp) fail('Seçilen çalışanlardan biri bulunamadı.');
    const filled = new Set(
      db.all<{ date: string }>('SELECT date FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?', [employeeId, days[0], days[days.length - 1]]).map((r) => r.date),
    );
    for (const d of days) {
      if (filled.has(d) || (args.untilToday && d > today) || (emp.start_date && d < emp.start_date)) continue;
      const dow = parseIsoDate(d).getDay();
      const work = dow >= 1 && dow <= 5 ? true : dow === 6 ? args.workSaturday : false;
      entries.push({ employeeId, date: d, status: work ? 'X' : 'H' });
    }
  }
  if (entries.length === 0) return { changed: 0 };
  return setAttendance(db, entries, args.siteId);
}

// ---------- Puantaj fırçaları (düzenlenebilir durumlar) ----------

export function listStatuses(db: Db): StatusDef[] {
  return db.all<Omit<StatusDef, 'isSystem'> & { isSystem: number }>(
    `SELECT code, short, label, color, paid_half AS paidHalf, worked_half AS workedHalf, is_system AS isSystem, sort_order AS sortOrder
     FROM attendance_statuses ORDER BY sort_order, code`,
  ).map((s) => ({ ...s, isSystem: s.isSystem === 1 }));
}

function validateStatus(db: Db, input: StatusInput, selfCode?: string) {
  if (!input || typeof input !== 'object') fail('Fırça bilgileri eksik.');
  const short = requiredText(input.short, 'Hücre yazısı', 4);
  const label = requiredText(input.label, 'Fırça adı', 40);
  const color = String(input.color ?? '');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail('Renk geçersiz.');
  const paidHalf = Number(input.paidHalf);
  const workedHalf = Number(input.workedHalf);
  if (![0, 1, 2].includes(paidHalf) || ![0, 1, 2].includes(workedHalf)) fail('Gün değeri geçersiz.');
  const other = listStatuses(db).find((s) => s.code !== selfCode && trKey(s.short) === trKey(short));
  if (other) fail(`"${short}" yazısı zaten "${other.label}" fırçasında kullanılıyor.`);
  return { short, label, color: color.toLowerCase(), paidHalf, workedHalf };
}

/** Fırçayı günceller (code verilirse) veya yeni fırça ekler. */
export function saveStatus(db: Db, code: string | undefined, input: StatusInput): StatusDef {
  const v = validateStatus(db, input, code);
  const savedCode = db.tx(() => {
    if (code) {
      const r = db.run('UPDATE attendance_statuses SET short = ?, label = ?, color = ?, paid_half = ?, worked_half = ? WHERE code = ?',
        [v.short, v.label, v.color, v.paidHalf, v.workedHalf, code]);
      if (r.changes === 0) fail('Fırça bulunamadı.');
      logActivity(db, 'attendance', null, 'update', `Puantaj fırçası güncellendi: ${v.label} (${v.short})`);
      return code;
    }
    const n = db.get<{ n: number }>(`SELECT COALESCE(MAX(CAST(substr(code, 2) AS INTEGER)), 0) + 1 AS n FROM attendance_statuses WHERE code GLOB 'C[0-9]*'`)!.n;
    const newCode = `C${n}`;
    const order = db.get<{ o: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS o FROM attendance_statuses')!.o;
    db.run('INSERT INTO attendance_statuses (code, short, label, color, paid_half, worked_half, is_system, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [newCode, v.short, v.label, v.color, v.paidHalf, v.workedHalf, order]);
    logActivity(db, 'attendance', null, 'create', `Puantaj fırçası eklendi: ${v.label} (${v.short})`);
    return newCode;
  });
  return listStatuses(db).find((s) => s.code === savedCode)!;
}

/** Yalnızca sonradan eklenen ve hiçbir puantaj hücresinde kullanılmayan fırça silinebilir. */
export function deleteStatus(db: Db, code: string) {
  const st = listStatuses(db).find((s) => s.code === code);
  if (!st) fail('Fırça bulunamadı.');
  if (st.isSystem) fail('Başlangıç fırçaları silinemez; adını, yazısını ve rengini değiştirebilirsiniz.');
  const used = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM attendance WHERE status = ?', [code])!.c;
  if (used > 0) fail(`"${st.label}" fırçası ${used} puantaj hücresinde kullanılıyor; önce o hücreleri değiştirin.`);
  db.tx(() => {
    db.run('DELETE FROM attendance_statuses WHERE code = ?', [code]);
    logActivity(db, 'attendance', null, 'delete', `Puantaj fırçası silindi: ${st.label}`);
  });
}
