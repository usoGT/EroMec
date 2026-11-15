// Puanto ana süreç: pencere, veritabanı ve IPC kurulumu.
import { app, BrowserWindow, dialog, Menu, nativeTheme, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Db } from './db/connection';
import { migrate } from './db/migrations';
import { createService } from './db/service';
import { registerIpc } from './ipc';
import { registerHost } from './host';
import { dailyBackup } from './autoBackup';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
/** Derlemeye gömülen Supabase adresi: boşsa uygulama tamamen çevrimdışıdır (veriler yalnızca bu PC'de). */
const SERVER_URL = (process.env.EROMEC_SUPABASE_URL ?? '').replace(/\/+$/, '');

app.setName('Puanto');
// Veri klasörü verilirse (testler, taşınabilir kullanım) tarayıcı profili (oturum, depolama) da oraya gider;
// böylece kurulu uygulamanın profiline dokunulmaz.
if (process.env.EROMEC_DATA_DIR) app.setPath('userData', process.env.EROMEC_DATA_DIR);
app.commandLine.appendSwitch('lang', 'tr');
if (process.platform === 'win32') app.setAppUserModelId('app.puanto');

// Aynı veritabanına iki pencereden yazılmasını önlemek için tek örnek çalışır.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function isTrustedUrl(url: string): boolean {
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return url.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Puanto',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101010' : '#f1f5f9',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

/** Yerel dosyalar ve (çevrimiçi derlemede) Supabase sunucusu dışındaki bütün ağ istekleri engellenir. */
function blockNetwork() {
  const server = SERVER_URL ? [`${SERVER_URL}/`, `${SERVER_URL.replace(/^http/, 'ws')}/`] : [];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url;
    const allowed =
      u.startsWith('file:') || u.startsWith('data:') || u.startsWith('devtools:') || u.startsWith('blob:') ||
      server.some((p) => u.startsWith(p)) ||
      (!!DEV_URL && (u.startsWith(DEV_URL) || u.startsWith(DEV_URL.replace(/^http/, 'ws'))));
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
}

/** Uygulamanın eski adıyla (EroMec) bu bilgisayarda tutulan veriler, ilk açılışta yeni klasöre kopyalanır. */
function adoptLegacyData(dataDir: string) {
  const legacyDir = path.join(app.getPath('appData'), 'EroMec');
  const legacyDb = path.join(legacyDir, 'eromec.db');
  if (fs.existsSync(path.join(dataDir, 'eromec.db')) || !fs.existsSync(legacyDb)) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(legacyDb, path.join(dataDir, 'eromec.db'));
  const backups = path.join(legacyDir, 'yedekler');
  if (fs.existsSync(backups)) fs.cpSync(backups, path.join(dataDir, 'yedekler'), { recursive: true, force: false });
}

async function bootstrap() {
  const dataDir = process.env.EROMEC_DATA_DIR || app.getPath('userData');
  if (!process.env.EROMEC_DATA_DIR) {
    try {
      adoptLegacyData(dataDir);
    } catch (e) {
      console.error('[Puanto] eski veriler taşınamadı:', e);
    }
  }
  const dbPath = path.join(dataDir, 'eromec.db');
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  try {
    const db = await Db.open(wasmDir, dbPath);
    migrate(db);
    db.persist();
    const service = createService(db);
    nativeTheme.themeSource = service.settingsGet().theme;
    registerIpc(service, { isTrustedUrl, backupDir: path.join(dataDir, 'yedekler') });
    registerHost({ dataDir, legacy: db, isTrustedUrl });
    if (!SERVER_URL) {
      // Çevrimdışı masaüstü: her gün ilk açılışta PC'ye otomatik yedek (son 30 gün); uygulama açık kalırsa saatte bir kontrol.
      const autoDir = path.join(dataDir, 'yedekler', 'otomatik');
      const daily = () => {
        try {
          dailyBackup(autoDir, db.exportBytes());
        } catch (e) {
          console.error('[Puanto] otomatik yedek alınamadı:', e);
        }
      };
      daily();
      setInterval(daily, 60 * 60 * 1000).unref();
    }
    app.on('before-quit', () => db.close());
  } catch (err) {
    dialog.showErrorBox('Puanto başlatılamadı', `Veritabanı açılamadı:\n${dbPath}\n\n${(err as Error).message}`);
    app.exit(1);
    return;
  }
  if (!DEV_URL) Menu.setApplicationMenu(null);
  blockNetwork();
  createWindow();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => app.quit());

// Yeni pencere açılmasına izin verilmez.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
