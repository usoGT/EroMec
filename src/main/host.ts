// Çevrimiçi masaüstü için "host" kanalları: son kopya (internet yokken salt okunur açılış),
// PC'ye günlük otomatik yedek ve bu bilgisayardaki eski (çevrimdışı) verinin aktarımı.
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { HOST_PREFIX } from '../shared/api';
import type { CopyMeta } from '../shared/host';
import type { IpcResult } from '../shared/types';
import type { Db } from './db/connection';
import { dailyBackup, writeAtomic } from './autoBackup';

export function registerHost(opts: { dataDir: string; legacy: Db; isTrustedUrl: (url: string) => boolean }) {
  const copyFile = path.join(opts.dataDir, 'son-kopya.db');
  const metaFile = path.join(opts.dataDir, 'son-kopya.json');
  const autoDir = path.join(opts.dataDir, 'yedekler', 'otomatik');

  const handlers: Record<string, (arg: any) => unknown> = {
    saveCopy: ({ bytes, meta }: { bytes: Uint8Array; meta: CopyMeta }) => {
      if (!(bytes instanceof Uint8Array) || bytes.length < 100) throw new Error('Geçersiz kopya.');
      writeAtomic(copyFile, bytes);
      writeAtomic(metaFile, new TextEncoder().encode(JSON.stringify(meta)));
      return { dailyBackup: dailyBackup(autoDir, bytes) };
    },
    loadCopy: () => {
      if (!fs.existsSync(copyFile) || !fs.existsSync(metaFile)) return null;
      return { bytes: new Uint8Array(fs.readFileSync(copyFile)), meta: JSON.parse(fs.readFileSync(metaFile, 'utf8')) as CopyMeta };
    },
    clearCopy: () => {
      fs.rmSync(copyFile, { force: true });
      fs.rmSync(metaFile, { force: true });
    },
    legacyDb: () => {
      const n = opts.legacy.get<{ n: number }>(
        'SELECT (SELECT COUNT(*) FROM employees) + (SELECT COUNT(*) FROM expenses) + (SELECT COUNT(*) FROM overtime_records) AS n',
      )?.n ?? 0;
      return n > 0 ? opts.legacy.exportBytes() : null;
    },
    backupDir: () => autoDir,
  };

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(HOST_PREFIX + name, async (event: IpcMainInvokeEvent, arg): Promise<IpcResult<unknown>> => {
      if (!opts.isTrustedUrl(event.senderFrame?.url ?? '')) return { ok: false, error: 'Yetkisiz istek.' };
      try {
        return { ok: true, data: await fn(arg) };
      } catch (err) {
        console.error(`[EroMec] host ${name} hatası:`, err);
        return { ok: false, error: (err as Error)?.message ?? String(err) };
      }
    });
  }
}
