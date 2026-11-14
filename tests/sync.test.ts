// Çevrimiçi eşitleme: iki cihaz (A ve B) aynı sahte sunucuya bağlanır.
import { describe, expect, it } from 'vitest';
import { openService } from './helpers';
import { createEngine, type Me, type Remote } from '../src/web/engine';
import { installTracking, rowToServer, SYNC_TABLES, type ChangeSet, type Row } from '../src/web/sync';
import type { Db } from '../src/main/db/connection';
import type { EmployeeInput } from '../src/shared/types';

/** Supabase'in yerini tutan basit sunucu: satırları tablolar hâlinde saklar, paketleri uygular. */
class FakeServer {
  tables = new Map<string, Map<string, Row>>(SYNC_TABLES.map((t) => [t.name, new Map()]));
  nextBlock = 1_000_000;
  pushes: ChangeSet[] = [];
  /** Verilirse paket bu hata ile reddedilir */
  reject: { code: string; message: string } | null = null;

  seed(db: Db) {
    for (const { name, pk } of SYNC_TABLES) {
      for (const row of db.all<Row>(`SELECT * FROM ${name}`)) this.tables.get(name)!.set(String(row[pk]), rowToServer(name, row));
    }
  }

  remote(me: Me): Remote {
    return {
      pull: async () => {
        const start = this.nextBlock;
        this.nextBlock += 1_000_000;
        const data = Object.fromEntries([...this.tables].map(([t, rows]) => [t, [...rows.values()].map((r) => ({ ...r }))]));
        return { data, me, ids: Object.fromEntries(SYNC_TABLES.filter((t) => t.pk === 'id').map((t) => [t.name, start])) };
      },
      push: async (changes) => {
        if (this.reject) throw this.reject;
        this.pushes.push(changes);
        for (const d of changes.deletes) this.tables.get(d.t)!.delete(d.pk);
        for (const u of changes.upserts) {
          const pk = SYNC_TABLES.find((t) => t.name === u.t)!.pk;
          this.tables.get(u.t)!.set(String(u.row[pk]), { ...u.row });
        }
      },
      nextEmployeeNo: async () => {
        const max = Math.max(0, ...[...this.tables.get('employees')!.values()].map((r) => Number(String(r.employee_no).slice(1)) || 0));
        return `P${String(max + 1).padStart(4, '0')}`;
      },
    };
  }
}

const ADMIN: Me = { id: 'a', email: 'a@x', fullName: 'Admin', role: 'admin', siteIds: [] };
const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz', position: 'Usta', monthlySalaryKurus: 3000000, overtimeRateKurus: 20000, startDate: '2026-10-01', status: 'active', ...over,
});

async function device(server: FakeServer) {
  const { db, svc } = await openService(null);
  installTracking(db);
  const engine = createEngine(db, server.remote(ADMIN));
  await engine.connect();
  return { db, svc, engine };
}

async function setup() {
  const server = new FakeServer();
  const seedDb = (await openService(null)).db; // sunucunun başlangıç verisi: varsayılan kategoriler, fırçalar, firma
  server.seed(seedDb);
  return server;
}

