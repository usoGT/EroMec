// Rapor ve ana sayfa hesaplamaları.
//
// Hesaplama kuralları (çift sayımı önlemek için):
//  * Maaş gideri   = Giderler tablosunda "maaş" türündeki kategorilere girilmiş GERÇEK ödemeler.
//                    Çalışan kartındaki aylık maaş bilgisi gider değildir, toplama girmez.
//  * Mesai maliyeti = Mesai kayıtlarının tutarları (her kayıt kendi ücretini saklar).
//  * Diğer giderler = Maaş ve "Ek mesai" türü dışındaki bütün gider kayıtları.
//  * Toplam gider   = Maaş gideri + Mesai maliyeti + Diğer giderler.
//  * "Ek mesai" kategorisindeki gider kayıtları mesai ödemesinin takibi içindir; mesai maliyeti
//    zaten mesai kayıtlarından geldiği için TOPLAM GİDERE İKİNCİ KEZ EKLENMEZ, ayrıca gösterilir.
//  * Ödenen / ödenmemiş tutarlar Giderler tablosundaki kayıtların ödeme durumundan hesaplanır.
import type { Dashboard, SiteFilter, Summary } from '../../shared/types';
import { dayRange, monthRange, weekRange } from '../../shared/dates';
import type { Db } from './connection';
import { listActivity } from './activity';
import { isoDate, fail } from './validation';
import { siteCondition } from './sites';
import { payrollMonth } from './payroll';
import { addDays } from '../../shared/dates';

