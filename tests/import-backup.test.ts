// Masaüstü yedeğini çevrimiçi hesaba aktarma
import { describe, expect, it } from 'vitest';
import { openService } from './helpers';
import { device, emp, setup } from './fakeServer';
import { importBackup, importState } from '../src/web/importBackup';

/** Masaüstünde birikmiş veri: iki şantiye, üç çalışan, puantaj, mesai, gider ve kaydedilmiş bordro */
async function desktopData() {
  const { db, svc } = await openService(null);
  const main = svc.companiesList()[0];
  const other = svc.companySave({ input: { name: 'Yıldız İnşaat', taxOffice: '', taxNo: '', phone: '', address: '', notes: '' } });
  const s1 = svc.siteSave({ input: { companyId: main.id, name: 'Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const s2 = svc.siteSave({ input: { companyId: other.id, name: 'Ataşehir', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
  const a = svc.employeeCreate({ input: emp({ fullName: 'Ali Usta', siteId: s1.id, nationalId: '10000000146' }) }).item!;
  const b = svc.employeeCreate({ input: emp({ fullName: 'Veli Kalfa', siteId: s2.id }) }).item!;
  svc.employeeCreate({ input: emp({ fullName: 'Şantiyesiz Can' }) });
  svc.attendanceFill({ month: '2026-10', employeeIds: [a.id, b.id], workSaturday: true, untilToday: false, today: '2026-10-31' });
  svc.overtimeCreate({ input: { employeeId: a.id, date: '2026-10-01', startTime: '18:00', endTime: '20:30', breakMinutes: 0, hourlyRateKurus: 20000 } });
  const cat = svc.categoryCreate({ name: 'Nakliye', kind: 'other' });
  svc.expenseCreate({ input: { date: '2026-10-10', name: 'Kamyon', categoryId: cat.id, amountKurus: 150000, isPaid: true, siteId: s2.id } });
  svc.payrollSave({ month: '2026-10', employeeIds: [a.id], date: '2026-10-31', isPaid: true });
  svc.settingsSave({ ...svc.settingsGet(), companyName: 'Eroğlu Mekanik Ltd.', theme: 'dark' });
  return { db, svc };
}

describe('masaüstü yedeğini aktarma', () => {
  it('bütün kayıtlar yeni numaralarla ve bağları korunarak sunucuya gider', async () => {
    const server = await setup();
    const A = await device(server);
    // Hesapta zaten bir çalışan var: numaralar çakışmamalı
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Önceden Var' }) }));
    const src = await desktopData();

    const pushesBefore = server.pushes.length;
    const res = await A.engine.call('backupRestore', () => importBackup(A.db, src.db, {
      firstEmployeeNo: 'P0002', fingerprint: 'abc', chunk: 20, checkpoint: () => A.engine.checkpoint(),
    }));
    expect(res.added).toMatchObject({ companies: 1, sites: 2, employees: 3, attendance: 62, overtime_records: 1, payrolls: 1 });
    expect(res.matched.companies).toBe(1); // ana firma adıyla eşleşti
    expect(server.pushes.length - pushesBefore).toBeGreaterThan(3); // parça parça gönderildi

    // Başka bir cihaz (sunucudan) aynı veriyi görür
    const B = await device(server);
    const emps = B.svc.employeesList();
    expect(emps.map((e) => [e.employeeNo, e.fullName, e.siteName ?? null]).sort()).toEqual([
      ['P0001', 'Önceden Var', null], ['P0002', 'Ali Usta', 'Atölye'], ['P0003', 'Veli Kalfa', 'Ataşehir'], ['P0004', 'Şantiyesiz Can', null],
    ].sort());
    const ali = emps.find((e) => e.fullName === 'Ali Usta')!;
    const month = B.svc.attendanceMonth({ month: '2026-10' });
    expect(month.rows.find((r) => r.employeeId === ali.id)!.cells['2026-10-15']).toBe('X');
    expect(B.svc.payrollMonth({ month: '2026-10' }).rows.find((r) => r.employeeId === ali.id)!.saved).toBeTruthy();
    expect(B.svc.expensesList({}).find((x) => x.name === 'Kamyon')).toMatchObject({ categoryName: 'Nakliye', siteName: 'Ataşehir', amountKurus: 150000 });
    expect(B.svc.overtimeList({}).map((o) => o.employeeName)).toEqual(['Ali Usta']);
    // Fabrika ayarı yedekteki değerle değişti, tema (cihaza özel) değişmedi
    expect(B.svc.settingsGet()).toMatchObject({ companyName: 'Eroğlu Mekanik Ltd.', theme: 'light' });
    expect(importState(B.db, 'abc')).toMatch(/^tamamlandı/);
  });

  it('aynı T.C. numaralı çalışan ve aynı gün puantajı tekrar eklenmez', async () => {
    const server = await setup();
    const A = await device(server);
    const src = await desktopData();
    await A.engine.call('x', () => importBackup(A.db, src.db, { firstEmployeeNo: 'P0001', fingerprint: 'f1' }));
    const again = await A.engine.call('x', () => importBackup(A.db, src.db, { firstEmployeeNo: 'P0010', fingerprint: 'f2' }));
    expect(again.matched.employees).toBe(1); // Ali (T.C. ile)
    expect(again.added.attendance ?? 0).toBe(31); // Veli yeniden eklendi (T.C. yok), Ali'nin günleri atlandı
    expect(again.matched.sites).toBe(2);
    expect(server.tables.get('sites')!.size).toBe(2);
  });
});
