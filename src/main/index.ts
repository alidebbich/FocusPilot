import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import { registerAiHandlers } from './ipc/aiHandlers';
import { registerKeyHandlers } from './ipc/keyHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerDbHandlers } from './ipc/dbHandlers';
import { registerDiagHandlers } from './ipc/diagHandlers';
import { registerScreenHandlers } from './ipc/screenHandlers';
import { initDatabase } from './database/db';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const htmlPath = path.join(__dirname, '../renderer/index.html');
  const isDevServer = process.env.ELECTRON_DEV === '1';

  if (isDevServer) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else if (require('fs').existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser instead of new electron window
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('[Main] Database init failed:', err);
  }

  // Register all IPC handlers
  registerAiHandlers();
  registerKeyHandlers();
  registerSettingsHandlers();
  registerDbHandlers();
  registerDiagHandlers();
  registerScreenHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new windows from spawning
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (isDev && parsedUrl.hostname === 'localhost') return;
    if (!app.isPackaged && navigationUrl.startsWith('file://')) return;
    e.preventDefault();
  });
});
