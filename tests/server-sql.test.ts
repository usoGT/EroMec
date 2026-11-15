// Sunucu SQL'i (supabase/*.sql) gerçek Postgres'te (PGlite) kurulur ve yetki kuralları denenir.
import { beforeAll, describe, expect, it } from 'vitest';
import { openPg, type Pg } from './pg';

let pg: Pg;
beforeAll(async () => {
  pg = await openPg();
}, 60_000);

let seq = 0;
/** Yeni üye açar ve kendi işletmesini kurdurur (sahip) */
async function owner(email: string, ws = `İşletme ${++seq}`) {
  const id = await pg.addUser(email, email.split('@')[0]);
  await pg.rpc(id, 'workspace_create', { ws_name: ws });
  return id;
}
/** Yeni üye açar ve verilen sahibin işletmesine ekletir */
async function member(email: string, ownerId: string) {
  const id = await pg.addUser(email, email.split('@')[0]);
  await pg.rpc(ownerId, 'workspace_add_member', { member_email: email });
  return id;
}
const firstCompany = async (u: string) => (await pg.as<{ id: number }>(u, 'select id from companies order by id limit 1'))[0].id;

describe('işletmeler', () => {
  it('işletme açınca varsayılan listeler kopyalanır; işletmeler birbirini görmez', async () => {
    const a = await owner('ws-a@x.com', 'Yılmaz İnşaat');
    const b = await owner('ws-b@x.com', 'Demir Yapı');

    const full = await pg.rpc<{ data: Record<string, Record<string, unknown>[]>; me: { workspaceName: string; workspaceRole: string; role: string } }>(a, 'pull_all');
    expect(full.me).toMatchObject({ workspaceName: 'Yılmaz İnşaat', workspaceRole: 'owner', role: 'admin' });
    expect(full.data.companies.map((c) => c.name)).toEqual(['Yılmaz İnşaat']);
    expect(full.data.settings.find((s) => s.key === 'companyName')?.value).toBe('Yılmaz İnşaat');
    expect(full.data.settings.find((s) => s.key === 'appName')?.value).toBe('Puanto');
    expect(full.data.expense_categories).toHaveLength(6);
    expect(full.data.attendance_statuses).toHaveLength(8);
    expect(Object.keys(full.data.companies[0])).not.toContain('workspace_id');

    // Aynı ad, aynı ayar anahtarı, aynı çalışan numarası iki işletmede ayrı ayrı olabilir
    await pg.rpc(a, 'apply_changes', { changes: { deletes: [], upserts: [{ t: 'settings', row: { key: 'companyName', value: 'Yılmaz Ltd.' } }] } });
    expect((await pg.as<{ value: string }>(b, `select value from settings where key = 'companyName'`))[0].value).toBe('Demir Yapı');
    expect(await pg.rpc(a, 'next_employee_no')).toBe('P0001');
    await pg.as(a, `insert into employees (employee_no, full_name, position) values ('P0001', 'A Usta', 'Usta')`);
    expect(await pg.rpc(a, 'next_employee_no')).toBe('P0002');
    expect(await pg.rpc(b, 'next_employee_no')).toBe('P0001');
    await pg.as(b, `insert into employees (employee_no, full_name, position) values ('P0001', 'B Usta', 'Usta')`);

    // B, A'nın hiçbir kaydını görmez ve değiştiremez
    for (const t of ['companies', 'employees', 'expense_categories', 'attendance_statuses']) {
      const rowsB = await pg.as<{ workspace_id: number }>(b, `select workspace_id from ${t}`);
      expect(new Set(rowsB.map((r) => r.workspace_id)).size).toBe(1);
    }
    const aCompany = await firstCompany(a);
    await expect(pg.rpc(b, 'apply_changes', { changes: { deletes: [], upserts: [{ t: 'companies', row: { id: aCompany, name: 'Ele geçirildi' } }] } })).rejects.toThrow();
    await pg.rpc(b, 'apply_changes', { changes: { deletes: [{ t: 'companies', pk: String(aCompany) }], upserts: [] } });
    expect((await pg.as(a, 'select * from companies where id = $1', [aCompany])).length).toBe(1);

    // Puantaj fırçası bağı işletme içinde çalışır
    const [e] = await pg.as<{ id: number }>(a, `select id from employees limit 1`);
    await pg.as(a, `insert into attendance (employee_id, date, status) values ($1, '2026-11-02', 'X')`, [e.id]);
  });

  it('işletmesi olmayan kişi hiçbir şey göremez ve yazamaz', async () => {
    await owner('ws-c@x.com');
    const lone = await pg.addUser('yalniz@x.com');
    const full = await pg.rpc<{ data: Record<string, unknown[]>; me: { workspaceId: number | null } }>(lone, 'pull_all');
    expect(full.me.workspaceId).toBeNull();
    expect(Object.values(full.data).every((rows) => rows.length === 0)).toBe(true);
    await expect(pg.rpc(lone, 'apply_changes', { changes: { deletes: [], upserts: [{ t: 'settings', row: { key: 'x', value: 'y' } }] } })).rejects.toThrow(/işletme açın/);
  });

  it('üye ekleme, davet, çıkarma ve ayrılma', async () => {
    const o = await owner('ws-sahip@x.com', 'Kaya Mekanik');
    const m = await member('ws-uye@x.com', o);
    expect((await pg.rpc<{ workspaceRole: string }>(m, 'me_json')).workspaceRole).toBe('member');

    // Kayıtlı olmayan e-posta: davet bekler, kayıt olunca katılır
    expect(await pg.rpc(o, 'workspace_add_member', { member_email: 'Yeni@X.com' })).toMatchObject({ pending: true });
    const list = await pg.as<{ email: string; pending: boolean }>(o, 'select * from workspace_members()');
    expect(list.map((r) => [r.email, r.pending])).toEqual(expect.arrayContaining([['ws-sahip@x.com', false], ['ws-uye@x.com', false], ['yeni@x.com', true]]));
    const n = await pg.addUser('yeni@x.com');
    expect((await pg.rpc<{ workspaceName: string }>(n, 'me_json')).workspaceName).toBe('Kaya Mekanik');

    // Üye ekleyemez; başka işletmedeki kişi eklenemez
    await expect(pg.rpc(m, 'workspace_add_member', { member_email: 'kim@x.com' })).rejects.toThrow(/yalnızca işletme sahibi/);
    await owner('ws-baska@x.com');
    await expect(pg.rpc(o, 'workspace_add_member', { member_email: 'ws-baska@x.com' })).rejects.toThrow(/başka bir işletmede/);

    // Sahip çıkarılamaz; üye ayrılabilir; sahip üyeyi çıkarabilir
    await expect(pg.rpc(m, 'workspace_remove_member', { member_id: o })).rejects.toThrow(/çıkarılamaz/);
    await pg.rpc(n, 'workspace_remove_member', { member_id: n });
    expect((await pg.rpc<{ workspaceId: number | null }>(n, 'me_json')).workspaceId).toBeNull();
    await pg.rpc(o, 'workspace_remove_member', { member_id: m });
    expect((await pg.as(m, 'select * from companies')).length).toBe(0);
    await expect(pg.rpc(o, 'workspace_create', { ws_name: 'İkinci' })).rejects.toThrow(/Zaten/);
  });
});

