/**
 * HomeStream Electron Main Process
 *
 * Wraps the HomeStream Express server + React frontend in a native desktop app.
 * No auto-updater — users download new versions manually.
 *
 * Architecture:
 *  - Shows a control panel window: server status, LAN IP, log viewer, start/stop
 *  - Spawns the HomeStream server (dist/server.bundle.mjs) as a child process
 *  - System tray icon with quick-access menu
 *  - "Open HomeStream" button launches the browser UI at http://localhost:3000
 *
 * Supported platforms: Windows (.exe), macOS (.dmg), Linux (.AppImage)
 */

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

// ── Config ────────────────────────────────────────────────────────────────────

const SERVER_PORT = 3000;
const SERVER_READY_TIMEOUT = 30_000;
const MAX_LOG_LINES = 200;

let controlWindow = null;
let tray = null;
let serverProcess = null;
let serverRunning = false;
let logBuffer = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

function pushLog(line, level = 'info') {
  const entry = { time: new Date().toLocaleTimeString(), line, level };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
  controlWindow?.webContents.send('log', entry);
}

// ── Server management ─────────────────────────────────────────────────────────

function startServer() {
  if (serverProcess) return;

  // In packaged app: server bundle is in resources/server/server.bundle.mjs
  // In dev: use the Vite dev server instead
  const isDev = !app.isPackaged;
  if (isDev) {
    pushLog('Development mode — use npm run dev to start the server', 'warn');
    serverRunning = true;
    sendStatus();
    return;
  }

  const serverPath = path.join(process.resourcesPath, 'server', 'server.bundle.mjs');
  pushLog(`Starting server: ${serverPath}`);

  serverProcess = spawn(process.execPath, ['--experimental-vm-modules', serverPath], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
      ELECTRON: '1',
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => pushLog(line, 'info'));
  });
  serverProcess.stderr?.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => pushLog(line, 'error'));
  });
  serverProcess.on('exit', code => {
    pushLog(`Server exited with code ${code}`, code === 0 ? 'info' : 'error');
    serverProcess = null;
    serverRunning = false;
    sendStatus();
  });

  waitForServer().then(() => {
    serverRunning = true;
    pushLog(`Server ready at http://localhost:${SERVER_PORT}`, 'success');
    pushLog(`LAN address: http://${getLanIp()}:${SERVER_PORT}`, 'success');
    sendStatus();
  }).catch(err => {
    pushLog(`Server failed to start: ${err.message}`, 'error');
    serverRunning = false;
    sendStatus();
  });
}

function stopServer() {
  if (!serverProcess) return;
  pushLog('Stopping server…', 'warn');
  serverProcess.kill('SIGTERM');
  serverProcess = null;
  serverRunning = false;
  sendStatus();
}

function waitForServer(timeout = SERVER_READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(`http://localhost:${SERVER_PORT}/api/health`, res => {
        if (res.statusCode === 200) resolve(true);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return reject(new Error('Server startup timeout'));
      setTimeout(check, 500);
    };
    check();
  });
}

function sendStatus() {
  const lanIp = getLanIp();
  controlWindow?.webContents.send('status', {
    running: serverRunning,
    lanUrl: `http://${lanIp}:${SERVER_PORT}`,
    localUrl: `http://localhost:${SERVER_PORT}`,
    lanIp,
    port: SERVER_PORT,
  });
}

