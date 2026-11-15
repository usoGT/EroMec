import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { openService, tempDbPath } from './helpers';
import { LATEST_SCHEMA_VERSION } from '../src/main/db/migrations';
import type { EmployeeInput } from '../src/shared/types';

const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz',
  position: 'Usta',
  monthlySalaryKurus: 3000000,
  overtimeRateKurus: 20000,
  startDate: '2024-03-01',
  status: 'active',
  ...over,
});

describe('veritabanı ve migration', () => {
  it('tablolar, kategoriler ve ayarlar oluşturulur', async () => {
    const { db, svc } = await openService();
    const tables = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['employees', 'overtime_records', 'expenses', 'settings', 'expense_categories', 'activity_log']));
    expect(svc.dbInfo().schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(svc.categoriesList().map((c) => c.name)).toEqual([
      'Personel maaşı', 'Ek mesai', 'Yemek', 'Yol ve ulaşım', 'Yedek parça ve malzeme', 'Diğer',
    ]);
    expect(svc.settingsGet()).toEqual({ companyName: 'Firmam', appName: 'Puanto', currency: 'TRY', theme: 'light', dailyMinWageKurus: 0 });
    // Başlangıçta hiçbir sahte kayıt yok
    expect(svc.employeesList()).toHaveLength(0);
    expect(svc.expensesList({})).toHaveLength(0);
    const d = svc.dashboard('2026-10-15');
    expect(d.totalEmployeeCount + d.todayTotalKurus + d.weekTotalKurus + d.monthTotalKurus).toBe(0);
  });

  it('veriler uygulama kapatılıp açıldığında korunur', async () => {
    const file = tempDbPath();
    const a = await openService(file);
    const e = a.svc.employeeCreate({ input: emp({ fullName: 'Şükrü Öztürk', position: 'Kaynakçı' }) }).item!;
    a.svc.overtimeCreate({ input: { employeeId: e.id, date: '2026-10-15', startTime: '18:00', endTime: '20:00', breakMinutes: 0, hourlyRateKurus: 20000 } });
    const cat = a.svc.categoriesList().find((c) => c.name === 'Yemek')!;
    a.svc.expenseCreate({ input: { date: '2026-10-15', name: 'Öğle yemeği', categoryId: cat.id, amountKurus: 45050, isPaid: true } });
    a.svc.settingsSave({ companyName: 'Eroğlu Mekanik Ltd. Şti.', appName: 'Puanto', currency: 'TRY', theme: 'dark', dailyMinWageKurus: 73_000 });
    expect(() => a.svc.settingsSave({ companyName: 'x', appName: 'y', currency: 'TRY', theme: 'mor' as never, dailyMinWageKurus: 0 })).toThrow(/görünüm/);
    a.db.close();
    expect(fs.existsSync(file!)).toBe(true);

    const b = await openService(file);
    expect(b.svc.employeesList()[0].fullName).toBe('Şükrü Öztürk');
    expect(b.svc.overtimeList({})[0].totalKurus).toBe(40000);
    expect(b.svc.expensesList({})[0].amountKurus).toBe(45050);
    expect(b.svc.settingsGet().companyName).toBe('Eroğlu Mekanik Ltd. Şti.');
    expect(b.svc.settingsGet().theme).toBe('dark');
    expect(b.svc.settingsGet().dailyMinWageKurus).toBe(73_000);
    // Yeniden açınca migration tekrar çalışmaz, foreign key açık kalır
    expect(b.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1);
  });
});

