// Bordro: puantaj ve mesaiden aylık maaş hesabı (normal maaş, mesai parası, toplam, asgari, elden).
import type { PayrollMonth, PayrollRow, PayrollSnapshot, SiteFilter } from '../../shared/types';
import { computePay } from '../../shared/payroll';
import { toStatusMap } from '../../shared/attendance';
import { formatPeriod } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import type { Db } from './connection';
import { attendanceMonth } from './attendance';
import { createSalaryPayment } from './expenses';
import { logActivity } from './activity';
import { fail, id, isoDate, UserError } from './validation';

const SNAP_SELECT = `
  SELECT p.id, p.employee_id AS employeeId, p.expense_id AS expenseId, p.paid_half_days AS paidHalfDays,
         p.monthly_salary_kurus AS monthlySalaryKurus, p.normal_kurus AS normalKurus, p.overtime_minutes AS overtimeMinutes,
         p.overtime_kurus AS overtimeKurus, p.total_kurus AS totalKurus, p.official_kurus AS officialKurus,
         p.cash_kurus AS cashKurus, p.daily_min_wage_kurus AS dailyMinWageKurus, x.is_paid AS isPaid, p.created_at AS createdAt
  FROM payrolls p JOIN expenses x ON x.id = p.expense_id`;

/**
 * Bir ayın bordrosu. Maaş çalışanın bütün şantiyelerdeki puantajından hesaplanır;
 * şantiye/firma seçimi yalnızca hangi çalışanların listeleneceğini belirler.
 */
export function payrollMonth(db: Db, month: string, filter?: SiteFilter): PayrollMonth {
  const full = attendanceMonth(db, month);
  let rows = full.rows;
  if (filter?.siteId || filter?.companyId) {
    const ids = new Set(attendanceMonth(db, month, filter).rows.map((r) => r.employeeId));
    rows = rows.filter((r) => ids.has(r.employeeId));
  }
  const statusMap = toStatusMap(full.statuses);
  const ibans = new Map(db.all<{ id: number; iban: string }>('SELECT id, iban FROM employees').map((e) => [e.id, e.iban]));
  const snaps = new Map(
    db.all<Omit<PayrollSnapshot, 'isPaid'> & { employeeId: number; isPaid: number }>(`${SNAP_SELECT} WHERE p.period = ?`, [month])
      .map((s) => [s.employeeId, { ...s, isPaid: s.isPaid === 1 }]),
  );
  const out: PayrollRow[] = rows.map((r) => {
    const pay = computePay({
      cells: r.cells, statuses: statusMap, monthlySalaryKurus: r.monthlySalaryKurus,
      overtimeKurus: r.overtimeKurus, dailyMinWageKurus: full.dailyMinWageKurus,
    });
    const snap = snaps.get(r.employeeId);
    let saved: PayrollSnapshot | null = null;
    if (snap) {
      const { employeeId: _e, ...rest } = snap;
      void _e;
      saved = rest as PayrollSnapshot;
    }
    return {
      employeeId: r.employeeId, employeeNo: r.employeeNo, fullName: r.fullName, position: r.position,
      nationalId: r.nationalId, iban: ibans.get(r.employeeId) ?? '', status: r.status,
      siteName: r.siteName, companyName: r.companyName, hasAttendance: Object.keys(r.cells).length > 0,
      live: { ...pay, monthlySalaryKurus: r.monthlySalaryKurus, overtimeMinutes: r.overtimeMinutes },
      saved,
    };
  });
  return { month, dailyMinWageKurus: full.dailyMinWageKurus, rows: out };
}

/**
 * Seçilen çalışanların bordrosunu kaydeder (değerler kilitlenir) ve Giderler'e iki satır açar:
 *  - "Personel maaşı" kategorisinde NORMAL MAAŞ (maaş gideri olarak sayılır)
 *  - mesai parası varsa "Ek mesai" kategorisinde MESAİ ÖDEMESİ (ödeme takibi içindir; raporda mesai maliyeti
 *    zaten mesai kayıtlarından geldiği için toplam gidere ikinci kez eklenmez)
 * Böylece Giderler'de bordronun tamamı görünür, raporlarda çift sayım olmaz.
 */
