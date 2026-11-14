// Artımlı indirme: yalnızca değişen satırlar iner, kendi değişikliğimizin geri gelmesi ekranı yenilemez.
import { describe, expect, it } from 'vitest';
import { device, emp, setup } from './fakeServer';

async function twoDevices() {
  const server = await setup();
  server.incremental = true;
  const A = await device(server);
  const B = await device(server);
  return { server, A, B };
}

describe('artımlı indirme', () => {
  it('başka cihazdaki ekleme, güncelleme ve silme gelir; tam indirme yapılmaz', async () => {
    const { server, A, B } = await twoDevices();
    const full = server.fullPulls;
    const ali = (await B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Ali Usta' }) }))).item!;
    await A.engine.refresh();
    expect(A.engine.lastRefreshChanged).toBe(true);
    expect(A.svc.employeesList().map((e) => e.fullName)).toEqual(['Ali Usta']);

    await B.engine.call('employeeUpdate', () => B.svc.employeeUpdate({ id: ali.id, input: emp({ fullName: 'Ali Usta', position: 'Ustabaşı' }) }));
    await B.engine.call('attendanceFill', () => B.svc.attendanceFill({ month: '2026-10', employeeIds: [ali.id], workSaturday: true, untilToday: false, today: '2026-10-31' }));
    await A.engine.refresh();
    expect(A.svc.employeesList()[0].position).toBe('Ustabaşı');
    expect(A.svc.attendanceMonth({ month: '2026-10' }).rows[0].cells['2026-10-15']).toBe('X');

    // Kaydı olmayan çalışan silinebilir (puantajı olan silinemez, uygulama kuralı)
    const veli = (await B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Veli Kalfa' }) }))).item!;
    await A.engine.refresh();
    expect(A.svc.employeesList()).toHaveLength(2);
    expect((await B.engine.call('employeeDelete', () => B.svc.employeeDelete(veli.id))).deleted).toBe(true);
    await A.engine.refresh();
    expect(A.svc.employeesList().map((e) => e.fullName)).toEqual(['Ali Usta']);
    expect(server.fullPulls).toBe(full); // hep artımlı
    expect(server.pullSinceCalls).toBe(4);
  });

  it('kendi değişikliğimiz geri geldiğinde "değişti" sayılmaz', async () => {
    const { A } = await twoDevices();
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Kendi Kaydım' }) }));
    await A.engine.refresh();
    expect(A.engine.lastRefreshChanged).toBe(false);
  });

  it('paylaşılan şantiyeler değişince baştan indirir', async () => {
    const { server, A } = await twoDevices();
    const full = server.fullPulls;
    server.siteIds = [42];
    await A.engine.refresh();
    expect(server.fullPulls).toBe(full + 1);
    expect(A.engine.me!.siteIds).toEqual([42]);
  });

  it('sunucuda artımlı indirme yoksa eskisi gibi tam indirir', async () => {
    const server = await setup();
    const A = await device(server);
    const full = server.fullPulls;
    await A.engine.refresh();
    expect(server.fullPulls).toBe(full + 1);
  });
});