// ── Control Panel Window ──────────────────────────────────────────────────────

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 560,
    minHeight: 460,
    backgroundColor: '#0a0a0a',
    title: 'HomeStream — Control Panel',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    resizable: true,
    show: false,
  });

  // Load the inline control panel HTML
  controlWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CONTROL_PANEL_HTML)}`);

  controlWindow.once('ready-to-show', () => {
    controlWindow.show();
    sendStatus();
    // Send buffered logs
    logBuffer.forEach(entry => controlWindow.webContents.send('log', entry));
  });

  controlWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    controlWindow.hide();
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  // Generate a simple programmatic tray icon if no file exists
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    // Fallback: create a simple 16×16 colored square as the tray icon
    icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  }

  tray = new Tray(icon);
  tray.setToolTip('HomeStream');

  const updateMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'HomeStream Control Panel', enabled: false },
      { type: 'separator' },
      {
        label: 'Open Control Panel',
        click: () => { controlWindow?.show(); controlWindow?.focus(); },
      },
      {
        label: `Open in Browser (http://localhost:${SERVER_PORT})`,
        click: () => shell.openExternal(`http://localhost:${SERVER_PORT}`),
        enabled: serverRunning,
      },
      { type: 'separator' },
      {
        label: serverRunning ? 'Stop Server' : 'Start Server',
        click: () => serverRunning ? stopServer() : startServer(),
      },
      { type: 'separator' },
      { label: 'Quit HomeStream', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
  };

  updateMenu();
  tray.on('double-click', () => { controlWindow?.show(); controlWindow?.focus(); });

  // Update tray menu when server state changes
  ipcMain.on('request-status', () => sendStatus());

  return updateMenu;
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.on('start-server', () => startServer());
ipcMain.on('stop-server', () => stopServer());
ipcMain.on('open-browser', () => shell.openExternal(`http://localhost:${SERVER_PORT}`));
ipcMain.on('open-browser-lan', (_, url) => shell.openExternal(url));
ipcMain.on('request-status', () => sendStatus());

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createControlWindow();
  createTray();
  startServer();
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

