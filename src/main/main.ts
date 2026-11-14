// EroMec ana süreç: pencere, veritabanı ve IPC kurulumu.
import { app, BrowserWindow, dialog, Menu, nativeTheme, session } from 'electron';
import path from 'node:path';
import { Db } from './db/connection';
import { migrate } from './db/migrations';
import { createService } from './db/service';
import { registerIpc } from './ipc';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

app.setName('EroMec');
app.commandLine.appendSwitch('lang', 'tr');
if (process.platform === 'win32') app.setAppUserModelId('com.eroglumechanic.eromec');

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
    title: 'EroMec - Eroğlu Mechanic',
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

/** Uygulama tamamen çevrim dışı çalışır: yerel dosyalar dışındaki bütün ağ istekleri engellenir. */
function blockNetwork() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url;
    const allowed =
      u.startsWith('file:') || u.startsWith('data:') || u.startsWith('devtools:') || u.startsWith('blob:') ||
      (!!DEV_URL && (u.startsWith(DEV_URL) || u.startsWith(DEV_URL.replace(/^http/, 'ws'))));
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
}

async function bootstrap() {
  const dataDir = process.env.EROMEC_DATA_DIR || app.getPath('userData');
  const dbPath = path.join(dataDir, 'eromec.db');
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  try {
    const db = await Db.open(wasmDir, dbPath);
    migrate(db);
    db.persist();
    const service = createService(db);
    nativeTheme.themeSource = service.settingsGet().theme;
    registerIpc(service, { isTrustedUrl, backupDir: path.join(dataDir, 'yedekler') });
    app.on('before-quit', () => db.close());
  } catch (err) {
    dialog.showErrorBox('EroMec başlatılamadı', `Veritabanı açılamadı:\n${dbPath}\n\n${(err as Error).message}`);
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
