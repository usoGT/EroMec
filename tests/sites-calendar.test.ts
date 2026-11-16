import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { openService, tempDbPath, WASM_DIR } from './helpers';
import { Db } from '../src/main/db/connection';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, migrate } from '../src/main/db/migrations';
import { isValidIban, isValidNationalId, formatIban } from '../src/shared/identity';
import type { EmployeeInput } from '../src/shared/types';

const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz', position: 'Usta', monthlySalaryKurus: 3000000, overtimeRateKurus: 20000,
  startDate: null, status: 'active', ...over,
});

async function setup() {
  const { svc, db } = await openService();
  const main = svc.companiesList()[0];
  const other = svc.companySave({ input: { name: 'Yıldız İnşaat A.Ş.', taxOffice: 'Kadıköy', taxNo: '1234567890', phone: '', address: '', notes: '' } });
  const siteA = svc.siteSave({ input: { companyId: main.id, name: 'Merkez Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const siteB = svc.siteSave({ input: { companyId: other.id, name: 'Ataşehir Konutları', address: 'İstanbul', startDate: '2026-01-01', endDate: null, status: 'active', notes: '' } });
  return { svc, db, main, other, siteA, siteB };
}

describe('kimlik ve IBAN doğrulama', () => {
  it('T.C. kimlik no kontrol hanesi', () => {
    expect(isValidNationalId('10000000146')).toBe(true);
    expect(isValidNationalId('10000000147')).toBe(false);
    expect(isValidNationalId('01234567890')).toBe(false);
    expect(isValidNationalId('1234')).toBe(false);
  });
  it('IBAN mod-97', () => {
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(isValidIban('TR330006100519786457841327')).toBe(false);
    expect(isValidIban('TR3300061005197864578413')).toBe(false);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(formatIban('tr330006100519786457841326')).toBe('TR33 0006 1005 1978 6457 8413 26');
  });
});

describe('migration v1 -> güncel', () => {
  it('eski veritabanı kayıpsız güncellenir ve ana firma oluşturulur', async () => {
    const file = tempDbPath();
    const old = await Db.open(WASM_DIR, file);
    // yalnızca 1. sürüm şemasını uygula
    old.tx(() => {
      MIGRATIONS[0].up(old);
      old.exec('PRAGMA user_version = 1');
    });
    old.run(`UPDATE settings SET value = 'Eroğlu Mekanik' WHERE key = 'companyName'`);
    old.run(`INSERT INTO employees (employee_no, full_name, position) VALUES ('P0001', 'Eski Çalışan', 'Usta')`);
    old.persist();
    old.close();
    const { svc } = await openService(file);
    expect(svc.dbInfo().schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(svc.companiesList().map((c) => c.name)).toEqual(['Eroğlu Mekanik']);
    const e = svc.employeesList()[0];
    expect(e).toMatchObject({ fullName: 'Eski Çalışan', siteId: null, nationalId: '', iban: '' });
    expect(fs.existsSync(file!)).toBe(true);
  });

  it('yeni veritabanında migration iki kez çalışmaz', async () => {
    const { db } = await openService();
    expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('firmalar ve şantiyeler', () => {
  it('ekleme, doğrulama, silme kuralları', async () => {
    const { svc, main, other, siteA, siteB } = await setup();
    expect(svc.sitesList().map((s) => s.name).sort()).toEqual(['Ataşehir Konutları', 'Merkez Atölye']);
    expect(siteB.companyName).toBe('Yıldız İnşaat A.Ş.');
    expect(() => svc.companySave({ input: { ...other, name: 'YILDIZ İNŞAAT A.Ş.' } })).toThrow(/zaten var/);
    expect(() => svc.categoryCreate({ name: 'dİğer', kind: 'other' })).toThrow(/zaten var/);
    svc.employeeCreate({ input: emp({ fullName: 'İsmail Işık' }) });
    expect(svc.employeeCreate({ input: emp({ fullName: 'ismail ışık' }) }).duplicate).toMatch(/zaten var/);
    expect(() => svc.siteSave({ input: { companyId: main.id, name: 'Merkez Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } })).toThrow(/zaten var/);
    expect(() => svc.siteSave({ input: { companyId: main.id, name: 'X', address: '', startDate: '2026-05-01', endDate: '2026-04-01', status: 'active', notes: '' } })).toThrow(/bitiş/);
    expect(() => svc.companyDelete(other.id)).toThrow(/şantiye var/);

    const a = svc.employeeCreate({ input: emp({ siteId: siteA.id }) }).item!;
    expect(a).toMatchObject({ siteName: 'Merkez Atölye', companyName: main.name });
    svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '19:00', breakMinutes: 0, hourlyRateKurus: 100 } });
    const r = svc.siteDelete(siteA.id);
    expect(r.deleted).toBe(false);
    expect(r.reason).toMatch(/Tamamlandı/);
    // Kaydı olmayan şantiye silinir, çalışanları şantiyesiz kalır
    const b = svc.employeeCreate({ input: emp({ fullName: 'Veli', siteId: siteB.id }) }).item!;
    expect(svc.siteDelete(siteB.id).deleted).toBe(true);
    expect(svc.employeeGet(b.id).employee.siteId).toBeNull();
    expect(svc.companyDelete(other.id)).toBeUndefined();
  });

  it('çalışan T.C. ve IBAN doğrulaması, tekrar eden T.C. engellenir, toplu şantiye atama', async () => {
    const { svc, siteA, siteB } = await setup();
    expect(() => svc.employeeCreate({ input: emp({ nationalId: '12345678901' }) })).toThrow(/T.C. kimlik/);
    expect(() => svc.employeeCreate({ input: emp({ iban: 'TR00 1234' }) })).toThrow(/IBAN geçersiz/);
    const a = svc.employeeCreate({
      input: emp({ nationalId: '10000000146', iban: 'tr33 0006 1005 1978 6457 8413 26', bankName: 'Ziraat', bloodType: 'A Rh+', birthDate: '1990-05-01', emergencyName: 'Ayşe', emergencyPhone: '0555', sgkNo: '123', address: 'Ankara' }),
    }).item!;
    // Kan grubu (özel nitelikli veri) gönderilse bile saklanmaz
    expect(a).toMatchObject({ nationalId: '10000000146', iban: 'TR330006100519786457841326', bloodType: '', birthDate: '1990-05-01' });
    expect(() => svc.employeeCreate({ input: emp({ fullName: 'Başka', nationalId: '10000000146' }) })).toThrow(/zaten "Ahmet Yılmaz"/);
    const b = svc.employeeCreate({ input: emp({ fullName: 'Can' }) }).item!;
    expect(svc.employeesAssignSite({ employeeIds: [a.id, b.id], siteId: siteB.id })).toBe(2);
    expect(svc.employeesList().every((e) => e.siteId === siteB.id)).toBe(true);
    expect(svc.sitesList().find((s) => s.id === siteB.id)!.employeeCount).toBe(2);
    expect(svc.sitesList().find((s) => s.id === siteA.id)!.employeeCount).toBe(0);
  });
});

describe('toplu mesai', () => {
  it('bir şantiyenin bütün çalışanlarına tek işlemde mesai yazar, mükerrerleri atlar', async () => {
    const { svc, siteA } = await setup();
    const ids = ['Ali', 'Veli', 'Can'].map((n, i) => svc.employeeCreate({ input: emp({ fullName: n, siteId: siteA.id, overtimeRateKurus: 10000 * (i + 1) }) }).item!);
    // Veli'nin o gün aynı başlangıç saatinde zaten kaydı var
    svc.overtimeCreate({ input: { employeeId: ids[1].id, date: '2026-10-16', startTime: '18:00', endTime: '19:00', breakMinutes: 0, hourlyRateKurus: 20000 } });
    const res = svc.overtimeBulkCreate({
      siteId: siteA.id, date: '2026-10-16', startTime: '18:00', endTime: '21:00', breakMinutes: 0, description: 'Teslim öncesi',
      entries: ids.map((e) => ({ employeeId: e.id, hourlyRateKurus: e.overtimeRateKurus })),
    });
    expect(res.created).toBe(2);
    expect(res.totalKurus).toBe(3 * 10000 + 3 * 30000);
    expect(res.skipped).toEqual([{ employeeName: 'Veli', reason: expect.stringMatching(/zaten mesai/) }]);
    const list = svc.overtimeList({ siteId: siteA.id, from: '2026-10-16', to: '2026-10-16' });
    expect(list).toHaveLength(3);
    expect(list.every((o) => o.siteName === 'Merkez Atölye')).toBe(true);
    // Hatalı saatlerde hiçbir kayıt eklenmez
    expect(() => svc.overtimeBulkCreate({ siteId: siteA.id, date: '2026-10-17', startTime: '18:00', endTime: '18:00', breakMinutes: 0, entries: [{ employeeId: ids[0].id, hourlyRateKurus: 1 }] })).toThrow(/aynı olamaz/);
    expect(() => svc.overtimeBulkCreate({ siteId: siteA.id, date: '2026-10-17', startTime: '18:00', endTime: '19:00', breakMinutes: 0, entries: [] })).toThrow(/En az bir/);
    expect(svc.overtimeList({ from: '2026-10-17', to: '2026-10-17' })).toHaveLength(0);
  });
});

describe('şantiye bazlı raporlar ve takvim', () => {
  it('rapor ve takvim şantiye/firma filtresine göre hesaplanır', async () => {
    const { svc, main, other, siteA, siteB } = await setup();
    const cats = Object.fromEntries(svc.categoriesList().map((c) => [c.name, c.id]));
    const a = svc.employeeCreate({ input: emp({ siteId: siteA.id }) }).item!;
    const b = svc.employeeCreate({ input: emp({ fullName: 'Bora', siteId: siteB.id }) }).item!;
    svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '20:00', breakMinutes: 0, hourlyRateKurus: 10000 } });
    svc.overtimeCreate({ input: { employeeId: b.id, date: '2026-10-15', startTime: '18:00', endTime: '19:00', breakMinutes: 0, hourlyRateKurus: 10000 } });
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Çimento', categoryId: cats['Yedek parça ve malzeme'], amountKurus: 500000, isPaid: false, siteId: siteB.id } });
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Kırtasiye', categoryId: cats['Diğer'], amountKurus: 10000, isPaid: true } });
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Mesai ödemesi', categoryId: cats['Ek mesai'], amountKurus: 20000, isPaid: true, siteId: siteA.id } });

    const all = svc.summary({ from: '2026-10-01', to: '2026-10-31' });
    expect(all.totalKurus).toBe(20000 + 10000 + 500000 + 10000);
    const sa = svc.summary({ from: '2026-10-01', to: '2026-10-31', siteId: siteA.id });
    expect(sa).toMatchObject({ overtimeKurus: 20000, otherKurus: 0, totalKurus: 20000, overtimeCategoryKurus: 20000 });
    const cb = svc.summary({ from: '2026-10-01', to: '2026-10-31', companyId: other.id });
    expect(cb).toMatchObject({ overtimeKurus: 10000, otherKurus: 500000, unpaidKurus: 500000 });
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31', companyId: main.id }).totalKurus).toBe(20000);

    // Takvim: "Ek mesai" gider kaydı gün toplamına eklenmez
    const cal = svc.calendarMonth({ from: '2026-10-01', to: '2026-10-31' });
    expect(cal).toEqual([{ date: '2026-10-15', overtimeMinutes: 180, overtimeKurus: 30000, overtimeCount: 2, expenseKurus: 510000, expenseCount: 3, reportCount: 0 }]);
    expect(svc.calendarMonth({ from: '2026-10-01', to: '2026-10-31', siteId: siteA.id })[0]).toMatchObject({ overtimeCount: 1, expenseKurus: 0, expenseCount: 1 });

    // Günlük rapor: aynı gün + şantiye için tek rapor (ikinci kayıt günceller)
    expect(() => svc.dailyReportSave({ date: '2026-10-15', siteId: siteA.id })).toThrow(/boş olamaz/);
    const r1 = svc.dailyReportSave({ date: '2026-10-15', siteId: siteA.id, weather: 'Güneşli', workDone: 'Kaynak işleri' });
    const r2 = svc.dailyReportSave({ date: '2026-10-15', siteId: siteA.id, workDone: 'Kaynak ve boya işleri', notes: 'Malzeme eksik' });
    expect(r2.id).toBe(r1.id);
    expect(r2).toMatchObject({ workDone: 'Kaynak ve boya işleri', siteName: 'Merkez Atölye', weather: '' });
    svc.dailyReportSave({ date: '2026-10-15', siteId: null, notes: 'Genel not' });
    svc.dailyReportSave({ date: '2026-10-15', siteId: null, notes: 'Genel not 2' });
    const day = svc.dayDetail({ date: '2026-10-15' });
    expect(day.reports.map((r) => r.siteName)).toEqual(['Merkez Atölye', null]);
    expect(day.overtime).toHaveLength(2);
    expect(day.expenses).toHaveLength(3);
    expect(day.summary.totalKurus).toBe(540000);
    expect(svc.dayDetail({ date: '2026-10-15', siteId: siteB.id }).reports).toHaveLength(0);
    expect(svc.calendarMonth({ from: '2026-10-01', to: '2026-10-31' })[0].reportCount).toBe(2);
    svc.dailyReportDelete(r1.id);
    expect(svc.dayDetail({ date: '2026-10-15' }).reports).toHaveLength(1);
    // Raporu olan şantiye silinemez
    svc.dailyReportSave({ date: '2026-10-16', siteId: siteA.id, notes: 'x' });
    expect(svc.siteDelete(siteA.id).deleted).toBe(false);
  });
});

describe('migration 4 -> 5 (1.4 sürümündeki puantaj ve bordro verisi)', () => {
  it('puantaj ve bordro kayıtları korunur, fırçalar eklenir', async () => {
    const file = tempDbPath();
    const old = await Db.open(WASM_DIR, file);
    old.tx(() => {
      for (const m of MIGRATIONS.slice(0, 4)) m.up(old);
      old.exec('PRAGMA user_version = 4');
    });
    old.run(`INSERT INTO employees (employee_no, full_name, position, monthly_salary_kurus) VALUES ('P0001', 'Eski Usta', 'Usta', 3000000)`);
    old.run(`INSERT INTO attendance (employee_id, date, status) VALUES (1, '2026-10-01', 'X'), (1, '2026-10-02', 'D'), (1, '2026-10-03', 'Y')`);
    old.run(`INSERT INTO expenses (date, name, category_id, amount_kurus, is_paid, employee_id, salary_period) VALUES ('2026-09-30', 'Maaş', 1, 2900000, 1, 1, '2026-09')`);
    old.run(`INSERT INTO payrolls (employee_id, period, expense_id, paid_half_days, monthly_salary_kurus, normal_kurus, overtime_kurus, total_kurus, official_kurus, cash_kurus)
             VALUES (1, '2026-09', 1, 58, 3000000, 2900000, 0, 2900000, 2117000, 783000)`);
    old.persist();
    old.close();
    const { svc } = await openService(file);
    expect(svc.dbInfo().schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    const m = svc.attendanceMonth({ month: '2026-10' });
    expect(m.rows[0].cells).toEqual({ '2026-10-01': 'X', '2026-10-02': 'D', '2026-10-03': 'Y' });
    expect(m.statuses.find((s) => s.code === 'X')!.short).toBe('8');
    expect(svc.payrollMonth({ month: '2026-10' }).rows[0].live.paidDays).toBe(1.5); // işaretlenen günler: 1 + 0,5
    // Eylül bordrosu (eski sürümde kaydedilmiş) kilitli değerleriyle korunur
    expect(svc.payrollMonth({ month: '2026-09' }).rows[0].saved).toMatchObject({ normalKurus: 2900000, cashKurus: 783000, isPaid: true });
    expect(svc.summary({ from: '2026-09-01', to: '2026-09-30' }).salaryKurus).toBe(2900000);
  });
});

describe('migration 5 -> 6 (Kira ve Elektrik ve su kaldırılır)', () => {
  it('bu kategorilerdeki giderler "Diğer"e taşınır, toplamlar değişmez', async () => {
    const file = tempDbPath();
    const old = await Db.open(WASM_DIR, file);
    old.tx(() => {
      for (const m of MIGRATIONS.slice(0, 5)) m.up(old);
      old.exec('PRAGMA user_version = 5');
    });
    const cat = (n: string) => old.get<{ id: number }>('SELECT id FROM expense_categories WHERE name = ?', [n])!.id;
    old.run('INSERT INTO expenses (date, name, category_id, amount_kurus, is_paid) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 0)',
      ['2026-10-01', 'Dükkan kirası', cat('Kira'), 1_500_000, '2026-10-02', 'Elektrik faturası', cat('Elektrik ve su'), 80_000]);
    old.persist();
    old.close();
    const { svc } = await openService(file);
    expect(svc.categoriesList().map((c) => c.name)).toEqual(['Personel maaşı', 'Ek mesai', 'Yemek', 'Yol ve ulaşım', 'Yedek parça ve malzeme', 'Diğer']);
    expect(svc.expensesList({}).map((x) => x.categoryName)).toEqual(['Diğer', 'Diğer']);
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ otherKurus: 1_580_000, unpaidKurus: 80_000 });
  });
});
