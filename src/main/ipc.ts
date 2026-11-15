// Güvenli IPC katmanı: arayüz yalnızca API_METHODS içindeki işlemleri çağırabilir.
// Her çağrı { ok, data } veya { ok: false, error } biçiminde sonuç döner.
import { BrowserWindow, dialog, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { API_METHODS, IPC_PREFIX, type EroMecApi } from '../shared/api';
import type { AppSettings, IpcResult, SiteFilter } from '../shared/types';
import type { Service } from './db/service';
import { buildReportCsv, buildReportHtml } from './db/export';
import { buildAttendanceHtml, buildAttendanceXlsx } from './db/attendance-export';
import { buildPayrollHtml, buildPayrollXlsx } from './db/payroll-export';
import { formatPeriod } from '../shared/dates';
import { UserError } from './db/validation';
import { todayIso } from '../shared/dates';

type Handler = (arg: any, event: IpcMainInvokeEvent) => unknown | Promise<unknown>;

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Rapor';
}

/** HTML'i görünmez bir pencerede açıp yatay PDF olarak kaydeder (sayfa boyutu HTML'deki @page'den gelir). */
async function writePdf(filePath: string, html: string) {
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const out = await pdfWin.webContents.printToPDF({ pageSize: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(filePath, out);
  } finally {
    pdfWin.destroy();
  }
}

export function registerIpc(service: Service, opts: { isTrustedUrl: (url: string) => boolean; backupDir: string }) {
  const win = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined;

  const dialogHandlers: Partial<Record<keyof EroMecApi, Handler>> = {
    settingsSave: (s: AppSettings) => {
      const saved = service.settingsSave(s);
      nativeTheme.themeSource = saved.theme;
      return saved;
    },
    reportExportCsv: async (a: { from: string; to: string; title: string } & SiteFilter, e) => {
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      const r = await dialog.showSaveDialog(win(e)!, {
        title: 'Raporu CSV olarak kaydet',
        defaultPath: `${safeFileName(`Puanto ${data.title}`)}.csv`,
        filters: [{ name: 'CSV (Excel ile açılır)', extensions: ['csv'] }],
      });
      if (r.canceled || !r.filePath) return { saved: false };
      fs.writeFileSync(r.filePath, buildReportCsv(data), 'utf8');
      return { saved: true, path: r.filePath };
    },
    reportExportPdf: async (a: { from: string; to: string; title: string } & SiteFilter, e) => {
      const data = service.reportData(a?.from, a?.to, String(a?.title ?? 'Rapor'), a);
      const r = await dialog.showSaveDialog(win(e)!, {
        title: 'Raporu PDF olarak kaydet',
        defaultPath: `${safeFileName(`Puanto ${data.title}`)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (r.canceled || !r.filePath) return { saved: false };
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
      try {
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildReportHtml(data)));
        const pdf = await pdfWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
        fs.writeFileSync(r.filePath, pdf);
      } finally {
        pdfWin.destroy();
      }
      return { saved: true, path: r.filePath };
    },
    attendanceExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter, e) => {
      const data = service.attendanceExportData(a?.month, a);
      const pdf = a?.format === 'pdf';
      const scope = data.scopeLabel.startsWith('Bütün') ? '' : ` ${data.scopeLabel.replace(/ \(bütün şantiyeler\)$/, '')}`;
      const r = await dialog.showSaveDialog(win(e)!, {
        title: pdf ? 'Puantajı PDF olarak kaydet' : 'Puantajı Excel olarak kaydet',
        defaultPath: `${safeFileName(`Puantaj ${formatPeriod(data.month.month)}${scope}`)}.${pdf ? 'pdf' : 'xlsx'}`,
        filters: [pdf ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Excel çalışma kitabı', extensions: ['xlsx'] }],
      });
      if (r.canceled || !r.filePath) return { saved: false };
      if (pdf) {
        await writePdf(r.filePath, buildAttendanceHtml(data));
      } else {
        fs.writeFileSync(r.filePath, await buildAttendanceXlsx(data));
      }
      return { saved: true, path: r.filePath };
    },
    payrollExport: async (a: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter, e) => {
      const data = service.payrollExportData(a?.month, a);
      const pdf = a?.format === 'pdf';
      const scope = data.scopeLabel.startsWith('Bütün') ? '' : ` ${data.scopeLabel.replace(/ \(bütün şantiyeler\)$/, '')}`;
      const r = await dialog.showSaveDialog(win(e)!, {
        title: pdf ? 'Bordroyu PDF olarak kaydet' : 'Bordroyu Excel olarak kaydet',
        defaultPath: `${safeFileName(`Bordro ${formatPeriod(data.payroll.month)}${scope}`)}.${pdf ? 'pdf' : 'xlsx'}`,
        filters: [pdf ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Excel çalışma kitabı', extensions: ['xlsx'] }],
      });
      if (r.canceled || !r.filePath) return { saved: false };
      if (pdf) await writePdf(r.filePath, buildPayrollHtml(data));
      else fs.writeFileSync(r.filePath, await buildPayrollXlsx(data));
      return { saved: true, path: r.filePath };
    },
    backupCreate: async (_a, e) => {
      const r = await dialog.showSaveDialog(win(e)!, {
        title: 'Veritabanı yedeğini kaydet',
        defaultPath: `Puanto-Yedek-${todayIso()}.db`,
        filters: [{ name: 'Puanto yedeği', extensions: ['db'] }],
      });
      if (r.canceled || !r.filePath) return { saved: false };
      fs.writeFileSync(r.filePath, service.backupBytes());
      return { saved: true, path: r.filePath };
    },
    backupRestore: async (_a, e) => {
      const w = win(e)!;
      const r = await dialog.showOpenDialog(w, {
        title: 'Geri yüklenecek yedeği seçin',
        properties: ['openFile'],
        filters: [{ name: 'Puanto yedeği', extensions: ['db', 'sqlite', 'sqlite3'] }],
      });
      if (r.canceled || !r.filePaths[0]) return { restored: false };
      const file = r.filePaths[0];
      const confirm = await dialog.showMessageBox(w, {
        type: 'warning',
        title: 'Yedekten geri yükle',
        message: 'Mevcut bütün verilerin üzerine yazılacak.',
        detail: `Seçilen yedek: ${path.basename(file)}\n\nŞu anki veriler, geri yüklemeden önce güvenlik amacıyla otomatik olarak yedeklenecek. Devam etmek istiyor musunuz?`,
        buttons: ['Vazgeç', 'Evet, geri yükle'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirm.response !== 1) return { restored: false };
      const bytes = fs.readFileSync(file);
      // Geri yüklemeden önce mevcut verinin güvenlik kopyası alınır.
      fs.mkdirSync(opts.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safetyCopy = path.join(opts.backupDir, `otomatik-geri-yukleme-oncesi-${stamp}.db`);
      fs.writeFileSync(safetyCopy, service.backupBytes());
      service.restore(new Uint8Array(bytes));
      return { restored: true, path: file, safetyCopy };
    },
  };

  for (const name of API_METHODS) {
    const handler: Handler | undefined =
      dialogHandlers[name] ?? ((service as unknown as Record<string, Handler>)[name] as Handler | undefined);
    if (!handler) throw new Error(`IPC işleyicisi eksik: ${name}`);
    ipcMain.handle(IPC_PREFIX + name, async (event, arg): Promise<IpcResult<unknown>> => {
      if (!opts.isTrustedUrl(event.senderFrame?.url ?? '')) {
        return { ok: false, error: 'Yetkisiz istek.' };
      }
      try {
        return { ok: true, data: await handler(arg, event) };
      } catch (err) {
        if (err instanceof UserError) return { ok: false, error: err.message };
        console.error(`[Puanto] ${name} hatası:`, err);
        return { ok: false, error: `Beklenmeyen bir hata oluştu: ${(err as Error)?.message ?? String(err)}` };
      }
    });
  }
}
