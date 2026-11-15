// PC'ye otomatik tarihli yedek ve internet yokken salt okunur son kopya
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autoBackupName, dailyBackup, pruneBackups } from '../src/main/autoBackup';
import { READ_ONLY_MESSAGE } from '../src/web/engine';
import { device, emp, setup } from './fakeServer';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-oto-'));
const bytes = (n: number) => new Uint8Array(200).fill(n);

describe('otomatik yedek', () => {
  it('her gün bir dosya yazar, aynı gün ikinci kez yazmaz, 30 günden eskisini siler', () => {
    const dir = tmp();
    const d1 = new Date(2026, 9, 1, 9);
    expect(dailyBackup(dir, bytes(1), d1)).toBe(path.join(dir, 'Puanto-otomatik-2026-10-01.db'));
    expect(dailyBackup(dir, bytes(2), new Date(2026, 9, 1, 18))).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, autoBackupName(d1)))[0]).toBe(1); // günün ilk hâli korunur

    for (let i = 2; i <= 31; i++) dailyBackup(dir, bytes(i), new Date(2026, 9, i, 9));
    expect(fs.readdirSync(dir).length).toBe(30); // 2–31 Ekim
    expect(fs.existsSync(path.join(dir, 'Puanto-otomatik-2026-10-01.db'))).toBe(false);

    fs.writeFileSync(path.join(dir, 'EroMec-Yedek-2020-01-01.db'), bytes(9)); // elle alınan yedeğe dokunulmaz
    pruneBackups(dir, new Date(2027, 0, 1));
    expect(fs.readdirSync(dir)).toEqual(['EroMec-Yedek-2020-01-01.db']);
  });
});

describe('salt okunur son kopya', () => {
  it('okuma çalışır, yazma Türkçe uyarıyla reddedilir, bağlanınca normale döner', async () => {
    const server = await setup();
    const A = await device(server);
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Ali Usta' }) }));
    const copy = A.db.exportBytes();
    const me = A.engine.me!;

    const B = await device(server);
    await B.engine.disconnect();
    await B.engine.openCopy(copy, me);
    expect(B.engine.readOnly).toBe(true);
    expect((await B.engine.call('employeesList', () => B.svc.employeesList())).map((e) => e.fullName)).toEqual(['Ali Usta']);
    const pushes = server.pushes.length;
    await expect(B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Yazılamaz' }) }))).rejects.toThrow(READ_ONLY_MESSAGE);
    expect(B.svc.employeesList()).toHaveLength(1);
    expect(server.pushes.length).toBe(pushes);

    await B.engine.connect();
    expect(B.engine.readOnly).toBe(false);
    await B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Veli Kalfa' }) }));
    expect(server.tables.get('employees')!.size).toBe(2);
  });
});
