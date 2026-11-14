// Sunucu SQL'i (supabase/*.sql) gerçek Postgres'te (PGlite) kurulur ve yetki kuralları denenir.
import { beforeAll, describe, expect, it } from 'vitest';
import { openPg, type Pg } from './pg';

let pg: Pg;
beforeAll(async () => {
  pg = await openPg();
}, 60_000);

describe('sunucu şeması', () => {
  it('kurulur, üye kendi şantiyesini görür, başkasınınkini görmez', async () => {
    const a = await pg.addUser('a@x.com', 'Ali');
    const b = await pg.addUser('b@x.com', 'Veli');
    const [c] = await pg.as<{ id: number }>(a, `insert into companies (name) values ('Firma') returning id`);
    await pg.as(a, `insert into sites (company_id, name) values ($1, 'Şantiye A')`, [c.id]);
    expect((await pg.as(a, 'select * from sites')).length).toBe(1);
    expect((await pg.as(b, 'select * from sites')).length).toBe(0);
  });
});

describe('şantiye paylaşma', () => {
  it('sahip e-postayla üye ekler; üye şantiyeyi ve kayıtlarını görür; çıkarılınca göremez', async () => {
    const owner = await pg.addUser('sahip@x.com', 'Sahip');
    const friend = await pg.addUser('Ortak@X.com', 'Ortak');
    const other = await pg.addUser('yabanci@x.com', 'Yabancı');
    const [c] = await pg.as<{ id: number }>(owner, `insert into companies (name) values ('Paylaşım Firma') returning id`);
    const [s] = await pg.as<{ id: number }>(owner, `insert into sites (company_id, name) values ($1, 'Ortak Şantiye') returning id`, [c.id]);
    await pg.as(owner, `insert into employees (employee_no, full_name, position, site_id) values ('P9001', 'Usta Bir', 'Usta', $1)`, [s.id]);

    expect((await pg.as(friend, 'select * from employees')).length).toBe(0);
    await expect(pg.rpc(friend, 'site_share', { sid: s.id, member_email: 'yabanci@x.com' })).rejects.toThrow(/yalnızca açan kişi/);
    await expect(pg.rpc(owner, 'site_share', { sid: s.id, member_email: 'yok@x.com' })).rejects.toThrow(/kayıtlı bir üye yok/);

    const added = await pg.rpc<{ email: string }>(owner, 'site_share', { sid: s.id, member_email: ' ortak@x.com ' });
    expect(added.email).toBe('Ortak@X.com');
    expect((await pg.as(friend, 'select * from sites')).length).toBe(1);
    expect((await pg.as(friend, 'select * from employees')).length).toBe(1);
    expect((await pg.as(other, 'select * from employees')).length).toBe(0);

    const list = await pg.as<{ email: string; is_owner: boolean }>(friend, 'select * from site_members_list($1)', [s.id]);
    expect(list.map((m) => [m.email, m.is_owner])).toEqual([['sahip@x.com', true], ['Ortak@X.com', false]]);
    await expect(pg.as(other, 'select * from site_members_list($1)', [s.id])).rejects.toThrow(/görme yetkiniz yok/);

    // Ortak üye şantiyeye kayıt girebilir
    await pg.as(friend, `insert into employees (employee_no, full_name, position, site_id) values ('P9002', 'Usta İki', 'Usta', $1)`, [s.id]);
    expect((await pg.as(owner, 'select * from employees where site_id = $1', [s.id])).length).toBe(2);

    // Sahip çıkarılamaz, yabancı kimseyi çıkaramaz
    await expect(pg.rpc(friend, 'site_unshare', { sid: s.id, member_id: owner })).rejects.toThrow(/çıkarılamaz/);
    await expect(pg.rpc(other, 'site_unshare', { sid: s.id, member_id: friend })).rejects.toThrow(/yetkiniz yok/);

    await pg.rpc(owner, 'site_unshare', { sid: s.id, member_id: friend });
    expect((await pg.as(friend, 'select * from employees')).length).toBe(0);
  });

  it('üye kendini şantiyeden çıkarabilir', async () => {
    const owner = await pg.addUser('s2@x.com');
    const friend = await pg.addUser('f2@x.com');
    const [c] = await pg.as<{ id: number }>(owner, `insert into companies (name) values ('Firma 2') returning id`);
    const [s] = await pg.as<{ id: number }>(owner, `insert into sites (company_id, name) values ($1, 'Ş2') returning id`, [c.id]);
    await pg.rpc(owner, 'site_share', { sid: s.id, member_email: 'f2@x.com' });
    await pg.rpc(friend, 'site_unshare', { sid: s.id, member_id: friend });
    expect((await pg.as(friend, 'select * from sites')).length).toBe(0);
  });
});
