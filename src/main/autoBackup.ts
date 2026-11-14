// PC'ye otomatik tarihli yedek: her gün ilk açılışta (ya da ilk eşitlemede) o günün dosyası yazılır,
// en fazla AUTO_BACKUP_DAYS günlük dosya tutulur. Elle alınan yedeklere dokunulmaz.
import fs from 'node:fs';
import path from 'node:path';
import { AUTO_BACKUP_DAYS } from '../shared/host';

const NAME = /^EroMec-otomatik-(\d{4}-\d{2}-\d{2})\.db$/;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const autoBackupName = (day: Date) => `EroMec-otomatik-${isoDay(day)}.db`;

/** Önce geçici dosyaya yazıp sonra yeniden adlandırır (yarım dosya kalmaz). */
export function writeAtomic(file: string, bytes: Uint8Array) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
}

/** O günün yedeği yoksa yazar ve eski dosyaları temizler; yazılan dosyanın yolunu döndürür. */
export function dailyBackup(dir: string, bytes: Uint8Array, now = new Date(), keepDays = AUTO_BACKUP_DAYS): string | undefined {
  const file = path.join(dir, autoBackupName(now));
  let written: string | undefined;
  if (!fs.existsSync(file)) {
    writeAtomic(file, bytes);
    written = file;
  }
  pruneBackups(dir, now, keepDays);
  return written;
}

/** keepDays günden eski otomatik yedekleri siler. */
export function pruneBackups(dir: string, now = new Date(), keepDays = AUTO_BACKUP_DAYS) {
  if (!fs.existsSync(dir)) return;
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (keepDays - 1));
  const limitDay = isoDay(limit);
  for (const f of fs.readdirSync(dir)) {
    const m = NAME.exec(f);
    if (m && m[1] < limitDay) fs.rmSync(path.join(dir, f), { force: true });
  }
}
