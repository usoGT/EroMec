// Yedekten geri yükleme: dosyanın geçerli bir Puanto veritabanı olduğu doğrulanır,
// gerekirse şeması güncellenir ve mevcut veritabanının yerine konur.
import type { Db } from './connection';
import { Db as DbClass } from './connection';
import { migrate } from './migrations';
import { UserError } from './validation';

const SQLITE_HEADER = 'SQLite format 3\0';
const REQUIRED_TABLES = ['employees', 'overtime_records', 'expenses', 'settings'];

export function validateBackup(db: Db, bytes: Uint8Array): Uint8Array {
  if (bytes.length < 100 || String.fromCharCode(...bytes.subarray(0, 16)) !== SQLITE_HEADER) {
    throw new UserError('Seçilen dosya geçerli bir Puanto yedeği değil.');
  }
  let candidate: DbClass;
  try {
    candidate = new DbClass(db.SQL, new db.SQL.Database(bytes), null);
  } catch {
    throw new UserError('Yedek dosyası açılamadı; dosya bozuk olabilir.');
  }
  try {
    const tables = candidate.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((t) => t.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length) throw new UserError('Seçilen dosya bir Puanto yedeği değil (gerekli tablolar bulunamadı).');
    const check = candidate.get<{ integrity_check: string }>('PRAGMA integrity_check');
    if (check?.integrity_check !== 'ok') throw new UserError('Yedek dosyası bozuk (bütünlük kontrolü başarısız).');
    migrate(candidate);
    return candidate.exportBytes();
  } finally {
    candidate.close();
  }
}

export function restoreBackup(db: Db, bytes: Uint8Array) {
  const clean = validateBackup(db, bytes);
  db.replaceWith(clean);
  db.persist();
}
