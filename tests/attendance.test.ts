import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { openService } from './helpers';
import { attendanceTotals, DEFAULT_STATUSES as DS, toStatusMap as tsm } from '../src/shared/attendance';
const STM = tsm(DS);
import { buildAttendanceHtml, buildAttendanceXlsx } from '../src/main/db/attendance-export';
import type { EmployeeInput } from '../src/shared/types';

const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz', position: 'Usta', monthlySalaryKurus: 0, overtimeRateKurus: 6000, startDate: null, status: 'active', ...over,
});

async function setup() {
  const { svc } = await openService();
  const main = svc.companiesList()[0];
  const other = svc.companySave({ input: { name: 'Yıldız İnşaat', taxOffice: '', taxNo: '', phone: '', address: '', notes: '' } });
  const siteA = svc.siteSave({ input: { companyId: main.id, name: 'Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const siteB = svc.siteSave({ input: { companyId: other.id, name: 'Ataşehir', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const a = svc.employeeCreate({ input: emp({ siteId: siteA.id, nationalId: '10000000146' }) }).item!;
  const b = svc.employeeCreate({ input: emp({ fullName: 'Şükrü Öz', siteId: siteB.id, startDate: '2026-10-10' }) }).item!;
  const c = svc.employeeCreate({ input: emp({ fullName: 'Can Er', siteId: siteB.id }) }).item!;
  return { svc, main, other, siteA, siteB, a, b, c };
}

describe('puantaj', () => {
  it('toplamlar yarım günü 0,5 sayar', () => {
    const t = attendanceTotals({ '2026-10-01': 'X', '2026-10-02': 'Y', '2026-10-03': 'Y', '2026-10-04': 'H', '2026-10-05': 'R' }, STM);
    expect(t.workedDays).toBe(2);
    expect(t.paidDays).toBe(3);
    expect(t.counts).toEqual({ X: 1, Y: 2, H: 1, R: 1 });
  });

  it('hücre yazma, güncelleme, temizleme ve doğrulama', async () => {
    const { svc, a, b } = await setup();
    expect(svc.attendanceSet({ entries: [
      { employeeId: a.id, date: '2026-10-01', status: 'X' },
      { employeeId: a.id, date: '2026-10-02', status: 'R' },
      { employeeId: b.id, date: '2026-10-01', status: 'Y' },
    ] }).changed).toBe(3);
    svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-02', status: 'I' }] }); // günceller
    svc.attendanceSet({ entries: [{ employeeId: b.id, date: '2026-10-01', status: null }] }); // temizler
    const m = svc.attendanceMonth({ month: '2026-10' });
    expect(m.days).toHaveLength(31);
    const ra = m.rows.find((r) => r.employeeId === a.id)!;
    expect(ra.cells).toEqual({ '2026-10-01': 'X', '2026-10-02': 'I' });
    expect(m.rows.find((r) => r.employeeId === b.id)!.cells).toEqual({});
    expect(() => svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-01', status: 'Z' as never }] })).toThrow(/Geçersiz puantaj/);
    expect(() => svc.attendanceSet({ entries: [{ employeeId: 999, date: '2026-10-01', status: 'X' }] })).toThrow(/bulunamadı/);
    expect(() => svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-02-30', status: 'X' }] })).toThrow(/Tarih geçersiz/);
    expect(() => svc.attendanceMonth({ month: '2026-13' })).toThrow(/Ay seçimi/);
    // Puantajı olan çalışan silinemez (yabancı anahtar)
    expect(svc.employeeDelete(a.id).deleted).toBe(false);
  });

  it('toplu doldurma: iş günleri X, pazar H, dolu hücrelere ve işe başlamadan önceye dokunmaz', async () => {
    const { svc, a, b } = await setup();
    svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-05', status: 'R' }] }); // pazartesi raporlu
    const r = svc.attendanceFill({ month: '2026-10', employeeIds: [a.id, b.id], workSaturday: true, untilToday: true, today: '2026-10-17' });
    const m = svc.attendanceMonth({ month: '2026-10' });
    const ra = m.rows.find((x) => x.employeeId === a.id)!;
    expect(ra.cells['2026-10-05']).toBe('R'); // korundu
    expect(ra.cells['2026-10-03']).toBe('X'); // cumartesi çalışılıyor
    expect(ra.cells['2026-10-04']).toBe('H'); // pazar
    expect(ra.cells['2026-10-18']).toBeUndefined(); // bugünden sonrası boş
    expect(Object.keys(ra.cells)).toHaveLength(17);
    const rb = m.rows.find((x) => x.employeeId === b.id)!;
    expect(Object.keys(rb.cells).sort()[0]).toBe('2026-10-10'); // işe başlama tarihinden itibaren
    expect(r.changed).toBe(16 + 8);
    // Cumartesi tatil seçeneği
    svc.attendanceFill({ month: '2026-11', employeeIds: [a.id], workSaturday: false, untilToday: false, today: '2026-10-17' });
    const nov = svc.attendanceMonth({ month: '2026-11' }).rows.find((x) => x.employeeId === a.id)!;
    expect(nov.cells['2026-11-07']).toBe('H');
    expect(attendanceTotals(nov.cells, STM).workedDays).toBe(21);
    // Tekrar doldurmak bir şey değiştirmez
    expect(svc.attendanceFill({ month: '2026-11', employeeIds: [a.id], workSaturday: false, untilToday: false }).changed).toBe(0);
  });

  it('şantiye kapsamı: kayıt şantiyesi saklanır, başka şantiyeye geçen çalışan eski ayda eski şantiyede görünür', async () => {
    const { svc, other, siteA, siteB, a, b, c } = await setup();
    svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-01', status: 'X' }] });
    svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-01', startTime: '18:00', endTime: '20:30', breakMinutes: 0, hourlyRateKurus: 100 } });
    // Ahmet B şantiyesine taşınıyor
    svc.employeesAssignSite({ employeeIds: [a.id], siteId: siteB.id });
    svc.attendanceSet({ entries: [{ employeeId: a.id, date: '2026-10-02', status: 'X' }] });
    const inA = svc.attendanceMonth({ month: '2026-10', siteId: siteA.id });
    expect(inA.rows.map((r) => r.fullName)).toEqual(['Ahmet Yılmaz']);
    expect(inA.rows[0].cells).toEqual({ '2026-10-01': 'X' });
    expect(inA.rows[0].overtimeMinutes).toBe(150);
    expect(inA.rows[0].overtime).toEqual({ '2026-10-01': 150 });
    expect(inA.rows[0].overtimeKurus).toBe(250);
    const inB = svc.attendanceMonth({ month: '2026-10', siteId: siteB.id });
    expect(inB.rows.map((r) => r.fullName).sort()).toEqual(['Ahmet Yılmaz', 'Can Er', 'Şükrü Öz']);
    expect(inB.rows.find((r) => r.employeeId === a.id)!.cells).toEqual({ '2026-10-02': 'X' });
    expect(svc.attendanceMonth({ month: '2026-10', companyId: other.id }).rows).toHaveLength(3);
    // Ayrılan çalışan: kaydı olan ayda görünür, kaydı olmayan ayda görünmez
    svc.attendanceSet({ entries: [{ employeeId: c.id, date: '2026-10-03', status: 'X' }] });
    svc.employeeSetStatus({ id: c.id, status: 'left' });
    expect(svc.attendanceMonth({ month: '2026-10' }).rows.some((r) => r.employeeId === c.id)).toBe(true);
    expect(svc.attendanceMonth({ month: '2026-11' }).rows.some((r) => r.employeeId === c.id)).toBe(false);
    expect(svc.employeeDelete(b.id).deleted).toBe(true);
    expect(svc.employeeDelete(c.id).deleted).toBe(false);
  });

  it('Excel: şantiye başına ayrı sayfa, kodlar ve toplamlar doğru', async () => {
    const { svc, a, b, c } = await setup();
    svc.attendanceFill({ month: '2026-10', employeeIds: [a.id, b.id, c.id], workSaturday: false, untilToday: false, today: '2026-10-17' });
    svc.attendanceSet({ entries: [{ employeeId: c.id, date: '2026-10-01', status: 'Y' }, { employeeId: c.id, date: '2026-10-02', status: 'R' }] });
    svc.overtimeCreate({ input: { employeeId: c.id, date: '2026-10-05', startTime: '18:00', endTime: '19:30', breakMinutes: 0, hourlyRateKurus: 100 } });
    const buf = await buildAttendanceXlsx(svc.attendanceExportData('2026-10'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ataşehir', 'Atölye']);
    const ws = wb.getWorksheet('Ataşehir')!;
    expect(String(ws.getCell(1, 1).value)).toBe('PUANTAJ CETVELİ — EKİM 2026');
    expect(String(ws.getCell(2, 1).value)).toContain('Firma: Yıldız İnşaat');
    // Başlık: 5 sabit sütun + 31 gün
    expect(ws.getCell(4, 6).value).toBe(1);
    expect(ws.getCell(5, 6).value).toBe('Per'); // 1 Ekim 2026 perşembe
    // Her çalışan iki satır: durum satırı + altında "Mesai (saat)" satırı
    const canRow = [6, 8].find((r) => ws.getCell(r, 3).value === 'Can Er')!;
    expect(ws.getCell(canRow, 6).value).toBe('4'); // yarım gün
    expect(ws.getCell(canRow, 7).value).toBe('R');
    expect(ws.getCell(canRow, 8).value).toBe('H'); // cumartesi (workSaturday: false) hafta tatili
    expect(ws.getCell(canRow, 9).value).toBe('H'); // pazar
    expect(ws.getCell(canRow, 10).value).toBe('8'); // pazartesi çalıştı
    // Çalışılan gün: Ekim 2026'da 22 iş günü; 1 Ekim yarım, 2 Ekim rapor -> 20,5
    expect(ws.getCell(canRow, 5 + 31 + 1).value).toBe(20.5);
    expect(ws.getCell(canRow, 5 + 31 + 1 + 8 + 1).value).toBe(1.5); // mesai saati (8 fırça sütunundan sonra)
    expect(ws.getCell(canRow, 5 + 31 + 1 + 8 + 2).value).toBe(1.5); // mesai tutarı: 1,5 sa × 1,00 ₺
    expect(String(ws.getCell(canRow + 1, 3).value).trim()).toBe('Mesai (saat)');
    expect(ws.getCell(canRow + 1, 5 + 5).value).toBe(1.5); // 5 Ekim sütunu
    expect(ws.getCell(canRow + 1, 5 + 6).value).toBeNull();
    const sukru = [6, 8].find((r) => ws.getCell(r, 3).value === 'Şükrü Öz')!;
    expect(ws.getCell(sukru, 6).value).toBe(''); // işe başlamadan önce
    const html = buildAttendanceHtml(svc.attendanceExportData('2026-10', {}));
    expect(html).toContain('PUANTAJ CETVELİ — EKİM 2026');
    expect(html.match(/<section>/g)).toHaveLength(2);
    expect(html).toContain('Mesai (saat)');
    expect(html).toContain('1,50 ₺');
    expect(html).toContain('20,5');
  });
});

describe('puantaj ve mesai', () => {
  it('yalnızca mesaisi olan çalışan da o şantiyenin puantajında görünür', async () => {
    const { svc, siteA, siteB, a } = await setup();
    // Ahmet B'ye taşındıktan sonra A şantiyesinde bir gün mesai yapıyor (puantajı yok)
    svc.employeesAssignSite({ employeeIds: [a.id], siteId: siteB.id });
    svc.overtimeCreate({ input: { employeeId: a.id, siteId: siteA.id, date: '2026-10-12', startTime: '08:00', endTime: '10:00', breakMinutes: 0, hourlyRateKurus: 6000 } });
    const inA = svc.attendanceMonth({ month: '2026-10', siteId: siteA.id });
    expect(inA.rows.map((r) => r.fullName)).toEqual(['Ahmet Yılmaz']);
    expect(inA.rows[0]).toMatchObject({ overtime: { '2026-10-12': 120 }, overtimeKurus: 12000, cells: {} });
  });
});

import { computePay } from '../src/shared/payroll';
import { DEFAULT_STATUSES, toStatusMap, textColorFor } from '../src/shared/attendance';

const ST = toStatusMap(DEFAULT_STATUSES);

describe('maaş hesabı (işaretlenen günler; normal + mesai, asgari + elden)', () => {
  const days = (n: number, st: 'X' | 'H' | 'D' | 'Y' | 'U' | 'R' | 'I', start = 1) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(start + i).padStart(2, '0')}`, st]));
  const pay = (cells: Record<string, string>, monthly = 3_000_000, ot = 0, min = 73_000) =>
    computePay({ cells, statuses: ST, monthlySalaryKurus: monthly, overtimeKurus: ot, dailyMinWageKurus: min });

  it('ay hesabı yapılmaz: işaretlenen gün sayısı kadar ödenir (31 gün işaretliyse 31 gün)', () => {
    const r = pay({ ...days(27, 'X'), ...days(4, 'H', 28) }, 3_000_000, 50_000);
    expect(r).toEqual({ paidHalfDays: 62, paidDays: 31, dailyWageKurus: 100_000, normalKurus: 3_100_000, overtimeKurus: 50_000, totalKurus: 3_150_000, officialKurus: 2_263_000, cashKurus: 887_000 });
    const feb = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`2026-02-${String(i + 1).padStart(2, '0')}`, 'X']));
    expect(pay(feb).paidDays).toBe(28);
    expect(pay({}).paidDays).toBe(0); // boş puantaj
  });
  it('devamsız, ücretsiz izin, rapor sayılmaz; yarım gün 0,5', () => {
    const cells = { ...days(20, 'X'), ...days(4, 'H', 21), ...days(2, 'D', 25), ...days(1, 'U', 27), ...days(1, 'R', 28), ...days(1, 'Y', 29) };
    const r = pay(cells);
    expect(r.paidDays).toBe(24.5); // 20 + 4 + 0,5
    expect(r.normalKurus).toBe(2_450_000); // 1.000 × 24,5
    expect(r.officialKurus).toBe(1_788_500); // 730 × 24,5
    expect(r.cashKurus).toBe(661_500);
  });
  it('asgari toplamı geçemez; asgari ayarlanmadıysa hepsi elden', () => {
    const low = pay(days(10, 'X'), 600_000);
    expect(low.officialKurus).toBe(low.totalKurus);
    expect(low.cashKurus).toBe(0);
    expect(pay(days(10, 'X'), 3_000_000, 1_000, 0)).toMatchObject({ paidDays: 10, officialKurus: 0, cashKurus: 1_001_000 });
  });
  it('düzenlenmiş fırça değerleri hesaba yansır', () => {
    const custom = toStatusMap([...DEFAULT_STATUSES.map((s) => (s.code === 'R' ? { ...s, paidHalf: 2 } : s))]);
    expect(computePay({ cells: days(3, 'R'), statuses: custom, monthlySalaryKurus: 3_000_000, overtimeKurus: 0, dailyMinWageKurus: 0 }).paidDays).toBe(3);
  });
  it('koyu renkte beyaz, açık renkte siyah yazı', () => {
    expect(textColorFor('#15803d')).toBe('#ffffff');
    expect(textColorFor('#fde68a')).toBe('#111827');
  });
});

describe('puantaj fırçaları', () => {
  it('varsayılanlar: çalıştı 8, yarım 4, devamsız 0; düzenleme, ekleme, silme kuralları', async () => {
    const { svc } = await openService();
    const list = svc.attendanceStatusesList();
    expect(list.map((s) => s.short)).toEqual(['8', '4', 'İ', 'Üİ', 'R', '0', 'T', 'H']);
    const x = svc.attendanceStatusSave({ code: 'X', input: { short: '9', label: 'Çalıştı', color: '#166534', paidHalf: 2, workedHalf: 2 } });
    expect(x.short).toBe('9');
    expect(() => svc.attendanceStatusSave({ code: 'Y', input: { short: '9', label: 'x', color: '#000000', paidHalf: 1, workedHalf: 1 } })).toThrow(/zaten/);
    expect(() => svc.attendanceStatusSave({ input: { short: 'G', label: 'Gece', color: 'kırmızı', paidHalf: 2, workedHalf: 2 } })).toThrow(/Renk/);
    const g = svc.attendanceStatusSave({ input: { short: 'G', label: 'Gece vardiyası', color: '#111111', paidHalf: 2, workedHalf: 2 } });
    expect(g.code).toBe('C1');
    const e = svc.employeeCreate({ input: emp() }).item!;
    svc.attendanceSet({ entries: [{ employeeId: e.id, date: '2026-10-01', status: 'C1' }] });
    expect(svc.attendanceMonth({ month: '2026-10' }).rows[0].cells['2026-10-01']).toBe('C1');
    expect(() => svc.attendanceStatusDelete('C1')).toThrow(/kullanılıyor/);
    expect(() => svc.attendanceStatusDelete('X')).toThrow(/Başlangıç/);
    svc.attendanceSet({ entries: [{ employeeId: e.id, date: '2026-10-01', status: null }] });
    svc.attendanceStatusDelete('C1');
    expect(() => svc.attendanceSet({ entries: [{ employeeId: e.id, date: '2026-10-01', status: 'C1' }] })).toThrow(/Geçersiz/);
  });
});
