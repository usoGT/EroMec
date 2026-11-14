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
  /** Artımlı indirme (artimli.sql) açık mı */
  incremental = false;
  /** Sunucu saati: her değişiklikte 1 saniye ilerler */
  clock = Date.parse('2026-11-01T08:00:00Z');
  changedAt = new Map<string, number>();
  deleted: { t: string; pk: string; at: number }[] = [];
  pullSinceCalls = 0;
  fullPulls = 0;
  /** Kullanıcının şantiyeleri (paylaşım değişikliğini taklit etmek için) */
  siteIds: number[] = [];

  private tick() {
    this.clock += 1000;
    return this.clock;
  }

  seed(db: Db) {
    for (const { name, pk } of SYNC_TABLES) {
      for (const row of db.all<Row>(`SELECT * FROM ${name}`)) this.set(name, String(row[pk]), rowToServer(name, row));
    }
  }

  /** Başka bir cihaz/kişi sunucuda doğrudan değişiklik yapmış gibi */
  set(table: string, pk: string, row: Row) {
    this.tables.get(table)!.set(pk, { ...row });
    this.changedAt.set(`${table}:${pk}`, this.tick());
  }

  remove(table: string, pk: string) {
    if (this.tables.get(table)!.delete(pk)) this.deleted.push({ t: table, pk, at: this.tick() });
  }

  remote(me: Me): Remote {
    const who = () => ({ ...me, siteIds: [...this.siteIds] });
    const remote: Remote = {
      pull: async () => {
        this.fullPulls += 1;
        const start = this.nextBlock;
        this.nextBlock += 1_000_000;
        const data = Object.fromEntries([...this.tables].map(([t, rows]) => [t, [...rows.values()].map((r) => ({ ...r }))]));
        return {
          data, me: who(), ids: Object.fromEntries(SYNC_TABLES.filter((t) => t.pk === 'id').map((t) => [t.name, start])),
          serverTime: this.incremental ? new Date(this.clock).toISOString() : undefined,
        };
      },
      push: async (changes) => {
        if (this.reject) throw this.reject;
        this.pushes.push(changes);
        for (const u of changes.upserts) {
          const pk = SYNC_TABLES.find((t) => t.name === u.t)!.pk;
          this.set(u.t, String(u.row[pk]), u.row);
        }
        for (const d of changes.deletes) this.remove(d.t, d.pk);
      },
      nextEmployeeNo: async () => {
        const max = Math.max(0, ...[...this.tables.get('employees')!.values()].map((r) => Number(String(r.employee_no).slice(1)) || 0));
        return `P${String(max + 1).padStart(4, '0')}`;
      },
    };
    if (this.incremental) {
      remote.pullSince = async (since) => {
        this.pullSinceCalls += 1;
        const t = Date.parse(since);
        const data = Object.fromEntries([...this.tables].map(([name, rows]) => [name,
          [...rows.entries()].filter(([pk]) => (this.changedAt.get(`${name}:${pk}`) ?? 0) > t).map(([, r]) => ({ ...r }))]));
        return { data, deletes: this.deleted.filter((d) => d.at > t).map(({ t: tb, pk }) => ({ t: tb, pk })), me: who(), serverTime: new Date(this.clock).toISOString() };
      };
    }
    return remote;
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

