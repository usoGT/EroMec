import type { BulkOvertimeInput, BulkOvertimeResult, CreateResult, OvertimeFilter, OvertimeInput, OvertimeRecord, OvertimeTotals } from '../../shared/types';
import { calculateOvertime, normalizeTime, formatMinutes } from '../../shared/overtime';
import { dayRange, formatDate, isValidIsoDate, monthRange, weekRange } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import type { Db, Params } from './connection';
import { logActivity } from './activity';
import { fail, id, isoDate, kurus, text, UserError } from './validation';
import { optionalSiteId, siteCondition } from './sites';

const SELECT = `
  SELECT o.id, o.employee_id AS employeeId, e.full_name AS employeeName,
         o.site_id AS siteId, s.name AS siteName, o.date,
         o.start_time AS startTime, o.end_time AS endTime, o.break_minutes AS breakMinutes,
         o.worked_minutes AS workedMinutes, o.hourly_rate_kurus AS hourlyRateKurus,
         o.total_kurus AS totalKurus, o.description, o.created_at AS createdAt
  FROM overtime_records o JOIN employees e ON e.id = o.employee_id
  LEFT JOIN sites s ON s.id = o.site_id`;

function whereClause(f: OvertimeFilter): { sql: string; params: Params } {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (f?.from && isValidIsoDate(f.from)) { parts.push('o.date >= ?'); params.push(f.from); }
  if (f?.to && isValidIsoDate(f.to)) { parts.push('o.date <= ?'); params.push(f.to); }
  if (f?.employeeId) { parts.push('o.employee_id = ?'); params.push(Number(f.employeeId)); }
  const sc = siteCondition('o', f);
  if (sc) { parts.push(sc.sql); params.push(...sc.params); }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

export function listOvertime(db: Db, filter: OvertimeFilter): OvertimeRecord[] {
  const w = whereClause(filter);
  return db.all<OvertimeRecord>(`${SELECT}${w.sql} ORDER BY o.date DESC, o.start_time DESC, o.id DESC`, w.params);
}

export function getOvertime(db: Db, recordId: number): OvertimeRecord {
  const r = db.get<OvertimeRecord>(`${SELECT} WHERE o.id = ?`, [id(recordId)]);
  if (!r) fail('Mesai kaydı bulunamadı.');
  return r;
}

function sumRange(db: Db, f: OvertimeFilter): { minutes: number; kurus: number } {
  const w = whereClause(f);
  const r = db.get<{ m: number; k: number }>(
    `SELECT COALESCE(SUM(o.worked_minutes),0) AS m, COALESCE(SUM(o.total_kurus),0) AS k FROM overtime_records o${w.sql}`,
    w.params,
  )!;
  return { minutes: r.m, kurus: r.k };
}

export function overtimeTotals(db: Db, today: string, filter: OvertimeFilter): OvertimeTotals {
  const t = isoDate(today, 'Tarih');
  const emp = { employeeId: filter?.employeeId, siteId: filter?.siteId, companyId: filter?.companyId };
  const day = sumRange(db, { ...dayRange(t), ...emp });
  const week = sumRange(db, { ...weekRange(t), ...emp });
  const month = sumRange(db, { ...monthRange(t), ...emp });
  const filtered = sumRange(db, filter ?? {});
  return {
    dayMinutes: day.minutes, dayKurus: day.kurus,
    weekMinutes: week.minutes, weekKurus: week.kurus,
    monthMinutes: month.minutes, monthKurus: month.kurus,
    filteredMinutes: filtered.minutes, filteredKurus: filtered.kurus,
  };
}

function validate(db: Db, input: OvertimeInput) {
  if (!input || typeof input !== 'object') fail('Mesai bilgileri eksik.');
  const employeeId = id(input.employeeId, 'Çalışan');
  const emp = db.get<{ site_id: number | null }>('SELECT site_id FROM employees WHERE id = ?', [employeeId]);
  if (!emp) fail('Seçilen çalışan bulunamadı.');
  // Şantiye verilmediyse çalışanın bağlı olduğu şantiye kaydedilir.
  const siteId = input.siteId === undefined ? emp.site_id : optionalSiteId(db, input.siteId);
  const date = isoDate(input.date, 'Tarih');
  const startTime = normalizeTime(String(input.startTime ?? ''));
  const endTime = normalizeTime(String(input.endTime ?? ''));
  if (!startTime) fail('Başlangıç saati geçersiz. Örnek: 18:00');
  if (!endTime) fail('Bitiş saati geçersiz. Örnek: 21:30');
  const breakMinutes = Number(input.breakMinutes ?? 0);
  const hourlyRateKurus = kurus(input.hourlyRateKurus, 'Saatlik mesai ücreti');
  let calc;
  try {
    calc = calculateOvertime({ startTime, endTime, breakMinutes, hourlyRateKurus });
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  return { employeeId, siteId, date, startTime, endTime, breakMinutes, hourlyRateKurus, description: text(input.description, 500), ...calc };
}

function uniqueMessage(err: unknown): never {
  if (String((err as Error)?.message).includes('UNIQUE')) {
    fail('Bu çalışan için aynı tarih ve başlangıç saatinde bir mesai kaydı zaten var.');
  }
  throw err;
}

export function createOvertime(db: Db, raw: OvertimeInput, force = false): CreateResult<OvertimeRecord> {
  const v = validate(db, raw);
  if (!force) {
    // Aynı gün çakışan saatler için uyarı (aynı başlangıç saati zaten tamamen engellenir).
    const sameDay = db.all<{ start_time: string; end_time: string }>(
      'SELECT start_time, end_time FROM overtime_records WHERE employee_id = ? AND date = ?',
      [v.employeeId, v.date],
    );
    if (sameDay.length > 0 && !sameDay.some((r) => r.start_time === v.startTime)) {
      const list = sameDay.map((r) => `${r.start_time}-${r.end_time}`).join(', ');
      return { duplicate: `Bu çalışanın ${formatDate(v.date)} tarihinde zaten mesai kaydı var (${list}). Yine de eklensin mi?` };
    }
  }
  try {
    const newId = db.tx(() => {
      const { lastId } = db.run(
        `INSERT INTO overtime_records (employee_id, site_id, date, start_time, end_time, break_minutes, worked_minutes, hourly_rate_kurus, total_kurus, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.employeeId, v.siteId, v.date, v.startTime, v.endTime, v.breakMinutes, v.workedMinutes, v.hourlyRateKurus, v.totalKurus, v.description],
      );
      const name = db.get<{ n: string }>('SELECT full_name AS n FROM employees WHERE id = ?', [v.employeeId])!.n;
      logActivity(db, 'overtime', lastId, 'create',
        `Mesai eklendi: ${name}, ${formatDate(v.date)}, ${formatMinutes(v.workedMinutes)}, ${formatMoney(v.totalKurus)}`);
      return lastId;
    });
    return { item: getOvertime(db, newId) };
  } catch (err) {
    uniqueMessage(err);
  }
}

export function updateOvertime(db: Db, recordId: number, raw: OvertimeInput): OvertimeRecord {
  const existing = getOvertime(db, recordId);
  const v = validate(db, raw);
  try {
    db.tx(() => {
      db.run(
        `UPDATE overtime_records SET employee_id = ?, site_id = ?, date = ?, start_time = ?, end_time = ?, break_minutes = ?,
           worked_minutes = ?, hourly_rate_kurus = ?, total_kurus = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
        [v.employeeId, v.siteId, v.date, v.startTime, v.endTime, v.breakMinutes, v.workedMinutes, v.hourlyRateKurus, v.totalKurus, v.description, existing.id],
      );
      logActivity(db, 'overtime', existing.id, 'update', `Mesai güncellendi: ${existing.employeeName}, ${formatDate(v.date)}`);
    });
  } catch (err) {
    uniqueMessage(err);
  }
  return getOvertime(db, existing.id);
}

export function deleteOvertime(db: Db, recordId: number) {
  const r = getOvertime(db, recordId);
  db.tx(() => {
    db.run('DELETE FROM overtime_records WHERE id = ?', [r.id]);
    logActivity(db, 'overtime', r.id, 'delete', `Mesai silindi: ${r.employeeName}, ${formatDate(r.date)}`);
  });
}

/**
 * Toplu mesai: aynı tarih ve saatlerde seçilen bütün çalışanlara tek işlemde mesai yazar.
 * Aynı çalışan + tarih + başlangıç saatinde zaten kaydı olanlar atlanır ve listede bildirilir.
 * Bütün kayıtlar tek bir veritabanı işleminde eklenir (ya hepsi ya hiçbiri).
 */
export function createOvertimeBulk(db: Db, input: BulkOvertimeInput): BulkOvertimeResult {
  if (!input || typeof input !== 'object') fail('Toplu mesai bilgileri eksik.');
  if (!Array.isArray(input.entries) || input.entries.length === 0) fail('En az bir çalışan seçin.');
  if (input.entries.length > 500) fail('Tek seferde en fazla 500 çalışana mesai yazılabilir.');
  const siteId = optionalSiteId(db, input.siteId);
  const seen = new Set<number>();
  const prepared = input.entries.map((e) => {
    if (seen.has(e?.employeeId)) fail('Aynı çalışan listede iki kez seçilmiş.');
    seen.add(e?.employeeId);
    return validate(db, {
      employeeId: e?.employeeId, siteId, date: input.date, startTime: input.startTime, endTime: input.endTime,
      breakMinutes: input.breakMinutes, hourlyRateKurus: e?.hourlyRateKurus, description: input.description,
    });
  });
  const result: BulkOvertimeResult = { created: 0, totalKurus: 0, skipped: [] };
  db.tx(() => {
    for (const v of prepared) {
      const name = db.get<{ n: string }>('SELECT full_name AS n FROM employees WHERE id = ?', [v.employeeId])!.n;
      if (db.get('SELECT 1 FROM overtime_records WHERE employee_id = ? AND date = ? AND start_time = ?', [v.employeeId, v.date, v.startTime])) {
        result.skipped.push({ employeeName: name, reason: `${formatDate(v.date)} ${v.startTime} için zaten mesai kaydı var` });
        continue;
      }
      db.run(
        `INSERT INTO overtime_records (employee_id, site_id, date, start_time, end_time, break_minutes, worked_minutes, hourly_rate_kurus, total_kurus, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.employeeId, v.siteId, v.date, v.startTime, v.endTime, v.breakMinutes, v.workedMinutes, v.hourlyRateKurus, v.totalKurus, v.description],
      );
      result.created++;
      result.totalKurus += v.totalKurus;
    }
    if (result.created > 0) {
      const site = siteId ? db.get<{ name: string }>('SELECT name FROM sites WHERE id = ?', [siteId])!.name : 'şantiyesiz';
      logActivity(db, 'overtime', null, 'create',
        `Toplu mesai: ${result.created} çalışan, ${site}, ${formatDate(prepared[0].date)} ${prepared[0].startTime}-${prepared[0].endTime}, ${formatMoney(result.totalKurus)}`);
    }
  });
  return result;
}