export function savePayroll(db: Db, args: { month: string; employeeIds: number[]; date: string; isPaid: boolean }) {
  if (!Array.isArray(args?.employeeIds) || args.employeeIds.length === 0) fail('Çalışan seçilmedi.');
  const date = isoDate(args.date, 'Ödeme tarihi');
  const data = payrollMonth(db, args.month);
  const byId = new Map(data.rows.map((r) => [r.employeeId, r]));
  const result = { saved: 0, totalKurus: 0, skipped: [] as { employeeName: string; reason: string }[] };
  db.tx(() => {
    for (const raw of args.employeeIds) {
      const row = byId.get(id(raw, 'Çalışan'));
      if (!row) fail('Seçilen çalışanlardan biri bu ayın bordrosunda yok.');
      if (row.saved) {
        result.skipped.push({ employeeName: row.fullName, reason: 'bordrosu zaten kaydedilmiş' });
        continue;
      }
      const p = row.live;
      if (p.normalKurus <= 0) {
        result.skipped.push({ employeeName: row.fullName, reason: p.paidHalfDays === 0 ? 'puantajda ücretli gün yok' : 'aylık maaşı girilmemiş' });
        continue;
      }
      let expenseId: number;
      try {
        expenseId = createSalaryPayment(db, {
          employeeId: row.employeeId, period: data.month, date, amountKurus: p.normalKurus, isPaid: args.isPaid === true,
          description: `Bordro: ${String(p.paidDays).replace('.', ',')} gün · normal ${formatMoney(p.normalKurus)} · mesai ${formatMoney(p.overtimeKurus)} · toplam ${formatMoney(p.totalKurus)} · asgari ${formatMoney(p.officialKurus)} · elden ${formatMoney(p.cashKurus)}`,
        }).id;
      } catch (e) {
        if (e instanceof UserError) {
          result.skipped.push({ employeeName: row.fullName, reason: 'bu ay için maaş ödemesi zaten girilmiş' });
          continue;
        }
        throw e;
      }
      let overtimeExpenseId: number | null = null;
      if (p.overtimeKurus > 0) {
        const cat = db.get<{ id: number }>(`SELECT id FROM expense_categories WHERE kind = 'overtime' ORDER BY sort_order LIMIT 1`);
        const site = db.get<{ site_id: number | null }>('SELECT site_id FROM employees WHERE id = ?', [row.employeeId])!.site_id;
        if (cat) {
          overtimeExpenseId = db.run(
            `INSERT INTO expenses (date, name, category_id, amount_kurus, is_paid, description, employee_id, site_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [date, `Mesai - ${row.fullName} (${formatPeriod(data.month)})`, cat.id, p.overtimeKurus, args.isPaid === true ? 1 : 0,
              `Bordro mesai ödemesi: ${String(Math.round(p.overtimeMinutes / 6) / 10).replace('.', ',')} saat`, row.employeeId, site],
          ).lastId;
        }
      }
      db.run(
        `INSERT INTO payrolls (employee_id, period, expense_id, overtime_expense_id, paid_half_days, monthly_salary_kurus, normal_kurus, overtime_minutes,
           overtime_kurus, total_kurus, official_kurus, cash_kurus, daily_min_wage_kurus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.employeeId, data.month, expenseId, overtimeExpenseId, p.paidHalfDays, p.monthlySalaryKurus, p.normalKurus, p.overtimeMinutes,
          p.overtimeKurus, p.totalKurus, p.officialKurus, p.cashKurus, data.dailyMinWageKurus],
      );
      result.saved++;
      result.totalKurus += p.totalKurus;
    }
    if (result.saved) logActivity(db, 'expense', null, 'create', `Bordro kaydedildi: ${formatPeriod(data.month)}, ${result.saved} çalışan, toplam ${formatMoney(result.totalKurus)}`);
  });
  return result;
}

/** Kaydedilmiş bordroyu geri alır: bağlı maaş ödemesi gideri silinir, değerler yeniden canlı hesaplanır. */
export function undoPayroll(db: Db, employeeId: number, month: string) {
  const snap = db.get<{ expense_id: number; overtime_expense_id: number | null; full_name: string }>(
    'SELECT p.expense_id, p.overtime_expense_id, e.full_name FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE p.employee_id = ? AND p.period = ?',
    [id(employeeId, 'Çalışan'), month],
  );
  if (!snap) fail('Bu çalışan için kaydedilmiş bordro yok.');
  db.tx(() => {
    if (snap.overtime_expense_id) db.run('DELETE FROM expenses WHERE id = ?', [snap.overtime_expense_id]);
    db.run('DELETE FROM expenses WHERE id = ?', [snap.expense_id]); // bordro kaydı da silinir (CASCADE)
    logActivity(db, 'expense', snap.expense_id, 'delete', `Bordro geri alındı: ${snap.full_name}, ${formatPeriod(month)}`);
  });
}