describe('çalışanlar', () => {
  it('ekleme, doğrulama, düzenleme, numara üretimi', async () => {
    const { svc } = await openService();
    expect(() => svc.employeeCreate({ input: emp({ fullName: '  ' }) })).toThrow('Ad soyad boş bırakılamaz.');
    expect(() => svc.employeeCreate({ input: emp({ position: '' }) })).toThrow('Görev boş bırakılamaz.');
    expect(() => svc.employeeCreate({ input: emp({ monthlySalaryKurus: -1 }) })).toThrow(/negatif/);
    expect(() => svc.employeeCreate({ input: emp({ startDate: '2026-02-30' }) })).toThrow(/İşe başlama tarihi geçersiz/);
    const a = svc.employeeCreate({ input: emp() }).item!;
    const b = svc.employeeCreate({ input: emp({ fullName: 'Mehmet Kaya' }) }).item!;
    expect(a.employeeNo).toBe('P0001');
    expect(b.employeeNo).toBe('P0002');
    // aynı isimde aktif çalışan -> uyarı, kayıt eklenmez
    const dup = svc.employeeCreate({ input: emp({ fullName: 'ahmet yılmaz ' }) });
    expect(dup.duplicate).toMatch(/zaten var/);
    expect(svc.employeesList()).toHaveLength(2);
    expect(svc.employeeCreate({ input: emp(), force: true }).item!.employeeNo).toBe('P0003');
    const u = svc.employeeUpdate({ id: b.id, input: emp({ fullName: 'Mehmet Kaya', position: 'Şef', monthlySalaryKurus: 4000000 }) });
    expect(u.position).toBe('Şef');
    expect(u.monthlySalaryKurus).toBe(4000000);
  });

  it('kaydı olan çalışan silinmez, pasife alınabilir; kaydı olmayan silinir', async () => {
    const { svc } = await openService();
    const a = svc.employeeCreate({ input: emp() }).item!;
    const b = svc.employeeCreate({ input: emp({ fullName: 'Ali Veli' }) }).item!;
    svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-01', startTime: '18:00', endTime: '19:00', breakMinutes: 0, hourlyRateKurus: 100 } });
    const r = svc.employeeDelete(a.id);
    expect(r.deleted).toBe(false);
    expect(r.reason).toMatch(/Ayrıldı/);
    expect(svc.overtimeList({})).toHaveLength(1);
    expect(svc.employeeSetStatus({ id: a.id, status: 'left' }).status).toBe('left');
    expect(svc.employeeDelete(b.id).deleted).toBe(true);
    expect(svc.employeesList().map((e) => e.id)).toEqual([a.id]);
  });
});

describe('mesailer', () => {
  it('hesaplama, gece yarısı, geçmiş tutarların korunması', async () => {
    const { svc } = await openService();
    const a = svc.employeeCreate({ input: emp({ overtimeRateKurus: 15000 }) }).item!;
    const r1 = svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-14', startTime: '22:00', endTime: '01:30', breakMinutes: 30, hourlyRateKurus: 15000, description: 'Acil iş' } }).item!;
    expect(r1.workedMinutes).toBe(180);
    expect(r1.totalKurus).toBe(45000);
    // Çalışanın maaşı/ücreti değişse bile eski kayıt değişmez
    svc.employeeUpdate({ id: a.id, input: emp({ overtimeRateKurus: 99900, monthlySalaryKurus: 9_000_000 }) });
    expect(svc.overtimeList({})[0].totalKurus).toBe(45000);
    expect(svc.overtimeList({})[0].hourlyRateKurus).toBe(15000);
    // Kayıt bazında farklı ücret
    const r2 = svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '20:00', breakMinutes: 0, hourlyRateKurus: 25000 } }).item!;
    expect(r2.totalKurus).toBe(50000);
    // Düzenleme yeniden hesaplar
    const r2b = svc.overtimeUpdate({ id: r2.id, input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '21:00', breakMinutes: 0, hourlyRateKurus: 25000 } });
    expect(r2b.workedMinutes).toBe(180);
    expect(r2b.totalKurus).toBe(75000);
  });

  it('hatalı ve mükerrer kayıtlar engellenir', async () => {
    const { svc } = await openService();
    const a = svc.employeeCreate({ input: emp() }).item!;
    const base = { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '20:00', breakMinutes: 0, hourlyRateKurus: 100 };
    expect(() => svc.overtimeCreate({ input: { ...base, endTime: '18:00' } })).toThrow(/aynı olamaz/);
    expect(() => svc.overtimeCreate({ input: { ...base, breakMinutes: 120 } })).toThrow(/Mola/);
    expect(() => svc.overtimeCreate({ input: { ...base, employeeId: 999 } })).toThrow(/çalışan bulunamadı/);
    svc.overtimeCreate({ input: base });
    expect(() => svc.overtimeCreate({ input: base, force: true })).toThrow(/zaten var/);
    const other = svc.overtimeCreate({ input: { ...base, startTime: '06:00', endTime: '07:00' } });
    expect(other.duplicate).toMatch(/zaten mesai kaydı var/);
    expect(svc.overtimeCreate({ input: { ...base, startTime: '06:00', endTime: '07:00' }, force: true }).item).toBeTruthy();
    expect(svc.overtimeList({})).toHaveLength(2);
  });

  it('günlük/haftalık/aylık toplamlar ve filtreler', async () => {
    const { svc } = await openService();
    const a = svc.employeeCreate({ input: emp() }).item!;
    const b = svc.employeeCreate({ input: emp({ fullName: 'Can' }) }).item!;
    const add = (employeeId: number, date: string, end: string) =>
      svc.overtimeCreate({ input: { employeeId, date, startTime: '18:00', endTime: end, breakMinutes: 0, hourlyRateKurus: 6000 } });
    add(a.id, '2026-10-15', '19:00'); // bugün (perşembe) 60 dk
    add(b.id, '2026-10-12', '20:00'); // pazartesi 120 dk
    add(a.id, '2026-10-11', '21:00'); // önceki pazar (önceki hafta) 180 dk
    add(a.id, '2026-09-30', '22:00'); // önceki ay 240 dk
    const t = svc.overtimeTotals({ today: '2026-10-15', filter: {} });
    expect(t.dayMinutes).toBe(60);
    expect(t.weekMinutes).toBe(180);
    expect(t.monthMinutes).toBe(360);
    expect(t.monthKurus).toBe(36000);
    expect(t.filteredMinutes).toBe(600);
    const ta = svc.overtimeTotals({ today: '2026-10-15', filter: { employeeId: a.id } });
    expect(ta.weekMinutes).toBe(60);
    expect(svc.overtimeList({ from: '2026-10-01', to: '2026-10-31', employeeId: a.id })).toHaveLength(2);
  });
});

