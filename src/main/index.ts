import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerAiHandlers } from './ipc/aiHandlers';
import { registerKeyHandlers } from './ipc/keyHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerDbHandlers } from './ipc/dbHandlers';
import { registerDiagHandlers } from './ipc/diagHandlers';
import { registerScreenHandlers } from './ipc/screenHandlers';
import { initDatabase } from './database/db';
import { IPC } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  alwaysOnTop: boolean;
  opacity: number;
  isCollapsed: boolean;
  uncollapsedHeight: number;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 440,
  height: 680,
  alwaysOnTop: false,
  opacity: 0.96,
  isCollapsed: false,
  uncollapsedHeight: 680,
};

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8');
    return { ...DEFAULT_WINDOW_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Main] Failed to save window state:', err);
  }
}

let mainWindow: BrowserWindow | null = null;
let windowState: WindowState = DEFAULT_WINDOW_STATE;

function createWindow(): void {
  windowState = loadWindowState();

  const initialHeight = windowState.isCollapsed ? 58 : windowState.height;

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: initialHeight,
    x: windowState.x,
    y: windowState.y,
    minWidth: 380,
    minHeight: windowState.isCollapsed ? 58 : 460,
    maxWidth: 960,
    maxHeight: 1200,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    alwaysOnTop: windowState.alwaysOnTop,
    opacity: windowState.opacity,
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
  } else if (fs.existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Track window position & size changes (debounced save)
  let saveTimer: NodeJS.Timeout | null = null;
  const triggerSave = () => {
    if (!mainWindow || windowState.isCollapsed) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const bounds = mainWindow.getBounds();
      windowState.x = bounds.x;
      windowState.y = bounds.y;
      windowState.width = bounds.width;
      windowState.height = bounds.height;
      if (!windowState.isCollapsed) {
        windowState.uncollapsedHeight = bounds.height;
      }
      saveWindowState(windowState);
    }, 500);
  };

  mainWindow.on('resize', triggerSave);
  mainWindow.on('move', triggerSave);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Window Controls IPC Handlers ─────────────────────────────
function registerWindowControlHandlers(): void {
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC.WINDOW_CLOSE, () => {
    mainWindow?.close();
  });

  ipcMain.handle(IPC.WINDOW_SET_ALWAYS_ON_TOP, (_event, flag: boolean) => {
    if (!mainWindow) return false;
    mainWindow.setAlwaysOnTop(Boolean(flag), 'floating');
    windowState.alwaysOnTop = Boolean(flag);
    saveWindowState(windowState);
    return mainWindow.isAlwaysOnTop();
  });

  ipcMain.handle(IPC.WINDOW_GET_ALWAYS_ON_TOP, () => {
    return mainWindow ? mainWindow.isAlwaysOnTop() : false;
  });

  ipcMain.handle(IPC.WINDOW_SET_OPACITY, (_event, val: number) => {
    if (!mainWindow) return;
    const clamped = Math.max(0.4, Math.min(1.0, Number(val) || 0.95));
    mainWindow.setOpacity(clamped);
    windowState.opacity = clamped;
    saveWindowState(windowState);
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE_COLLAPSE, () => {
    if (!mainWindow) return false;
    const willCollapse = !windowState.isCollapsed;

    if (willCollapse) {
      const bounds = mainWindow.getBounds();
      windowState.uncollapsedHeight = bounds.height;
      windowState.isCollapsed = true;
      mainWindow.setMinimumSize(380, 58);
      mainWindow.setSize(bounds.width, 58, true);
    } else {
      windowState.isCollapsed = false;
      const targetHeight = Math.max(460, windowState.uncollapsedHeight || 680);
      mainWindow.setMinimumSize(380, 460);
      mainWindow.setSize(mainWindow.getBounds().width, targetHeight, true);
    }

    saveWindowState(windowState);
    return windowState.isCollapsed;
  });

  ipcMain.handle(IPC.WINDOW_GET_COLLAPSED, () => {
    return windowState.isCollapsed;
  });
}

// ─── Global Keyboard Shortcut Registration ───────────────────
function registerGlobalShortcuts(): void {
  // Primary hotkey: Ctrl+Shift+Space (or Cmd+Shift+Space on macOS)
  const primaryShortcut = 'CommandOrControl+Shift+Space';
  const fallbackShortcut = 'Alt+Shift+Space';

  const toggleWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  const registered = globalShortcut.register(primaryShortcut, toggleWindow);
  if (!registered) {
    console.warn(`[Hotkeys] Failed to register primary shortcut "${primaryShortcut}", trying fallback...`);
    globalShortcut.register(fallbackShortcut, toggleWindow);
  }
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('[Main] Database init failed:', err);
  }

  // Register IPC handlers
  registerWindowControlHandlers();
  registerAiHandlers();
  registerKeyHandlers();
  registerSettingsHandlers();
  registerDbHandlers();
  registerDiagHandlers();
  registerScreenHandlers();

  createWindow();
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent arbitrary navigation & new windows
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
