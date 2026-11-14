// Arayüze yalnızca tanımlı EroMec API'sini açar. Node.js erişimi verilmez.
import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, IPC_PREFIX } from '../shared/api';
import type { IpcResult } from '../shared/types';

const api: Record<string, (arg?: unknown) => Promise<unknown>> = {};
for (const name of API_METHODS) {
  api[name] = async (arg?: unknown) => {
    const res = (await ipcRenderer.invoke(IPC_PREFIX + name, arg)) as IpcResult<unknown>;
    if (!res.ok) throw new Error(res.error);
    return res.data;
  };
}

contextBridge.exposeInMainWorld('eromec', Object.freeze(api));