describe('giderler', () => {
  it('ekleme, filtreleme, arama, mükerrer uyarısı', async () => {
    const { svc } = await openService();
    const cats = Object.fromEntries(svc.categoriesList().map((c) => [c.name, c.id]));
    const add = (date: string, name: string, cat: string, amount: number, paid: boolean) =>
      svc.expenseCreate({ input: { date, name, categoryId: cats[cat], amountKurus: amount, isPaid: paid } });
    add('2026-10-01', 'Servis aracı', 'Yol ve ulaşım', 2500000, true);
    add('2026-10-15', 'İşçi yemeği', 'Yemek', 120050, false);
    add('2026-09-20', 'Fren balatası', 'Yedek parça ve malzeme', 85000, false);
    expect(add('2026-10-15', 'İşçi yemeği', 'Yemek', 120050, false).duplicate).toMatch(/zaten var/);
    // Ad boşsa kategori adı kullanılır (gereksiz zorunlu alan yok)
    expect(svc.expenseCreate({ input: { date: '2026-10-02', name: '', categoryId: cats['Diğer'], amountKurus: 100, isPaid: true } }).item!.name).toBe('Diğer');
    expect(() => add('2026-10-02', 'x', 'Diğer', -5, true)).toThrow(/negatif/);
    expect(() => add('02.10.2026', 'x', 'Diğer', 5, true)).toThrow(/Tarih geçersiz/);

    expect(svc.expensesList({ from: '2026-10-01', to: '2026-10-31' })).toHaveLength(3);
    expect(svc.expensesList({ categoryId: cats['Yol ve ulaşım'] })).toHaveLength(1);
    expect(svc.expensesList({ paid: 'unpaid' }).map((x) => x.name).sort()).toEqual(['Fren balatası', 'İşçi yemeği']);
    // Türkçe büyük/küçük harf duyarsız arama: "işçi" ile "İşçi" bulunur
    expect(svc.expensesList({ search: 'işçi' })).toHaveLength(1);
    expect(svc.expensesList({ search: 'BALATA' })).toHaveLength(1);
  });

  it('düzenleme ve silme', async () => {
    const { svc } = await openService();
    const cat = svc.categoriesList()[2];
    const x = svc.expenseCreate({ input: { date: '2026-10-01', name: 'Çay', categoryId: cat.id, amountKurus: 5000, isPaid: false } }).item!;
    const u = svc.expenseUpdate({ id: x.id, input: { date: '2026-10-02', name: 'Çay ve simit', categoryId: cat.id, amountKurus: 7550, isPaid: true, description: 'Sabah' } });
    expect(u).toMatchObject({ date: '2026-10-02', name: 'Çay ve simit', amountKurus: 7550, isPaid: true, description: 'Sabah' });
    svc.expenseDelete(x.id);
    expect(svc.expensesList({})).toHaveLength(0);
    expect(() => svc.expenseDelete(x.id)).toThrow(/bulunamadı/);
  });

  it('maaş ödemesi aynı ay için iki kez kaydedilemez', async () => {
    const { svc } = await openService();
    const a = svc.employeeCreate({ input: emp() }).item!;
    const p = svc.salaryPaymentCreate({ employeeId: a.id, period: '2026-10', date: '2026-10-31', amountKurus: 3000000, isPaid: true });
    expect(p.categoryName).toBe('Personel maaşı');
    expect(p.name).toBe('Maaş - Ahmet Yılmaz (Ekim 2026)');
    expect(() => svc.salaryPaymentCreate({ employeeId: a.id, period: '2026-10', date: '2026-11-01', amountKurus: 3000000, isPaid: true })).toThrow(/zaten kaydedilmiş/);
    expect(svc.salaryPaymentCreate({ employeeId: a.id, period: '2026-11', date: '2026-11-30', amountKurus: 3000000, isPaid: false }).salaryPeriod).toBe('2026-11');
    // Maaş ödemesinin kategorisi maaş dışına çevrilemez
    const other = svc.categoriesList().find((c) => c.kind === 'other')!;
    expect(() => svc.expenseUpdate({ id: p.id, input: { date: p.date, name: p.name, categoryId: other.id, amountKurus: 1, isPaid: true } })).toThrow(/maaş ödemesidir/);
    const detail = svc.employeeGet(a.id);
    expect(detail.salaryPaymentCount).toBe(2);
    expect(detail.salaryPaidKurusTotal).toBe(6000000);
  });
});