app.on('activate', () => {
  controlWindow?.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

// ── Control Panel HTML ────────────────────────────────────────────────────────
// Self-contained HTML/CSS/JS for the control panel window.
// Uses IPC via the preload script to communicate with the main process.

const CONTROL_PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HomeStream Control Panel</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
  }
  .header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    gap: 12px;
    -webkit-app-region: drag;
  }
  .logo { font-size: 1.4rem; font-weight: 700; letter-spacing: 2px; color: #fff; }
  .logo span { color: #7c3aed; }
  .subtitle { font-size: 0.7rem; color: #666; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .status-bar {
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid #1f1f1f;
    flex-wrap: wrap;
  }
  .status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #ef4444; flex-shrink: 0;
    transition: background 0.3s;
  }
  .status-dot.running { background: #22c55e; box-shadow: 0 0 8px #22c55e88; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
  .status-text { font-size: 0.85rem; color: #aaa; }
  .status-text strong { color: #fff; }
  .url-chip {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
    padding: 4px 10px; font-size: 0.75rem; color: #7c3aed;
    cursor: pointer; transition: border-color 0.2s;
    -webkit-app-region: no-drag;
  }
  .url-chip:hover { border-color: #7c3aed; }
  .actions {
    padding: 16px 24px;
    display: flex;
    gap: 10px;
    border-bottom: 1px solid #1f1f1f;
    flex-wrap: wrap;
  }
  button {
    padding: 8px 18px; border-radius: 8px; border: none;
    font-size: 0.82rem; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    -webkit-app-region: no-drag;
  }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: #7c3aed; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #6d28d9; }
  .btn-secondary { background: #1f1f1f; color: #e5e5e5; border: 1px solid #2a2a2a; }
  .btn-secondary:hover:not(:disabled) { background: #2a2a2a; }
  .btn-danger { background: #1f1f1f; color: #ef4444; border: 1px solid #3f1f1f; }
  .btn-danger:hover:not(:disabled) { background: #2a1010; }
  .log-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 24px 16px; }
  .log-label {
    font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 1px;
    padding: 12px 0 8px; display: flex; align-items: center; justify-content: space-between;
  }
  .log-clear { cursor: pointer; color: #444; font-size: 0.65rem; }
  .log-clear:hover { color: #888; }
  .log-box {
    flex: 1; overflow-y: auto; background: #050505; border: 1px solid #1a1a1a;
    border-radius: 8px; padding: 10px 12px; font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.72rem; line-height: 1.6;
  }
  .log-box::-webkit-scrollbar { width: 4px; }
  .log-box::-webkit-scrollbar-track { background: transparent; }
  .log-box::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
  .log-entry { display: flex; gap: 8px; }
  .log-time { color: #444; flex-shrink: 0; }
  .log-line.info { color: #aaa; }
  .log-line.success { color: #22c55e; }
  .log-line.warn { color: #f59e0b; }
  .log-line.error { color: #ef4444; }
  .empty-log { color: #333; font-style: italic; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">HOME<span>STREAM</span></div>
    <div class="subtitle">Control Panel</div>
  </div>
</div>

<div class="status-bar">
  <div class="status-dot" id="dot"></div>
  <div class="status-text" id="status-text">Starting…</div>
  <div class="url-chip" id="lan-url" style="display:none" onclick="openLan()">—</div>
</div>

<div class="actions">
  <button class="btn-primary" id="btn-open" disabled onclick="openBrowser()">Open HomeStream</button>
  <button class="btn-secondary" id="btn-stop" disabled onclick="toggleServer()">Stop Server</button>
</div>

<div class="log-section">
  <div class="log-label">
    Server Log
    <span class="log-clear" onclick="clearLog()">Clear</span>
  </div>
  <div class="log-box" id="log-box">
    <div class="empty-log">Waiting for server…</div>
  </div>
</div>

<script>
  let isRunning = false;
  let lanUrl = '';

  function openBrowser() { window.electronAPI?.openBrowser(); }
  function openLan() { if (lanUrl) window.electronAPI?.openBrowserLan(lanUrl); }

  function toggleServer() {
    if (isRunning) {
      window.electronAPI?.stopServer();
    } else {
      window.electronAPI?.startServer();
    }
  }

  function clearLog() {
    const box = document.getElementById('log-box');
    box.innerHTML = '<div class="empty-log">Log cleared</div>';
  }

  function appendLog(entry) {
    const box = document.getElementById('log-box');
    const empty = box.querySelector('.empty-log');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML =
      '<span class="log-time">' + entry.time + '</span>' +
      '<span class="log-line ' + entry.level + '">' + escHtml(entry.line) + '</span>';
    box.appendChild(div);

    // Auto-scroll to bottom
    box.scrollTop = box.scrollHeight;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateStatus(status) {
    isRunning = status.running;
    lanUrl = status.lanUrl;

    const dot = document.getElementById('dot');
    const text = document.getElementById('status-text');
    const urlChip = document.getElementById('lan-url');
    const btnOpen = document.getElementById('btn-open');
    const btnStop = document.getElementById('btn-stop');

    dot.className = 'status-dot' + (isRunning ? ' running' : '');
    text.innerHTML = isRunning
      ? '<strong>Running</strong> — ready to stream'
      : '<strong>Stopped</strong>';

    if (isRunning && status.lanUrl) {
      urlChip.style.display = 'block';
      urlChip.textContent = status.lanUrl;
    } else {
      urlChip.style.display = 'none';
    }

    btnOpen.disabled = !isRunning;
    btnStop.disabled = false;
    btnStop.textContent = isRunning ? 'Stop Server' : 'Start Server';
    btnStop.className = isRunning ? 'btn-danger' : 'btn-secondary';
  }

  // Listen for IPC events from main process
  window.electronAPI?.onStatus(updateStatus);
  window.electronAPI?.onLog(appendLog);
  window.electronAPI?.requestStatus();
</script>
</body>
</html>`;

// ── Minimal tray icon (16×16 purple square as data URL) ───────────────────────
// Used as fallback when tray-icon.png doesn't exist (B3 fix)
const TRAY_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAI0lEQVQ4jWNgYGD4z8BAgGIqGDUAXxqNBqMGjBowasCoAQCZAAQAAWiHlwAAAABJRU5ErkJggg==';
