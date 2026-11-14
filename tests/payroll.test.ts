import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { openService } from './helpers';
import { buildPayrollHtml, buildPayrollXlsx } from '../src/main/db/payroll-export';
import { buildAttendanceXlsx } from '../src/main/db/attendance-export';
import type { EmployeeInput } from '../src/shared/types';

const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz', position: 'Usta', monthlySalaryKurus: 3_000_000, overtimeRateKurus: 20_000, startDate: null, status: 'active', ...over,
});

async function setup() {
  const { svc } = await openService();
  const s = svc.settingsGet();
  svc.settingsSave({ ...s, dailyMinWageKurus: 73_000 }); // günlük asgari 730,00 ₺
  const main = svc.companiesList()[0];
  const site = svc.siteSave({ input: { companyId: main.id, name: 'Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const a = svc.employeeCreate({ input: emp({ siteId: site.id, iban: 'TR330006100519786457841326' }) }).item!;
  const b = svc.employeeCreate({ input: emp({ fullName: 'Veli', monthlySalaryKurus: 0, siteId: site.id }) }).item!;
  // Ahmet: Ekim tam ay (cumartesi çalışılıyor), 2 gün devamsız; 4 saat mesai
  svc.attendanceFill({ month: '2026-10', employeeIds: [a.id, b.id], workSaturday: true, untilToday: false });
  svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-13', status: 'D' }, { employeeId: a.id, date: '2026-10-14', status: 'D' }] });
  svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '22:00', breakMinutes: 0, hourlyRateKurus: 20_000 } });
  return { svc, site, a, b };
}