describe('raporlar ve ana sayfa', () => {
  it('çift sayım yapılmaz, toplamlar doğru hesaplanır', async () => {
    const { svc } = await openService();
    const cats = Object.fromEntries(svc.categoriesList().map((c) => [c.name, c.id]));
    const a = svc.employeeCreate({ input: emp({ monthlySalaryKurus: 3000000 }) }).item!;
    svc.employeeCreate({ input: emp({ fullName: 'Ayrılan', status: 'left' }) });
    // Mesai: 2 saat × 200 ₺ = 400 ₺ (bugün)
    svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-15', startTime: '18:00', endTime: '20:00', breakMinutes: 0, hourlyRateKurus: 20000 } });
    // Aynı mesainin ödemesi "Ek mesai" kategorisinde de kaydedilmiş (toplama ikinci kez girmemeli)
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Mesai ödemesi', categoryId: cats['Ek mesai'], amountKurus: 40000, isPaid: true } });
    // Maaş ödemesi (bu hafta pazartesi)
    svc.salaryPaymentCreate({ employeeId: a.id, period: '2026-09', date: '2026-10-12', amountKurus: 3000000, isPaid: true });
    // Diğer giderler
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Yemek', categoryId: cats['Yemek'], amountKurus: 10010, isPaid: false } });
    svc.expenseCreate({ input: { date: '2026-10-01', name: 'Kira', categoryId: cats['Diğer'], amountKurus: 2000000, isPaid: false } });
    svc.expenseCreate({ input: { date: '2026-09-30', name: 'Eylül elektrik', categoryId: cats['Yemek'], amountKurus: 50000, isPaid: true } });

    const day = svc.summary({ from: '2026-10-15', to: '2026-10-15' });
    expect(day).toMatchObject({ salaryKurus: 0, overtimeKurus: 40000, otherKurus: 10010, totalKurus: 50010, overtimeCategoryKurus: 40000, paidKurus: 40000, unpaidKurus: 10010 });

    const week = svc.summary({ from: '2026-10-12', to: '2026-10-18' });
    expect(week.totalKurus).toBe(3000000 + 40000 + 10010);

    const month = svc.summary({ from: '2026-10-01', to: '2026-10-31' });
    expect(month).toMatchObject({ salaryKurus: 3000000, overtimeKurus: 40000, otherKurus: 2010010, totalKurus: 5050010, paidKurus: 3040000, unpaidKurus: 2010010 });
    expect(month.byCategory.find((c) => c.name === 'Ek mesai')!.includedInTotal).toBe(false);
    // Maliyet (yapılan iş) ve gider (kaydedilen ödemeler) ayrı hesaplanır
    expect(month).toMatchObject({
      costLaborKurus: 0, costOvertimeKurus: 40000, costOtherKurus: 2010010, costTotalKurus: 2050010,
      expSalaryKurus: 3000000, expOvertimeKurus: 40000, expOtherKurus: 2010010, expTotalKurus: 5050010, diffKurus: -3000000,
    });

    expect(() => svc.summary({ from: '2026-10-31', to: '2026-10-01' })).toThrow(/Başlangıç tarihi/);

    const d = svc.dashboard('2026-10-15');
    expect(d).toMatchObject({
      activeEmployeeCount: 1, totalEmployeeCount: 2, todayOvertimeMinutes: 120,
      todayTotalKurus: 50010, weekTotalKurus: 50010, monthTotalKurus: 2050010, totalUnpaidKurus: 2010010,
    });
    expect(d.recent.length).toBeGreaterThan(0);
    expect(d.recent[0].summary).toMatch(/Eylül elektrik/);
  });
});