export function summary(db: Db, fromRaw: string, toRaw: string, filter?: SiteFilter): Summary {
  const from = isoDate(fromRaw, 'Başlangıç tarihi');
  const to = isoDate(toRaw, 'Bitiş tarihi');
  if (from > to) fail('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  // Şantiye/firma seçildiyse yalnızca o şantiyelere ait gider ve mesailer sayılır.
  const xs = siteCondition('x', filter);
  const os = siteCondition('o', filter);

  const byCat = db.all<{ name: string; kind: Summary['byCategory'][number]['kind']; kurus: number; paid: number; unpaid: number; cnt: number }>(
    `SELECT c.name, c.kind, COALESCE(SUM(x.amount_kurus),0) AS kurus,
            COALESCE(SUM(CASE WHEN x.is_paid = 1 THEN x.amount_kurus ELSE 0 END),0) AS paid,
            COALESCE(SUM(CASE WHEN x.is_paid = 0 THEN x.amount_kurus ELSE 0 END),0) AS unpaid,
            COUNT(x.id) AS cnt
     FROM expense_categories c
     LEFT JOIN expenses x ON x.category_id = c.id AND x.date >= ? AND x.date <= ?${xs ? ` AND ${xs.sql}` : ''}
     GROUP BY c.id ORDER BY c.sort_order, c.name`,
    [from, to, ...(xs?.params ?? [])],
  );
  const ot = db.get<{ k: number; m: number; c: number }>(
    `SELECT COALESCE(SUM(o.total_kurus),0) AS k, COALESCE(SUM(o.worked_minutes),0) AS m, COUNT(*) AS c
     FROM overtime_records o WHERE o.date >= ? AND o.date <= ?${os ? ` AND ${os.sql}` : ''}`,
    [from, to, ...(os?.params ?? [])],
  )!;

  const sumKind = (kind: string) => byCat.filter((c) => c.kind === kind).reduce((s, c) => s + c.kurus, 0);
  const salaryKurus = sumKind('salary');
  const otherKurus = sumKind('other');
  const overtimeCategoryKurus = sumKind('overtime');

  // Dönemin içine tamamen giren aylarda bordrosu kaydedilmemiş maaşlar (rapora dahil değil, uyarı olarak gösterilir)
  let pendingSalaryKurus = 0;
  let pendingSalaryCount = 0;
  const pendingMonths: string[] = [];
  for (let m = from.slice(0, 7); `${m}-01` <= to; m = addDays(monthRange(`${m}-01`).to, 1).slice(0, 7)) {
    const r = monthRange(`${m}-01`);
    if (r.from < from || r.to > to) continue;
    const pending = payrollMonth(db, m, filter).rows.filter((x) => !x.saved && x.live.normalKurus > 0);
    if (pending.length) pendingMonths.push(m);
    pendingSalaryCount += pending.length;
    pendingSalaryKurus += pending.reduce((s, x) => s + x.live.normalKurus, 0);
  }

  // Personel maliyeti: dönemdeki puantaj hücrelerinin ücretli gün değeri × günlük ücret.
  // Ay için bordro kaydedildiyse kayıttaki aylık maaş, yoksa çalışanın güncel aylık maaşı kullanılır.
  const ac = siteCondition('a', filter);
  let costLaborKurus = 0;
  let laborHalf = 0;
  for (const r of db.all<{ h: number; sal: number }>(
    `SELECT SUM(st.paid_half) AS h, COALESCE(p.monthly_salary_kurus, e.monthly_salary_kurus) AS sal
     FROM attendance a
     JOIN attendance_statuses st ON st.code = a.status
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN payrolls p ON p.employee_id = a.employee_id AND p.period = substr(a.date, 1, 7)
     WHERE a.date >= ? AND a.date <= ?${ac ? ` AND ${ac.sql}` : ''}
     GROUP BY a.employee_id, substr(a.date, 1, 7)`,
    [from, to, ...(ac?.params ?? [])],
  )) {
    laborHalf += r.h;
    costLaborKurus += Math.round((r.sal * r.h) / 60);
  }
  const costTotalKurus = costLaborKurus + ot.k + otherKurus;
  const expTotalKurus = salaryKurus + overtimeCategoryKurus + otherKurus;

  return {
    from,
    to,
    costLaborKurus,
    costLaborDays: laborHalf / 2,
    costOvertimeKurus: ot.k,
    costOtherKurus: otherKurus,
    costTotalKurus,
    expSalaryKurus: salaryKurus,
    expOvertimeKurus: overtimeCategoryKurus,
    expOtherKurus: otherKurus,
    expTotalKurus,
    diffKurus: costTotalKurus - expTotalKurus,
    pendingSalaryKurus,
    pendingSalaryCount,
    pendingMonths,
    siteId: filter?.siteId || undefined,
    companyId: filter?.siteId ? undefined : filter?.companyId || undefined,
    salaryKurus,
    overtimeKurus: ot.k,
    overtimeMinutes: ot.m,
    otherKurus,
    totalKurus: salaryKurus + ot.k + otherKurus,
    paidKurus: byCat.reduce((s, c) => s + c.paid, 0),
    unpaidKurus: byCat.reduce((s, c) => s + c.unpaid, 0),
    overtimeCategoryKurus,
    expenseCount: byCat.reduce((s, c) => s + c.cnt, 0),
    overtimeCount: ot.c,
    byCategory: byCat.map((c) => ({ name: c.name, kind: c.kind, kurus: c.kurus, includedInTotal: c.kind !== 'overtime' })),
  };
}

/**
 * Ana sayfa özeti. Firma ya da şantiye seçildiyse (filter) bütün sayılar yalnızca ona göre hesaplanır.
 * allTimeTotalKurus: ilk kayıttan son kayda kadar (şimdiye kadarki) bütün maliyet — puantaj + mesai + diğer giderler.
 */
export function dashboard(db: Db, todayRaw: string, filter?: SiteFilter): Dashboard {
  const today = isoDate(todayRaw, 'Tarih');
  const es = siteCondition('e', filter);
  const counts = db.get<{ total: number; active: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END),0) AS active FROM employees e${es ? ` WHERE ${es.sql}` : ''}`,
    es?.params ?? [],
  )!;
  const d = dayRange(today);
  const w = weekRange(today);
  const m = monthRange(today);
  const day = summary(db, d.from, d.to, filter);
  const xs = siteCondition('x', filter);
  const unpaid = db.get<{ k: number }>(
    `SELECT COALESCE(SUM(x.amount_kurus),0) AS k FROM expenses x WHERE x.is_paid = 0${xs ? ` AND ${xs.sql}` : ''}`,
    xs?.params ?? [],
  )!.k;

  // Şimdiye kadarki toplam: en eski ve en yeni kayıt tarihleri arası (gelecek tarihli kayıtlar da dahil)
  const span = db.get<{ a: string | null; b: string | null }>(
    `SELECT MIN(d) AS a, MAX(d) AS b FROM (
       SELECT MIN(date) AS d FROM attendance UNION ALL SELECT MAX(date) FROM attendance
       UNION ALL SELECT MIN(date) FROM overtime_records UNION ALL SELECT MAX(date) FROM overtime_records
       UNION ALL SELECT MIN(date) FROM expenses UNION ALL SELECT MAX(date) FROM expenses) WHERE d IS NOT NULL`,
  );
  const allTimeTotalKurus = span?.a
    ? summary(db, span.a, span.b && span.b > today ? span.b : today, filter).costTotalKurus
    : 0;

  return {
    today,
    activeEmployeeCount: counts.active,
    totalEmployeeCount: counts.total,
    todayOvertimeMinutes: day.overtimeMinutes,
    todayTotalKurus: day.costTotalKurus,
    weekTotalKurus: summary(db, w.from, w.to, filter).costTotalKurus,
    monthTotalKurus: summary(db, m.from, m.to, filter).costTotalKurus,
    allTimeTotalKurus,
    totalUnpaidKurus: unpaid,
    recent: listActivity(db, 10),
  };
}