describe('çevrimiçi eşitleme', () => {
  it('bir cihazda eklenen kayıt diğer cihazda görünür; numaralar çakışmaz', async () => {
    const server = await setup();
    const A = await device(server);
    const B = await device(server);

    const a1 = (await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Ali Usta' }) }))).item!;
    const b1 = (await B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Veli Kalfa' }) }))).item!;
    expect(a1.id).not.toBe(b1.id);
    expect([a1.employeeNo, b1.employeeNo]).toEqual(['P0001', 'P0002']); // numara sunucudan gelir, B yerelde Ali'yi görmese de çakışmaz

    expect(A.svc.employeesList().map((e) => e.fullName)).toEqual(['Ali Usta']);
    await A.engine.refresh();
    expect(A.svc.employeesList().map((e) => e.fullName).sort()).toEqual(['Ali Usta', 'Veli Kalfa']);

    // Yenilemeden sonra A'nın vereceği yeni numara, B'nin aralığındaki numaralarla çakışmamalı
    const a2 = (await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Can Çırak' }) }))).item!;
    const b2 = (await B.engine.call('employeeCreate', () => B.svc.employeeCreate({ input: emp({ fullName: 'Deniz Usta' }) }))).item!;
    expect(new Set([a1.id, b1.id, a2.id, b2.id]).size).toBe(4);
    expect(server.tables.get('employees')!.size).toBe(4);
  });

  it('tipler sunucuya doğru gider ve geri gelir (boolean, zaman, boş tarih)', async () => {
    const server = await setup();
    const A = await device(server);
    const cat = A.svc.categoriesList().find((c) => c.name === 'Yemek')!;
    const x = (await A.engine.call('expenseCreate', () => A.svc.expenseCreate({ input: { date: '2026-10-15', name: 'Öğle yemeği', categoryId: cat.id, amountKurus: 45050, isPaid: true } }))).item!;
    const row = server.tables.get('expenses')!.get(String(x.id))!;
    expect(row.is_paid).toBe(true);
    expect(row.amount_kurus).toBe(45050);
    expect(String(row.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(server.tables.get('expense_categories')!.get('1')!.is_system).toBe(true);

    const B = await device(server);
    const got = B.svc.expensesList({}).find((e) => e.id === x.id)!;
    expect(got).toMatchObject({ name: 'Öğle yemeği', amountKurus: 45050, isPaid: true, categoryName: 'Yemek' });
    expect(B.svc.categoriesList().map((c) => c.name)).toEqual(A.svc.categoriesList().map((c) => c.name));
    expect(B.svc.attendanceStatusesList()).toEqual(A.svc.attendanceStatusesList());
  });

  it('sunucu reddederse yerel değişiklik geri alınır ve Türkçe hata verilir', async () => {
    const server = await setup();
    const A = await device(server);
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Ali Usta' }) }));
    server.reject = { code: '42501', message: 'new row violates row-level security policy for table "employees"' };
    await expect(A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Yetkisiz Kayıt' }) }))).rejects.toThrow(/yetkiniz yok/);
    server.reject = null;
    expect(A.svc.employeesList().map((e) => e.fullName)).toEqual(['Ali Usta']); // yerelde de geri alındı
    // Sonraki işlem normal çalışır ve reddedilen kayıt tekrar gönderilmez
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Veli Kalfa' }) }));
    expect([...server.tables.get('employees')!.values()].map((r) => r.full_name).sort()).toEqual(['Ali Usta', 'Veli Kalfa']);
  });

  it('puantaj, bordro ve silme zinciri sunucuya eksiksiz yansır', async () => {
    const server = await setup();
    const A = await device(server);
    const e = (await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp() }))).item!;
    await A.engine.call('attendanceFill', () => A.svc.attendanceFill({ month: '2026-10', employeeIds: [e.id], workSaturday: true, untilToday: false, today: '2026-10-31' }));
    expect(server.tables.get('attendance')!.size).toBe(31);
    await A.engine.call('payrollSave', () => A.svc.payrollSave({ month: '2026-10', employeeIds: [e.id], date: '2026-10-31', isPaid: true }));
    expect(server.tables.get('payrolls')!.size).toBe(1);
    const salaryExpense = [...server.tables.get('expenses')!.values()].find((r) => r.salary_period === '2026-10')!;
    expect(salaryExpense.amount_kurus).toBe(3100000); // 31 işaretli gün × (3.000.000 ÷ 30)

    // Bordroyu geri al: gider ve bordro satırı sunucudan da silinir
    await A.engine.call('payrollUndo', () => A.svc.payrollUndo({ employeeId: e.id, month: '2026-10' }));
    expect(server.tables.get('payrolls')!.size).toBe(0);
    expect([...server.tables.get('expenses')!.values()].filter((r) => r.salary_period)).toHaveLength(0);

    // Başka cihaz aynı sonucu görür
    const B = await device(server);
    expect(B.svc.attendanceMonth({ month: '2026-10' }).rows[0].cells['2026-10-15']).toBe('X');
    expect(B.svc.payrollMonth({ month: '2026-10' }).rows[0].saved).toBeFalsy();
  });

  it('görünüm (tema) ayarı sunucuya gönderilmez; çıkışta yerel veri boşalır', async () => {
    const server = await setup();
    const A = await device(server);
    const before = server.pushes.length;
    await A.engine.call('settingsSave', () => A.svc.settingsSave({ ...A.svc.settingsGet(), theme: 'dark', companyName: 'Yeni Ad' }));
    const sent = server.pushes.slice(before).flatMap((p) => p.upserts).filter((u) => u.t === 'settings').map((u) => u.row.key);
    expect(sent).toContain('companyName');
    expect(sent).not.toContain('theme');

    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp() }));
    await A.engine.disconnect();
    expect(A.engine.connected).toBe(false);
    expect(A.svc.employeesList()).toHaveLength(0);
    const n = server.pushes.length;
    await A.engine.call('employeeCreate', () => A.svc.employeeCreate({ input: emp({ fullName: 'Çıkıştan Sonra' }) }));
    expect(server.pushes.length).toBe(n); // bağlı değilken sunucuya hiçbir şey gitmez
  });
});
