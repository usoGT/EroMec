// Arayüze yalnızca tanımlı uygulama API'sini ve küçük "host" arayüzünü açar. Node.js erişimi verilmez.
import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, HOST_PREFIX, IPC_PREFIX } from '../shared/api';
import type { IpcResult } from '../shared/types';

const invoke = async (channel: string, arg?: unknown) => {
  const res = (await ipcRenderer.invoke(channel, arg)) as IpcResult<unknown>;
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

const api: Record<string, (arg?: unknown) => Promise<unknown>> = {};
for (const name of API_METHODS) api[name] = (arg?: unknown) => invoke(IPC_PREFIX + name, arg);
contextBridge.exposeInMainWorld('eromecDesktop', Object.freeze(api));

// Çevrimiçi masaüstü: son kopya (internet yokken açılış) ve PC'ye günlük otomatik yedek
contextBridge.exposeInMainWorld('eromecHost', Object.freeze({
  desktop: true,
  saveCopy: (bytes: Uint8Array, meta: unknown) => invoke(HOST_PREFIX + 'saveCopy', { bytes, meta }),
  loadCopy: () => invoke(HOST_PREFIX + 'loadCopy'),
  clearCopy: () => invoke(HOST_PREFIX + 'clearCopy'),
  legacyDb: () => invoke(HOST_PREFIX + 'legacyDb'),
  backupDir: () => invoke(HOST_PREFIX + 'backupDir'),
}));
