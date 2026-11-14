// Takvim görünümü ve günlük raporlar.
import type { CalendarDay, DailyReport, DailyReportInput, DayDetail, SiteFilter } from '../../shared/types';
import { formatDate } from '../../shared/dates';
import type { Db } from './connection';
import { logActivity } from './activity';
import { listOvertime } from './overtime';
import { listExpenses } from './expenses';
import { summary } from './reports';
import { optionalSiteId, siteCondition } from './sites';
import { fail, id, isoDate, text } from './validation';

/** Tarih aralığındaki her gün için mesai, gider ve rapor özetini döner (yalnızca kaydı olan günler). */
export function calendarMonth(db: Db, fromRaw: string, toRaw: string, filter?: SiteFilter): CalendarDay[] {
  const from = isoDate(fromRaw, 'Başlangıç tarihi');
  const to = isoDate(toRaw, 'Bitiş tarihi');
  if (to < from) fail('Tarih aralığı geçersiz.');
  const days = new Map<string, CalendarDay>();
  const day = (d: string) => {
    let x = days.get(d);
    if (!x) {
      x = { date: d, overtimeMinutes: 0, overtimeKurus: 0, overtimeCount: 0, expenseKurus: 0, expenseCount: 0, reportCount: 0 };
      days.set(d, x);
    }
    return x;
  };
  const q = (alias: string) => {
    const c = siteCondition(alias, filter);
    return { sql: c ? ` AND ${c.sql}` : '', params: [from, to, ...(c?.params ?? [])] };
  };
  const o = q('o');
  for (const r of db.all<{ date: string; m: number; k: number; c: number }>(
    `SELECT o.date, SUM(o.worked_minutes) AS m, SUM(o.total_kurus) AS k, COUNT(*) AS c
     FROM overtime_records o WHERE o.date >= ? AND o.date <= ?${o.sql} GROUP BY o.date`, o.params)) {
    Object.assign(day(r.date), { overtimeMinutes: r.m, overtimeKurus: r.k, overtimeCount: r.c });
  }
  // Takvimdeki gider tutarı, "Ek mesai" kategorisi hariç tutulur (raporlardaki çift sayım kuralı ile aynı).
  const x = q('x');
  for (const r of db.all<{ date: string; k: number; c: number }>(
    `SELECT x.date, SUM(CASE WHEN c.kind <> 'overtime' THEN x.amount_kurus ELSE 0 END) AS k, COUNT(*) AS c
     FROM expenses x JOIN expense_categories c ON c.id = x.category_id
     WHERE x.date >= ? AND x.date <= ?${x.sql} GROUP BY x.date`, x.params)) {
    Object.assign(day(r.date), { expenseKurus: r.k, expenseCount: r.c });
  }
  const d = q('d');
  for (const r of db.all<{ date: string; c: number }>(
    `SELECT d.date, COUNT(*) AS c FROM daily_reports d WHERE d.date >= ? AND d.date <= ?${d.sql} GROUP BY d.date`, d.params)) {
    day(r.date).reportCount = r.c;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const REPORT_SELECT = `
  SELECT d.id, d.date, d.site_id AS siteId, s.name AS siteName, d.weather, d.work_done AS workDone,
         d.notes, d.updated_at AS updatedAt
  FROM daily_reports d LEFT JOIN sites s ON s.id = d.site_id`;

export function listDailyReports(db: Db, date: string, filter?: SiteFilter): DailyReport[] {
  const c = siteCondition('d', filter);
  return db.all<DailyReport>(
    `${REPORT_SELECT} WHERE d.date = ?${c ? ` AND ${c.sql}` : ''} ORDER BY s.name IS NULL, s.name COLLATE NOCASE`,
    [date, ...(c?.params ?? [])],
  );
}

export function dayDetail(db: Db, dateRaw: string, filter?: SiteFilter): DayDetail {
  const date = isoDate(dateRaw, 'Tarih');
  return {
    date,
    summary: summary(db, date, date, filter),
    overtime: listOvertime(db, { from: date, to: date, ...filter }),
    expenses: listExpenses(db, { from: date, to: date, ...filter }),
    reports: listDailyReports(db, date, filter),
  };
}

/**
 * Günlük raporu kaydeder. Aynı gün + aynı şantiye için zaten rapor varsa o rapor güncellenir
 * (bir şantiyenin bir günde tek raporu olur).
 */
export function saveDailyReport(db: Db, input: DailyReportInput): DailyReport {
  if (!input || typeof input !== 'object') fail('Rapor bilgileri eksik.');
  const date = isoDate(input.date, 'Tarih');
  const siteId = optionalSiteId(db, input.siteId);
  const v = { weather: text(input.weather, 100), workDone: text(input.workDone, 5000), notes: text(input.notes, 5000) };
  if (!v.workDone && !v.notes && !v.weather) fail('Rapor boş olamaz. Yapılan işleri veya notları yazın.');
  const existing = db.get<{ id: number }>('SELECT id FROM daily_reports WHERE date = ? AND IFNULL(site_id, 0) = ?', [date, siteId ?? 0]);
  const siteName = siteId ? db.get<{ name: string }>('SELECT name FROM sites WHERE id = ?', [siteId])!.name : 'Genel';
  const reportId = db.tx(() => {
    if (existing) {
      db.run(`UPDATE daily_reports SET weather = ?, work_done = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [v.weather, v.workDone, v.notes, existing.id]);
      logActivity(db, 'report', existing.id, 'update', `Günlük rapor güncellendi: ${formatDate(date)}, ${siteName}`);
      return existing.id;
    }
    const { lastId } = db.run('INSERT INTO daily_reports (date, site_id, weather, work_done, notes) VALUES (?, ?, ?, ?, ?)',
      [date, siteId, v.weather, v.workDone, v.notes]);
    logActivity(db, 'report', lastId, 'create', `Günlük rapor yazıldı: ${formatDate(date)}, ${siteName}`);
    return lastId;
  });
  return db.get<DailyReport>(`${REPORT_SELECT} WHERE d.id = ?`, [reportId])!;
}

export function deleteDailyReport(db: Db, reportId: number) {
  const r = db.get<DailyReport>(`${REPORT_SELECT} WHERE d.id = ?`, [id(reportId, 'Rapor')]);
  if (!r) fail('Günlük rapor bulunamadı.');
  db.tx(() => {
    db.run('DELETE FROM daily_reports WHERE id = ?', [r.id]);
    logActivity(db, 'report', r.id, 'delete', `Günlük rapor silindi: ${formatDate(r.date)}, ${r.siteName ?? 'Genel'}`);
  });
}
