import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Db } from '../src/main/db/connection';
import { migrate } from '../src/main/db/migrations';
import { createService } from '../src/main/db/service';

const require = createRequire(import.meta.url);
export const WASM_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

export function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-test-'));
  return path.join(dir, 'eromec.db');
}

export async function openService(file: string | null = tempDbPath()) {
  const db = await Db.open(WASM_DIR, file);
  migrate(db);
  return { db, svc: createService(db), file };
}
