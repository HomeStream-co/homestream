/**
 * HomeStream Electron Main Process
 *
 * Wraps the HomeStream Express server + React frontend in a native desktop app.
 * On Windows: packaged as a .exe installer via electron-builder + NSIS.
 *
 * Architecture:
 *  - Spawns the HomeStream server (src/server) as a child process
 *  - Opens a BrowserWindow pointing at http://localhost:3000
 *  - Adds a system tray icon with quick-access menu
 *  - Auto-updater via electron-updater (GitHub Releases)
 */

const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────

const SERVER_PORT = 3000;
const SERVER_READY_TIMEOUT = 30_000; // 30s

let mainWindow = null;
let tray = null;
let serverProcess = null;

// ── Server management ─────────────────────────────────────────────────────────

function startServer() {
  const serverPath = path.join(process.resourcesPath, 'server', 'index.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
      ELECTRON: '1',
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', code => console.log('[server] exited with code', code));
}

function waitForServer(timeout = SERVER_READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(`http://localhost:${SERVER_PORT}/api/health/full`, res => {
        if (res.statusCode === 200) resolve(true);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return reject(new Error('Server timeout'));
      setTimeout(check, 500);
    };
    check();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Show splash while server starts
  mainWindow.loadURL(`data:text/html,<html style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p style="color:#fff;font-family:sans-serif;font-size:1.2rem;opacity:.6">Starting HomeStream…</p></html>`);
  mainWindow.show();

  try {
    await waitForServer();
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  } catch {
    mainWindow.loadURL(`data:text/html,<html style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p style="color:#f87171;font-family:sans-serif">Failed to start server. Please restart HomeStream.</p></html>`);
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('HomeStream');

  const menu = Menu.buildFromTemplate([
    { label: 'Open HomeStream', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Open in Browser', click: () => shell.openExternal(`http://localhost:${SERVER_PORT}`) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startServer();
  await createWindow();
  createTray();

  // Check for updates silently
  autoUpdater.checkForUpdatesAndNotify().catch(() => {/* ignore */});
});

app.on('window-all-closed', () => {
  // On macOS keep the app running in the tray
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  serverProcess?.kill();
});

// ── Auto-updater events ───────────────────────────────────────────────────────

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('homestream:update-available'))`
  );
});
