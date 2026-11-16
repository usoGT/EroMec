// Sunucu SQL'ini (supabase/*.sql) gerçek Postgres'te denemek için: PGlite içinde Supabase'in
// auth şeması, auth.uid() ve "authenticated" rolü taklit edilir; dosyalar sırayla çalıştırılır.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

export const SQL_FILES = ['schema.sql', 'sync.sql', 'uyelik.sql', 'paylasim.sql', 'artimli.sql', 'isletme.sql', 'kvkk.sql', 'ekip.sql'];

const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant all on sequences to authenticated;
  create publication supabase_realtime;
`;

export interface Pg {
  db: PGlite;
  /** Yeni üye açar (Supabase'deki kayıt gibi), kimliğini döndürür */
  addUser(email: string, fullName?: string): Promise<string>;
  /** Verilen üye olarak (RLS geçerli) sorgu çalıştırır */
  as<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  /** Verilen üye olarak bir işlev çağırır, sonucunu döndürür */
  rpc<T = unknown>(userId: string, fn: string, args?: Record<string, unknown>): Promise<T>;
}

let n = 0;

export async function openPg(): Promise<Pg> {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of SQL_FILES) {
    const file = path.join(__dirname, '..', 'supabase', f);
    if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
  }
  // Supabase'de tablolara verilen erişim (RLS yine geçerli)
  await db.exec('grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;');

  const as = async <T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await tx.exec('set local role authenticated');
      return (await tx.query<T>(sql, params)).rows;
    });

  return {
    db,
    addUser: async (email, fullName = '') => {
      n += 1;
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`, [id, email, fullName]);
      return id;
    },
    as,
    rpc: async <T>(userId: string, fn: string, args: Record<string, unknown> = {}) => {
      const keys = Object.keys(args);
      const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const rows = await as<{ r: T }>(userId, call, keys.map((k) => (typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k])));
      return rows[0].r;
    },
  };
}