describe('bordro', () => {
  it('normal maaş, mesai parası, toplam, asgari ve elden hesaplanır', async () => {
    const { svc, a } = await setup();
    const p = svc.payrollMonth({ month: '2026-10' });
    expect(p.dailyMinWageKurus).toBe(73_000);
    const r = p.rows.find((x) => x.employeeId === a.id)!;
    // 31 işaretli gün − 2 devamsız = 29 ücretli gün (ay hesabı yapılmaz)
    expect(r.live).toMatchObject({
      paidDays: 29, dailyWageKurus: 100_000, normalKurus: 2_900_000, overtimeKurus: 80_000, totalKurus: 2_980_000,
      officialKurus: 2_117_000, cashKurus: 863_000, overtimeMinutes: 240,
    });
    expect(r.saved).toBeNull();
    expect(r.iban).toBe('TR330006100519786457841326');
  });

  it('kaydetme: değerler kilitlenir, gider = yalnız normal maaş (mesai iki kez sayılmaz), tekrar kayıt engellenir', async () => {
    const { svc, a, b } = await setup();
    const res = svc.payrollSave({ month: '2026-10', employeeIds: [a.id, b.id], date: '2026-10-31', isPaid: true });
    expect(res.saved).toBe(1);
    expect(res.skipped).toEqual([{ employeeName: 'Veli', reason: 'aylık maaşı girilmemiş' }]);
    const exp = svc.expensesList({}).find((x) => x.employeeId === a.id && x.salaryPeriod)!;
    expect(exp).toMatchObject({ amountKurus: 2_900_000, salaryPeriod: '2026-10', categoryName: 'Personel maaşı', isPaid: true });
    expect(exp.description).toContain('elden 8.630,00 ₺');
    // Giderler'de mesai ödemesi de ayrı satır olarak görünür (Ek mesai kategorisi)
    const otExp = svc.expensesList({}).find((x) => x.employeeId === a.id && x.categoryKind === 'overtime')!;
    expect(otExp).toMatchObject({ amountKurus: 80_000, name: 'Mesai - Ahmet Yılmaz (Ekim 2026)', isPaid: true });
    // Rapor: maaş 29.000 + mesai 800 (mesai kayıtlarından) — mesai ödemesi gideri ikinci kez sayılmaz
    const sum = svc.summary({ from: '2026-10-01', to: '2026-10-31' });
    expect(sum).toMatchObject({ salaryKurus: 2_900_000, overtimeKurus: 80_000, totalKurus: 2_980_000, overtimeCategoryKurus: 80_000, pendingSalaryCount: 0 });
    // Kayıttan sonra maaş ve asgari değişse bile kayıtlı bordro değişmez
    svc.employeeUpdate({ id: a.id, input: emp({ monthlySalaryKurus: 9_000_000 }) });
    svc.settingsSave({ ...svc.settingsGet(), dailyMinWageKurus: 100_000 });
    const r = svc.payrollMonth({ month: '2026-10' }).rows.find((x) => x.employeeId === a.id)!;
    expect(r.saved).toMatchObject({ normalKurus: 2_900_000, totalKurus: 2_980_000, officialKurus: 2_117_000, cashKurus: 863_000, isPaid: true });
    expect(r.live.normalKurus).toBe(8_700_000);
    // Tekrar kaydetme atlanır
    expect(svc.payrollSave({ month: '2026-10', employeeIds: [a.id], date: '2026-10-31', isPaid: true }).skipped[0].reason).toMatch(/zaten kaydedilmiş/);
    // Geri alma: gider silinir, canlı hesap yeniden kullanılır
    svc.payrollUndo({ employeeId: a.id, month: '2026-10' });
    expect(svc.expensesList({}).some((x) => x.employeeId === a.id)).toBe(false); // maaş ve mesai satırı birlikte silindi
    expect(svc.payrollMonth({ month: '2026-10' }).rows.find((x) => x.employeeId === a.id)!.saved).toBeNull();
    expect(() => svc.payrollUndo({ employeeId: a.id, month: '2026-10' })).toThrow(/kaydedilmiş bordro yok/);
  });

  it('giderlerden maaş ödemesi silinirse bordro kaydı da kalkar; elle girilmiş maaş ödemesi varsa atlanır', async () => {
    const { svc, a } = await setup();
    svc.payrollSave({ month: '2026-10', employeeIds: [a.id], date: '2026-10-31', isPaid: false });
    // Giderlerden mesai satırını silmek de bordroyu ve maaş satırını birlikte kaldırır
    const otExp = svc.expensesList({}).find((x) => x.employeeId === a.id && x.categoryKind === 'overtime')!;
    svc.expenseDelete(otExp.id);
    expect(svc.expensesList({}).some((x) => x.employeeId === a.id)).toBe(false);
    expect(svc.payrollMonth({ month: '2026-10' }).rows.find((x) => x.employeeId === a.id)!.saved).toBeNull();
    svc.salaryPaymentCreate({ employeeId: a.id, period: '2026-10', date: '2026-10-31', amountKurus: 100, isPaid: true });
    expect(svc.payrollSave({ month: '2026-10', employeeIds: [a.id], date: '2026-10-31', isPaid: true }).skipped[0].reason).toMatch(/zaten girilmiş/);
  });

  it('raporda bordrosu kaydedilmemiş maaş uyarısı (tam aylar için)', async () => {
    const { svc, a } = await setup();
    const m = svc.summary({ from: '2026-10-01', to: '2026-10-31' });
    expect(m).toMatchObject({ salaryKurus: 0, pendingSalaryCount: 1, pendingSalaryKurus: 2_900_000, pendingMonths: ['2026-10'] });
    // Maliyet puantajdan hemen görünür (gün = bütün çalışanların toplamı: 29 + Veli 31); gider bordro kaydedilene kadar 0
    expect(m).toMatchObject({ costLaborKurus: 2_900_000, costLaborDays: 60, costOvertimeKurus: 80_000, costTotalKurus: 2_980_000, expTotalKurus: 0, diffKurus: 2_980_000 });
    // Haftalık maliyet: 5–11 Ekim (6 gün çalıştı + pazar hafta tatili = 7 ücretli gün)
    expect(svc.summary({ from: '2026-10-05', to: '2026-10-11' })).toMatchObject({ costLaborKurus: 700_000, costLaborDays: 14 });
    expect(svc.summary({ from: '2026-10-05', to: '2026-10-11' }).pendingSalaryCount).toBe(0); // haftalık: ay tamamlanmıyor
    svc.payrollSave({ month: '2026-10', employeeIds: [a.id], date: '2026-10-31', isPaid: false });
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({
      salaryKurus: 2_900_000, pendingSalaryCount: 0, unpaidKurus: 2_980_000,
      costTotalKurus: 2_980_000, expSalaryKurus: 2_900_000, expOvertimeKurus: 80_000, expTotalKurus: 2_980_000, diffKurus: 0,
    });
    // Bordro kaydından sonra maaş değişse bile o ayın maliyeti kayıttaki maaşla hesaplanır
    svc.employeeUpdate({ id: a.id, input: emp({ monthlySalaryKurus: 6_000_000 }) });
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31' }).costLaborKurus).toBe(2_900_000);
  });

  it('Excel/PDF bordro ve puantaj çıktısında maaş sütunları', async () => {
    const { svc } = await setup();
    const buf = await buildPayrollXlsx(svc.payrollExportData('2026-10'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Bordro')!;
    expect(String(ws.getCell(1, 1).value)).toBe('MAAŞ BORDROSU — EKİM 2026');
    expect(ws.getCell(5, 2).value).toBe('Ahmet Yılmaz');
    expect(ws.getCell(5, 4).value).toBe('TR33 0006 1005 1978 6457 8413 26');
    expect([8, 9, 11, 12, 13, 14].map((c) => ws.getCell(5, c).value)).toEqual([29, 29000, 800, 29800, 21170, 8630]);
    expect(ws.getCell(7, 12).value).toBe(29800 + 0); // toplam satırı (Veli 0)
    const html = buildPayrollHtml(svc.payrollExportData('2026-10'));
    expect(html).toContain('29.800,00 ₺');
    expect(html).toContain('8.630,00 ₺');

    const pb = await buildAttendanceXlsx(svc.attendanceExportData('2026-10'));
    const pw = new ExcelJS.Workbook();
    await pw.xlsx.load(pb as unknown as ArrayBuffer);
    const ps = pw.worksheets[0];
    const head = (ps.getRow(4).values as unknown[]).map(String);
    for (const h of ['Ücretli gün', 'Normal maaş (₺)', 'TOPLAM (₺)', 'Asgari (₺)', 'Elden (₺)']) expect(head).toContain(h);
    const col = (h: string) => head.indexOf(h);
    const row = [6, 8].find((r) => ps.getCell(r, 3).value === 'Ahmet Yılmaz')!;
    expect(ps.getCell(row, col('TOPLAM (₺)')).value).toBe(29800);
    expect(ps.getCell(row, col('Elden (₺)')).value).toBe(8630);
  });
});