describe('gider kategorisi türü', () => {
  it('maaş türünde eklenen kategori raporda maaş gideri sayılır; tür sonradan değiştirilebilir', async () => {
    const { svc } = await openService();
    const c = svc.categoryCreate({ name: 'Usta maaşları', kind: 'salary' });
    svc.expenseCreate({ input: { date: '2026-10-10', name: 'Ekim maaşları', categoryId: c.id, amountKurus: 5_000_000, isPaid: true } });
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ salaryKurus: 5_000_000, otherKurus: 0 });
    svc.categoryUpdate({ id: c.id, name: 'Usta maaşları', kind: 'other' });
    expect(svc.summary({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ salaryKurus: 0, otherKurus: 5_000_000 });
    // Korumalı: Personel maaşı ve Ek mesai silinemez, türü değişmez, adı değişebilir
    const maas = svc.categoriesList().find((x) => x.name === 'Personel maaşı')!;
    expect(svc.categoriesList().filter((x) => x.isSystem).map((x) => x.name)).toEqual(['Personel maaşı', 'Ek mesai']);
    expect(() => svc.categoryUpdate({ id: maas.id, name: 'Maaş', kind: 'other' })).toThrow(/türü değiştirilemez/);
    expect(svc.categoryUpdate({ id: maas.id, name: 'Maaşlar', kind: 'salary' }).name).toBe('Maaşlar');
    expect(() => svc.categoryDelete({ id: maas.id })).toThrow(/silinemez/);
    // Başlangıç kategorileri (Yemek vb.) artık silinebilir; gideri varsa taşınarak silinir
    expect(() => svc.categoryDelete({ id: c.id })).toThrow(/taşınacağı kategoriyi seçin/);
    const diger = svc.categoriesList().find((x) => x.name === 'Diğer')!;
    svc.categoryDelete({ id: c.id, moveToId: diger.id });
    expect(svc.expensesList({})[0].categoryName).toBe('Diğer');
    expect(svc.categoriesList().find((x) => x.name === 'Diğer')!.expenseCount).toBe(1);
    const yemek = svc.categoriesList().find((x) => x.name === 'Yemek')!;
    svc.categoryDelete({ id: yemek.id });
    expect(svc.categoriesList().some((x) => x.name === 'Yemek')).toBe(false);
  });
});