describe('şantiye paylaşma', () => {
  it('sahip işletmedeki üyeyi ekler; üye şantiyeyi ve kayıtlarını görür; çıkarılınca göremez', async () => {
    const boss = await owner('p-patron@x.com');
    const chief = await member('p-sef@x.com', boss); // şantiyeyi açan üye
    const friend = await member('Ortak@X.com', boss);
    const other = await owner('p-yabanci@x.com');
    const c = await firstCompany(chief);
    const [s] = await pg.as<{ id: number }>(chief, `insert into sites (company_id, name) values ($1, 'Ortak Şantiye') returning id`, [c]);
    await pg.as(chief, `insert into employees (employee_no, full_name, position, site_id) values ('P9001', 'Usta Bir', 'Usta', $1)`, [s.id]);

    expect((await pg.as(friend, 'select * from employees')).length).toBe(0);
    expect((await pg.as(boss, 'select * from employees')).length).toBe(1); // işletme sahibi her şeyi görür
    await expect(pg.rpc(friend, 'site_share', { sid: s.id, member_email: 'p-patron@x.com' })).rejects.toThrow(/yalnızca açan kişi/);
    await expect(pg.rpc(chief, 'site_share', { sid: s.id, member_email: 'p-yabanci@x.com' })).rejects.toThrow(/işletmenizde bir üye yok/);

    const added = await pg.rpc<{ email: string }>(chief, 'site_share', { sid: s.id, member_email: ' ortak@x.com ' });
    expect(added.email).toBe('Ortak@X.com');
    expect((await pg.as(friend, 'select * from sites')).length).toBe(1);
    expect((await pg.as(friend, 'select * from employees')).length).toBe(1);
    expect((await pg.as(other, 'select * from employees')).length).toBe(0);

    const list = await pg.as<{ email: string; is_owner: boolean }>(friend, 'select * from site_members_list($1)', [s.id]);
    expect(list.map((m) => [m.email, m.is_owner])).toEqual([['p-sef@x.com', true], ['Ortak@X.com', false]]);
    await expect(pg.as(other, 'select * from site_members_list($1)', [s.id])).rejects.toThrow(/görme yetkiniz yok/);

    await pg.as(friend, `insert into employees (employee_no, full_name, position, site_id) values ('P9002', 'Usta İki', 'Usta', $1)`, [s.id]);
    expect((await pg.as(chief, 'select * from employees where site_id = $1', [s.id])).length).toBe(2);

    await expect(pg.rpc(friend, 'site_unshare', { sid: s.id, member_id: chief })).rejects.toThrow(/çıkarılamaz/);
    await expect(pg.rpc(other, 'site_unshare', { sid: s.id, member_id: friend })).rejects.toThrow(/yetkiniz yok/);
    await pg.rpc(chief, 'site_unshare', { sid: s.id, member_id: friend });
    expect((await pg.as(friend, 'select * from employees')).length).toBe(0);
  });
});

