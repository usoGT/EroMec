// Testlerde Supabase'in yerine geçen sahte sunucu ve ona bağlı "cihaz" yardımcıları.
import { openService } from './helpers';
import { createEngine, type Me, type Remote } from '../src/web/engine';
import { installTracking, rowToServer, SYNC_TABLES, type ChangeSet, type Row } from '../src/web/sync';
import type { Db } from '../src/main/db/connection';
import type { EmployeeInput } from '../src/shared/types';

/** Supabase'in yerini tutan basit sunucu: satırları tablolar hâlinde saklar, paketleri uygular. */
export class FakeServer {
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

export const ADMIN: Me = { id: 'a', email: 'a@x', fullName: 'Admin', role: 'admin', siteIds: [] };
export const emp = (over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  fullName: 'Ahmet Yılmaz', position: 'Usta', monthlySalaryKurus: 3000000, overtimeRateKurus: 20000, startDate: '2026-10-01', status: 'active', ...over,
});

export async function device(server: FakeServer) {
  const { db, svc } = await openService(null);
  installTracking(db);
  const engine = createEngine(db, server.remote(ADMIN));
  await engine.connect();
  return { db, svc, engine };
}

export async function setup() {
  const server = new FakeServer();
  const seedDb = (await openService(null)).db; // sunucunun başlangıç verisi: varsayılan kategoriler, fırçalar, firma
  server.seed(seedDb);
  return server;
}