describe('artımlı indirme', () => {
  it('pull_since yalnızca değişenleri ve silinenleri verir; başka işletmenin silmeleri görünmez', async () => {
    const a = await owner('art-a@x.com');
    const b = await owner('art-b@x.com');
    const c = await firstCompany(a);
    const [s] = await pg.as<{ id: number }>(a, `insert into sites (company_id, name) values ($1, 'Ş-art') returning id`, [c]);
    const full = await pg.rpc<{ serverTime: string; data: Record<string, unknown[]> }>(a, 'pull_all');
    expect(Object.keys(full.data.sites[0] as object)).not.toContain('_changed_at');

    const t0 = full.serverTime;
    const [e] = await pg.as<{ id: number }>(a, `insert into employees (employee_no, full_name, position, site_id) values ('P7001', 'Yeni', 'Usta', $1) returning id`, [s.id]);
    await pg.as(a, `update sites set address = 'Yeni adres' where id = $1`, [s.id]);

    const inc = await pg.rpc<{ data: Record<string, { id: number }[]>; me: { siteIds: number[] } }>(a, 'pull_since', { since: t0 });
    expect(inc.data.employees.map((r) => r.id)).toEqual([e.id]);
    expect(inc.data.sites.map((r) => r.id)).toEqual([s.id]);
    expect(inc.data.companies).toBeUndefined();
    expect(inc.me.siteIds).toContain(s.id);
    expect((await pg.rpc<{ data: Record<string, unknown[]> }>(b, 'pull_since', { since: t0 })).data.employees).toBeUndefined();

    await pg.as(a, 'delete from employees where id = $1', [e.id]);
    expect((await pg.rpc<{ deletes: { t: string; pk: string }[] }>(a, 'pull_since', { since: t0 })).deletes).toContainEqual({ t: 'employees', pk: String(e.id) });
    expect((await pg.rpc<{ deletes: unknown[] }>(b, 'pull_since', { since: t0 })).deletes).toEqual([]);
    await expect(pg.rpc(a, 'pull_since', { since: '2020-01-01T00:00:00Z' })).rejects.toThrow(/baştan/);
  });

  it('apply_changes ile gelen satırlar da değişmiş sayılır; tablolar realtime yayınında', async () => {
    const a = await owner('art-c@x.com');
    const t0 = (await pg.rpc<{ serverTime: string }>(a, 'pull_all')).serverTime;
    await pg.rpc(a, 'apply_changes', { changes: { deletes: [], upserts: [{ t: 'expense_categories', row: { id: 9101, name: 'Artımlı Kategori', kind: 'other', is_system: false, sort_order: 99 } }] } });
    const inc = await pg.rpc<{ data: Record<string, { id: number }[]> }>(a, 'pull_since', { since: t0 });
    expect(inc.data.expense_categories.map((r) => r.id)).toContain(9101);
    const pub = await pg.db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
    expect(pub.rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(['employees', 'attendance', 'site_members', 'profiles']));
  });
});

describe('kurulum', () => {
  it('isletme.sql tekrar çalıştırılabilir; veriler korunur', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const a = await owner('tekrar@x.com', 'Tekrar Ltd.');
    await pg.db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'isletme.sql'), 'utf8'));
    expect((await pg.as<{ name: string }>(a, 'select name from companies')).map((c) => c.name)).toEqual(['Tekrar Ltd.']);
  });
});

describe('firma kodu', () => {
  it('sahip kodu görür; şef kodla katılır; yanlış kod reddedilir; kod yenilenince eskisi çalışmaz', async () => {
    const o = await owner('kod-sahip@x.com', 'Kod İnşaat');
    const code = await pg.rpc<string>(o, 'workspace_code');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const sef = await pg.addUser('kod-sef@x.com');
    await expect(pg.rpc(sef, 'workspace_code')).rejects.toThrow(/yalnızca işletme sahibi/);
    await expect(pg.rpc(sef, 'workspace_join', { code: 'YANLIS' })).rejects.toThrow(/bulunamadı/);
    expect(await pg.rpc(sef, 'workspace_join', { code: ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} ` })).toMatchObject({ name: 'Kod İnşaat' });
    expect((await pg.rpc<{ workspaceRole: string }>(sef, 'me_json')).workspaceRole).toBe('member');
    await expect(pg.rpc(sef, 'workspace_join', { code })).rejects.toThrow(/Zaten/);
    await expect(pg.rpc(sef, 'workspace_reset_code')).rejects.toThrow(/yalnızca işletme sahibi/);

    const yeni = await pg.rpc<string>(o, 'workspace_reset_code');
    expect(yeni).not.toBe(code);
    const sef2 = await pg.addUser('kod-sef2@x.com');
    await expect(pg.rpc(sef2, 'workspace_join', { code })).rejects.toThrow(/bulunamadı/);
    await pg.rpc(sef2, 'workspace_join', { code: yeni });
  });
});
