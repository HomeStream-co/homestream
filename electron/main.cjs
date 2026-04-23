/**
 * HomeStream Electron Main Process
 *
 * Wraps the HomeStream Express server + React frontend in a native desktop app.
 * Auto-updater: checks GitHub Releases every 4 hours; user confirms before install.
 * Delta updates: only downloads the diff (a few MB) — no full reinstall needed.
 *
 * Architecture:
 *  - Shows a control panel window: server status, LAN IP, log viewer, start/stop
 *  - Spawns the HomeStream server (dist/server.bundle.cjs) as a child process
 *  - System tray icon with quick-access menu
 *  - "Open HomeStream" button launches the browser UI at http://localhost:3000 (or next free port)
 *
 * Supported platforms: Windows (.exe), macOS (.dmg), Linux (.AppImage)
 */

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, globalShortcut, dialog, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const { setupAutoUpdater, teardown: teardownUpdater } = require('./updater.cjs');

// ── Electron-side crash logger ────────────────────────────────────────────────
// Captures crashes in the Electron main process itself (not the server child).
// Writes to the same crash-log.json the server uses so everything is in one place.

function getElectronCrashLogPath() {
  // Try persistent storage first (same as server), fall back to userData
  const persistent = '/shared-storage/public/assets/crash-log.json';
  try {
    if (fs.existsSync(path.dirname(persistent))) return persistent;
  } catch { /* ignore */ }
  return path.join(app.getPath('userData'), 'crash-log.json');
}

function logElectronCrash(type, err) {
  try {
    const logPath = getElectronCrashLogPath();
    let entries = [];
    try { entries = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch { /* empty */ }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      message: err?.message ?? String(err),
      stack: err?.stack,
      context: 'Electron main process',
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()} (${os.release()})`,
      uptime: Math.floor(process.uptime()),
    };
    const updated = [entry, ...entries].slice(0, 100);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(updated, null, 2));
  } catch (writeErr) {
    process.stderr.write(`[electron-crash] Failed to write log: ${writeErr}\n`);
  }
}

process.on('uncaughtException', (err) => {
  logElectronCrash('uncaughtException', err);
  process.stderr.write(`[Electron CRASH] uncaughtException: ${err?.stack ?? err}\n`);
});

process.on('unhandledRejection', (reason) => {
  logElectronCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  process.stderr.write(`[Electron CRASH] unhandledRejection: ${reason}\n`);
});
// ffmpeg-static ships a pre-built binary for the current platform.
// In a packaged Electron app, node_modules is NOT included — the binary is
// copied into resources/ffmpeg/ via extraResources in electron-builder.yml.
// In dev mode we fall back to the node_modules copy directly.
function getFfmpegPath() {
  if (app.isPackaged) {
    // Packaged: binary is in resources/ffmpeg/ffmpeg (or ffmpeg.exe on Windows)
    const base = path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg');
    const win  = base + '.exe';
    if (fs.existsSync(win))  return win;
    if (fs.existsSync(base)) return base;
    // Shouldn't happen — log and fall back to system PATH
    pushLog('WARNING: Bundled ffmpeg not found in resources — falling back to system ffmpeg', 'warn');
    return 'ffmpeg';
  }
  // Dev mode: use ffmpeg-static from node_modules
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

// ── Config ────────────────────────────────────────────────────────────────────

const PREFERRED_PORT = 3000;
const PORT_SCAN_MAX  = 3099;   // try 3000–3099 before giving up
const SERVER_READY_TIMEOUT = 30_000;
const MAX_LOG_LINES = 200;

let controlWindow = null;
let tray = null;
let serverProcess = null;
let serverRunning = false;
let logBuffer = [];
let watchdogRestarts = 0; // tracks consecutive crash-restarts for exponential backoff
let fastCrashCount = 0;   // crashes that happened within FAST_CRASH_WINDOW_MS of starting
let lastServerStartTime = 0; // epoch ms when the server process was last spawned
const FAST_CRASH_WINDOW_MS = 15000; // exit within 15s of start = "fast crash"
const MAX_FAST_CRASHES    = 3;      // 3 fast crashes → quit the whole app
// Resolved at startup — may differ from PREFERRED_PORT if 3000 is taken
let activePort = PREFERRED_PORT;

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

// ── Port availability check ───────────────────────────────────────────────────
// Returns true if the port is free, false if already in use.
function isPortFree(port) {
  return new Promise(resolve => {
    const server = require('net').createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

// Scans ports from `start` up to `max` and resolves with the first free one.
// Rejects if every port in the range is occupied.
async function findFreePort(start = PREFERRED_PORT, max = PORT_SCAN_MAX) {
  for (let port = start; port <= max; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${start}–${max}. Close some applications and try again.`);
}

// ── Server management ─────────────────────────────────────────────────────────

async function startServer() {
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

  // Find a free port, starting at the preferred port (3000).
  // If 3000 is taken, we silently try 3001, 3002, … up to 3099.
  let port;
  try {
    port = await findFreePort(PREFERRED_PORT, PORT_SCAN_MAX);
  } catch (err) {
    pushLog(`ERROR: ${err.message}`, 'error');
    serverRunning = false;
    sendStatus();
    return;
  }

  if (port !== PREFERRED_PORT) {
    pushLog(`Port ${PREFERRED_PORT} is in use — using port ${port} instead`, 'warn');
  }

  activePort = port;

  // Server bundle is now CJS (.cjs) — all node_modules are inlined by esbuild.
  // No NODE_PATH needed. No ESM loader involved. Works with spaces in path.
  const serverPath = path.join(process.resourcesPath, 'server', 'server.bundle.cjs');
  pushLog(`Starting server on port ${activePort}: ${serverPath}`);
  lastServerStartTime = Date.now();

  // Build a clean env for the server child process.
  // Strip any secrets that were baked into the build environment (ADMIN_PASSWORD,
  // DEVELOPER_LOCK, API keys, etc.) — these must come from the user's own
  // homestream-config.json written during the setup wizard, NOT from build-time
  // env vars. Leaking them here causes isSetupComplete() to return true before
  // the wizard has run, skipping setup entirely and crashing on missing mediaDir.
  const BUILD_TIME_SECRETS = [
    'ADMIN_PASSWORD', 'DEVELOPER_LOCK', 'GH_TOKEN',
    'GOOGLE_AI_API_KEY', 'TMDB_API_KEY', 'OMDB_API_KEY',
    'VIRUSTOTAL_API_KEY', 'QBIT_PASSWORD', 'JELLYFIN_API_KEY',
    'SETUP_COMPLETE', '_PLACEHOLDER',
  ];
  const cleanEnv = { ...process.env };
  for (const key of BUILD_TIME_SECRETS) delete cleanEnv[key];

  serverProcess = utilityProcess.fork(serverPath, [], {
    env: {
      ...cleanEnv,
      PORT: String(activePort),
      // Bind to all network interfaces so the TV/phone can reach HomeStream
      // over the LAN. vite-plugin-api-routes reads SERVER_HOST to set the
      // Express listen address (defaults to 127.0.0.1 which blocks LAN access).
      SERVER_HOST: '0.0.0.0',
      NODE_ENV: 'production',
      ELECTRON: '1',
      // Pass resourcesPath so the server bundle can locate client files.
      // process.resourcesPath is Electron-only and does NOT exist in the
      // child Node.js process — we must inject it explicitly.
      ELECTRON_RESOURCES_PATH: process.resourcesPath,
      // Tell all server stores where to write data files.
      // app.getPath('userData') resolves to the OS user-data folder:
      //   Windows: %APPDATA%\HomeStream
      //   macOS:   ~/Library/Application Support/HomeStream
      //   Linux:   ~/.config/HomeStream
      HOMESTREAM_DATA: app.getPath('userData'),
      // Inject the bundled ffmpeg path so the server uses it automatically.
      // This means users do NOT need to install FFmpeg manually.
      FFMPEG_PATH: getFfmpegPath() ?? 'ffmpeg',
      // Inject platform info so the setup wizard can suggest the right default
      // media directory for the user's OS (Windows vs macOS vs Linux).
      HOMESTREAM_PLATFORM: process.platform,
      HOMESTREAM_DEFAULT_MEDIA_DIR: (() => {
        const videos = app.getPath('videos');
        return path.join(videos, 'HomeStream');
      })(),
    },
    stdio: 'pipe',
  });

  // ── Desktop crash log ─────────────────────────────────────────────────────
  // Write all server stdout/stderr to Desktop\homestream-debug.txt so the user
  // can read the actual crash message without hunting through AppData or Event Viewer.
  const desktopLog = path.join(app.getPath('desktop'), 'homestream-debug.txt');
  function appendDesktopLog(line) {
    try {
      fs.appendFileSync(desktopLog, `[${new Date().toISOString()}] ${line}\n`);
    } catch { /* ignore write errors */ }
  }
  // Write a header so each run is clearly separated
  try {
    fs.appendFileSync(desktopLog,
      `\n${'='.repeat(60)}\nHomeStream started at ${new Date().toISOString()}\n` +
      `resourcesPath: ${process.resourcesPath}\n` +
      `userData: ${app.getPath('userData')}\n` +
      `${'='.repeat(60)}\n`
    );
  } catch { /* ignore */ }

  serverProcess.stdout?.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => {
      pushLog(line, 'info');
      appendDesktopLog(`[stdout] ${line}`);
    });
  });
  serverProcess.stderr?.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => {
      pushLog(line, 'error');
      appendDesktopLog(`[stderr] ${line}`);
    });
  });
  serverProcess.on('exit', code => {
    appendDesktopLog(`[exit] Server exited with code ${code}`);
    pushLog(`Server exited with code ${code}`, code === 0 ? 'info' : 'error');
    serverProcess = null;
    serverRunning = false;
    sendStatus();

    // ── Watchdog: auto-restart on unexpected crash ─────────────────────────
    // If the server exits with a non-zero code AND the app isn't quitting,
    // restart it automatically with exponential backoff (2s → 4s → 8s → max 30s).
    // Cap at 10 restarts to avoid infinite loops on a fundamentally broken server.
    //
    // Fast-crash guard: if the server exits within FAST_CRASH_WINDOW_MS of
    // starting, that's a "fast crash". After MAX_FAST_CRASHES fast crashes in a
    // row, we quit the entire Electron app so the user doesn't have to kill it
    // via Task Manager or restart their PC.
    const MAX_WATCHDOG_RESTARTS = 3;

    // Hard-stop: if we are already quitting, do nothing at all.
    // This prevents queued setTimeout callbacks from spawning new processes
    // after app.quit() has been called.
    if (app.isQuitting) return;

    if (code !== 0) {
      // Detect fast crash
      const uptime = Date.now() - lastServerStartTime;
      if (uptime < FAST_CRASH_WINDOW_MS) {
        fastCrashCount++;
        pushLog(`Watchdog: fast crash #${fastCrashCount}/${MAX_FAST_CRASHES} (server lived ${uptime}ms)`, 'error');
        appendDesktopLog(`Watchdog: fast crash #${fastCrashCount}/${MAX_FAST_CRASHES} (uptime ${uptime}ms)`);

        if (fastCrashCount >= MAX_FAST_CRASHES) {
          // Set quitting FIRST before anything else so no further restarts fire
          app.isQuitting = true;
          pushLog(`Watchdog: ${MAX_FAST_CRASHES} fast crashes — quitting.`, 'error');

          // Show the desktop log path in the dialog since crash-log.json may not exist
          let crashDetail = '';
          try {
            const desktopLogPath = path.join(app.getPath('desktop'), 'homestream-debug.txt');
            if (fs.existsSync(desktopLogPath)) {
              const lines = fs.readFileSync(desktopLogPath, 'utf-8').split('\n').slice(-30).join('\n');
              crashDetail = `\nLast log lines:\n${lines}`;
            }
          } catch { /* ignore */ }

          dialog.showErrorBox(
            'HomeStream — Crash loop stopped',
            `The server crashed ${MAX_FAST_CRASHES} times instantly.\n\n` +
            `HomeStream has stopped to protect your PC.\n\n` +
            `Open this file on your Desktop for the full error:\n` +
            `  homestream-debug.txt` +
            crashDetail
          );
          app.quit();
          return;
        }
      } else {
        // Survived past the fast-crash window — reset fast-crash counter
        fastCrashCount = 0;
      }

      if (watchdogRestarts >= MAX_WATCHDOG_RESTARTS) {
        app.isQuitting = true;
        pushLog(`Watchdog: giving up after ${MAX_WATCHDOG_RESTARTS} restarts.`, 'error');
        dialog.showErrorBox(
          'HomeStream — Too many restarts',
          `The HomeStream server crashed ${MAX_WATCHDOG_RESTARTS} times.\n\n` +
          `Open this file on your Desktop for the full error:\n` +
          `  homestream-debug.txt`
        );
        app.quit();
        return;
      }
      watchdogRestarts++;
      const delay = Math.min(2000 * Math.pow(2, watchdogRestarts - 1), 30000);
      pushLog(`Watchdog: restarting server in ${delay / 1000}s (attempt ${watchdogRestarts}/${MAX_WATCHDOG_RESTARTS})…`, 'warn');
      setTimeout(() => {
        if (app.isQuitting) return; // double-check before spawning
        if (!serverProcess) {
          pushLog('Watchdog: restarting server now…', 'warn');
          startServer().catch(err => pushLog(`Watchdog restart failed: ${err.message}`, 'error'));
        }
      }, delay);
    } else if (code === 0) {
      // Clean exit — reset all counters
      watchdogRestarts = 0;
      fastCrashCount = 0;
    }
  });

  waitForServer(activePort).then(() => {
    serverRunning = true;
    watchdogRestarts = 0; // reset on successful start
    fastCrashCount = 0;   // reset fast-crash counter on successful start
    pushLog(`Server ready at http://localhost:${activePort}`, 'success');
    pushLog(`LAN address: http://${getLanIp()}:${activePort}`, 'success');
    sendStatus();

    // Only open the browser on the FIRST successful server start, not on
    // watchdog restarts. This prevents spam-opening browser windows on crash loops.
    if (watchdogRestarts === 0) {
      const configPath = path.join(app.getPath('userData'), 'homestream-config.json');
      const isFirstRun = !fs.existsSync(configPath);
      const startPage = isFirstRun ? '/setup' : '/';
      shell.openExternal(`http://localhost:${activePort}${startPage}`);
      if (isFirstRun) pushLog('First run detected — opening setup wizard in browser', 'info');
    }
  }).catch(err => {
    pushLog(`Server failed to start: ${err.message}`, 'error');
    serverRunning = false;
    sendStatus();
  });
}

function stopServer() {
  if (!serverProcess) return;
  pushLog('Stopping server…', 'warn');
  // On Windows, SIGTERM is mapped to an immediate kill (no graceful shutdown).
  // We send a graceful shutdown request via HTTP first, then kill after a timeout.
  // This gives the server a chance to clean up HLS temp segments.
  const proc = serverProcess;
  const port = activePort;
  serverProcess = null;
  serverRunning = false;
  sendStatus();

  // Try graceful HTTP shutdown first (server listens for this).
  // Use POST — GET is CSRF-able via <img src> or <script src> from any LAN page.
  const postBody = '{}';
  const gracefulReq = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/shutdown',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postBody) },
    },
    () => {
      // Server acknowledged — give it 3 seconds to clean up then kill
      setTimeout(() => { try { proc.kill(); } catch { /* already dead */ } }, 3000);
    },
  );
  gracefulReq.setTimeout(1000, () => {
    gracefulReq.destroy();
    // No response — kill immediately
    try { proc.kill(); } catch { /* already dead */ }
  });
  gracefulReq.on('error', () => {
    // Server not responding — kill immediately
    try { proc.kill(); } catch { /* already dead */ }
  });
  gracefulReq.write(postBody);
  gracefulReq.end();
}

function waitForServer(port, timeout = SERVER_READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      // /api/health is intentionally open (no auth required) — safe to poll here
      const req = http.get(`http://localhost:${port}/api/health`, res => {
        if (res.statusCode === 200) resolve(true);
        else retry();
        // Consume response body so the socket is released
        res.resume();
      });
      // Per-request timeout: if the server accepts the connection but hangs,
      // destroy the socket after 2 seconds so we retry rather than freezing.
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return reject(new Error(`Server startup timeout after ${timeout / 1000}s — port ${port} may be in use by another app`));
      setTimeout(check, 500);
    };
    check();
  });
}

function sendStatus() {
  const lanIp = getLanIp();
  controlWindow?.webContents.send('status', {
    running: serverRunning,
    lanUrl: `http://${lanIp}:${activePort}`,
    localUrl: `http://localhost:${activePort}`,
    lanIp,
    port: activePort,
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
      preload: path.join(__dirname, 'preload.cjs'),
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
        label: `Open in Browser (http://localhost:${activePort})`,
        click: () => shell.openExternal(`http://localhost:${activePort}`),
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

ipcMain.on('start-server',      () => startServer().catch(err => pushLog(`Start failed: ${err.message}`, 'error')));
ipcMain.on('stop-server',       () => stopServer());
ipcMain.on('open-browser',      () => shell.openExternal(`http://localhost:${activePort}`));
ipcMain.on('open-browser-lan',  (_, url)  => shell.openExternal(url));
ipcMain.on('open-browser-page', (_, page) => shell.openExternal(`http://localhost:${activePort}${page}`));
ipcMain.on('request-status',    () => sendStatus());

// Read crash log from disk and send to renderer
ipcMain.handle('read-crash-log', () => {
  const logPath = path.join(app.getPath('userData'), 'crash-log.json');
  try {
    if (!fs.existsSync(logPath)) return { entries: [], path: logPath };
    const entries = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    return { entries: entries.slice(0, 20), path: logPath };
  } catch (e) {
    return { entries: [], path: logPath, error: String(e) };
  }
});

// Open crash log folder in Explorer/Finder
ipcMain.on('open-crash-log-folder', () => {
  shell.openPath(app.getPath('userData'));
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createControlWindow();
  createTray();
  await startServer();

  // ── Dev Drawer global shortcut ─────────────────────────────────────────────
  // Ctrl+Shift+Alt+D (Windows/Linux) / Cmd+Shift+Alt+D (macOS)
  // Opens/closes the hidden Dev Drawer in the HomeStream browser UI.
  // Only fires when DEVELOPER_LOCK=true — the React side enforces the gate.
  // Registered globally so it works even when the browser window is not focused.
  const DEV_SHORTCUT = process.platform === 'darwin'
    ? 'Command+Shift+Alt+D'
    : 'Ctrl+Shift+Alt+D';

  const registered = globalShortcut.register(DEV_SHORTCUT, () => {
    // Open the HomeStream browser window if it isn't already open
    shell.openExternal(`http://localhost:${activePort}`);
    // Send IPC to the control panel window — it relays to the React app
    // via a custom event the preload script forwards to the renderer
    controlWindow?.webContents.send('toggle-dev-drawer');
    pushLog(`Dev drawer shortcut triggered (${DEV_SHORTCUT})`, 'info');
  });

  if (!registered) {
    pushLog(`Warning: Could not register dev shortcut ${DEV_SHORTCUT} — key may be in use`, 'warn');
  }

  // Set up auto-updater after window exists so it can send IPC events to it.
  // Passes a getter (not the window directly) so it always uses the current
  // window reference even if the window is recreated.
  setupAutoUpdater({
    controlWindowGetter: () => controlWindow,
    pushLog,
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

app.on('activate', () => {
  controlWindow?.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  teardownUpdater();
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
    padding: 16px 20px 14px;
    border-bottom: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    justify-content: space-between;
    -webkit-app-region: drag;
    flex-shrink: 0;
  }
  .logo { font-size: 1.25rem; font-weight: 700; letter-spacing: 2px; color: #fff; }
  .logo span { color: #7c3aed; }
  .subtitle { font-size: 0.65rem; color: #555; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .version-badge {
    font-size: 0.65rem; color: #444; background: #141414;
    border: 1px solid #222; border-radius: 4px; padding: 2px 7px;
    -webkit-app-region: no-drag;
    cursor: pointer; transition: border-color 0.2s, color 0.2s;
  }
  .version-badge:hover { border-color: #444; color: #888; }

  /* ── Status row ── */
  .status-bar {
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #1f1f1f;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .status-dot {
    width: 9px; height: 9px; border-radius: 50%;
    background: #ef4444; flex-shrink: 0;
    transition: background 0.3s;
  }
  .status-dot.running { background: #22c55e; box-shadow: 0 0 8px #22c55e88; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
  .status-text { font-size: 0.82rem; color: #aaa; flex: 1; min-width: 120px; }
  .status-text strong { color: #fff; }
  .url-chip {
    background: #111; border: 1px solid #2a2a2a; border-radius: 6px;
    padding: 3px 9px; font-size: 0.72rem; color: #7c3aed;
    cursor: pointer; transition: border-color 0.2s;
    -webkit-app-region: no-drag;
    white-space: nowrap;
  }
  .url-chip:hover { border-color: #7c3aed; color: #9d5cf6; }

  /* ── Access panel (QR + addresses) ── */
  .access-panel {
    padding: 14px 20px;
    border-bottom: 1px solid #1f1f1f;
    display: none;
    gap: 16px;
    align-items: flex-start;
    flex-shrink: 0;
  }
  .access-panel.visible { display: flex; }
  .qr-wrap {
    background: #fff;
    border-radius: 8px;
    padding: 6px;
    flex-shrink: 0;
    width: 80px; height: 80px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
  }
  .qr-wrap img { width: 68px; height: 68px; display: block; }
  .qr-wrap .qr-placeholder {
    width: 68px; height: 68px;
    background: repeating-linear-gradient(
      45deg, #ddd 0, #ddd 2px, #fff 2px, #fff 8px
    );
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.55rem; color: #999; text-align: center; padding: 4px;
  }
  .access-info { flex: 1; min-width: 0; }
  .access-row {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px;
  }
  .access-label {
    font-size: 0.62rem; color: #555; text-transform: uppercase;
    letter-spacing: 0.8px; width: 52px; flex-shrink: 0;
  }
  .access-url {
    font-size: 0.75rem; color: #7c3aed; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex: 1;
  }
  .access-url:hover { color: #9d5cf6; text-decoration: underline; }
  .copy-btn {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
    color: #666; font-size: 0.6rem; padding: 2px 6px; cursor: pointer;
    flex-shrink: 0; -webkit-app-region: no-drag;
    transition: color 0.15s, border-color 0.15s;
  }
  .copy-btn:hover { color: #aaa; border-color: #444; }
  .copy-btn.copied { color: #22c55e; border-color: #22c55e44; }
  .qr-hint {
    font-size: 0.62rem; color: #444; margin-top: 4px; line-height: 1.5;
  }

  /* ── First-run banner ── */
  .first-run-banner {
    margin: 0 20px 0;
    background: linear-gradient(135deg, #1a0f2e, #0f1a2e);
    border: 1px solid #3b2a6e;
    border-radius: 8px;
    padding: 12px 14px;
    display: none;
    flex-shrink: 0;
  }
  .first-run-banner.visible { display: block; }
  .first-run-title {
    font-size: 0.78rem; font-weight: 600; color: #a78bfa;
    margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
  }
  .first-run-steps {
    font-size: 0.7rem; color: #8888aa; line-height: 1.8;
    list-style: none;
  }
  .first-run-steps li::before { content: "→ "; color: #7c3aed; }

  /* ── Action buttons ── */
  .actions {
    padding: 12px 20px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #1f1f1f;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  button {
    padding: 7px 16px; border-radius: 7px; border: none;
    font-size: 0.8rem; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    -webkit-app-region: no-drag;
  }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary { background: #7c3aed; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #6d28d9; }
  .btn-secondary { background: #1a1a1a; color: #e5e5e5; border: 1px solid #2a2a2a; }
  .btn-secondary:hover:not(:disabled) { background: #242424; }
  .btn-danger { background: #1a1a1a; color: #ef4444; border: 1px solid #3f1f1f; }
  .btn-danger:hover:not(:disabled) { background: #2a1010; }

  /* ── Log ── */
  .log-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 20px 14px; min-height: 0; }
  .log-label {
    font-size: 0.62rem; color: #444; text-transform: uppercase; letter-spacing: 1px;
    padding: 10px 0 6px; display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0;
  }
  .log-clear { cursor: pointer; color: #333; font-size: 0.62rem; }
  .log-clear:hover { color: #777; }
  .log-box {
    flex: 1; overflow-y: auto; background: #050505; border: 1px solid #181818;
    border-radius: 7px; padding: 8px 10px; font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.7rem; line-height: 1.65; min-height: 0;
  }
  .log-box::-webkit-scrollbar { width: 3px; }
  .log-box::-webkit-scrollbar-track { background: transparent; }
  .log-box::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
  .log-entry { display: flex; gap: 8px; }
  .log-time { color: #333; flex-shrink: 0; }
  .log-line.info { color: #888; }
  .log-line.success { color: #22c55e; }
  .log-line.warn { color: #f59e0b; }
  .log-line.error { color: #ef4444; }
  .empty-log { color: #2a2a2a; font-style: italic; }

  /* ── Update panel ── */
  .update-panel {
    margin: 0 20px 0;
    border-radius: 8px;
    padding: 11px 14px;
    display: none;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .update-panel.visible { display: flex; }
  .update-panel.state-available {
    background: linear-gradient(135deg, #0f1a2e, #0a1520);
    border: 1px solid #1e4a7a;
  }
  .update-panel.state-downloading {
    background: linear-gradient(135deg, #0f1a2e, #0a1520);
    border: 1px solid #1e4a7a;
  }
  .update-panel.state-ready {
    background: linear-gradient(135deg, #0f2e1a, #0a1510);
    border: 1px solid #1e7a3a;
  }
  .update-panel.state-error {
    background: linear-gradient(135deg, #2e0f0f, #1a0a0a);
    border: 1px solid #7a1e1e;
  }
  .update-icon { font-size: 1.1rem; flex-shrink: 0; }
  .update-body { flex: 1; min-width: 0; }
  .update-title {
    font-size: 0.78rem; font-weight: 600; margin-bottom: 3px;
  }
  .state-available  .update-title { color: #60a5fa; }
  .state-downloading .update-title { color: #60a5fa; }
  .state-ready      .update-title { color: #4ade80; }
  .state-error      .update-title { color: #f87171; }
  .update-sub { font-size: 0.68rem; color: #666; }
  .update-progress {
    height: 3px; background: #1a2a3a; border-radius: 2px;
    margin-top: 6px; overflow: hidden;
  }
  .update-progress-bar {
    height: 100%; background: #3b82f6; border-radius: 2px;
    transition: width 0.3s ease;
  }
  .update-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .btn-update {
    padding: 5px 12px; border-radius: 6px; border: none;
    font-size: 0.72rem; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s; -webkit-app-region: no-drag;
  }
  .btn-update-primary { background: #3b82f6; color: #fff; }
  .btn-update-primary:hover { background: #2563eb; }
  .btn-update-success { background: #22c55e; color: #fff; }
  .btn-update-success:hover { background: #16a34a; }
  .btn-update-dismiss {
    background: transparent; color: #444; border: 1px solid #222;
  }
  .btn-update-dismiss:hover { color: #888; border-color: #444; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="logo">HOME<span>STREAM</span></div>
    <div class="subtitle">Control Panel</div>
  </div>
  <div class="version-badge" id="version-badge" onclick="checkForUpdate()" title="Click to check for updates">v${app.getVersion()}</div>
</div>

<!-- Status row -->
<div class="status-bar">
  <div class="status-dot" id="dot"></div>
  <div class="status-text" id="status-text">Starting…</div>
  <div class="url-chip" id="local-url" style="display:none" onclick="openBrowser()">localhost:3000</div>
</div>

<!-- Access panel: QR code + addresses (shown when running) -->
<div class="access-panel" id="access-panel">
  <div class="qr-wrap" id="qr-wrap" onclick="openLan()" title="Click to open on this PC">
    <div class="qr-placeholder">Scan to open on phone</div>
  </div>
  <div class="access-info">
    <div class="access-row">
      <span class="access-label">This PC</span>
      <span class="access-url" id="local-link" onclick="openBrowser()">http://localhost:3000</span>
      <button class="copy-btn" onclick="copyUrl('local')">Copy</button>
    </div>
    <div class="access-row">
      <span class="access-label">Network</span>
      <span class="access-url" id="lan-link" onclick="openLan()">—</span>
      <button class="copy-btn" onclick="copyUrl('lan')">Copy</button>
    </div>
    <div class="qr-hint">
      📱 Scan QR with your phone to use as a remote control.<br>
      Both devices must be on the same WiFi network.
    </div>
  </div>
</div>

<!-- First-run banner (shown on first launch) -->
<div class="first-run-banner" id="first-run-banner">
  <div class="first-run-title">🎬 Welcome to HomeStream!</div>
  <ul class="first-run-steps">
    <li>The setup wizard has opened in your browser</li>
    <li>Follow the steps to point HomeStream at your media folder</li>
    <li>Add your TMDB API key for movie/show artwork (free)</li>
    <li>Come back here anytime — this window stays in your system tray</li>
  </ul>
</div>

<!-- Update notification panel (hidden until an update event fires) -->
<div class="update-panel" id="update-panel">
  <div class="update-icon" id="update-icon">⬆️</div>
  <div class="update-body">
    <div class="update-title" id="update-title">Update available</div>
    <div class="update-sub"  id="update-sub"></div>
    <div class="update-progress" id="update-progress" style="display:none">
      <div class="update-progress-bar" id="update-progress-bar" style="width:0%"></div>
    </div>
  </div>
  <div class="update-actions" id="update-actions"></div>
</div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn-primary" id="btn-open" disabled onclick="openBrowser()">Open HomeStream</button>
  <button class="btn-secondary" id="btn-setup" disabled onclick="openSetup()">Setup Wizard</button>
  <button class="btn-secondary" id="btn-stop" disabled onclick="toggleServer()">Stop Server</button>
  <button class="btn-secondary" id="btn-check-update" onclick="checkForUpdate()" title="Check GitHub Releases for a newer version">Check for Updates</button>
  <button class="btn-secondary" id="btn-crashlog" onclick="toggleCrashLog()" title="View crash log to diagnose startup errors">Crash Log</button>
</div>

<!-- Crash log panel (hidden by default) -->
<div id="crash-panel" style="display:none; flex-direction:column; padding:0 20px 10px; flex-shrink:0; max-height:220px;">
  <div style="font-size:0.62rem;color:#444;text-transform:uppercase;letter-spacing:1px;padding:8px 0 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <span>Crash Log <span id="crash-path" style="color:#333;font-size:0.58rem;margin-left:6px;"></span></span>
    <span style="display:flex;gap:10px;">
      <span style="cursor:pointer;color:#333;font-size:0.62rem;" onclick="openCrashFolder()">Open Folder</span>
      <span style="cursor:pointer;color:#333;font-size:0.62rem;" onclick="refreshCrashLog()">Refresh</span>
    </span>
  </div>
  <div id="crash-box" style="flex:1;overflow-y:auto;background:#050505;border:1px solid #2a0a0a;border-radius:7px;padding:8px 10px;font-family:'SF Mono','Cascadia Code','Fira Code',monospace;font-size:0.68rem;line-height:1.6;min-height:80px;max-height:160px;">
    <div style="color:#333;font-style:italic;">Click Crash Log to load…</div>
  </div>
</div>

<!-- Server log -->
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
  let localUrl = '';
  let currentPort = 3000;
  let isFirstRun = false;
  let qrLoaded = false;

  function openBrowser()  { window.electronAPI?.openBrowser(); }
  function openSetup()    { window.electronAPI?.openBrowserPage('/setup'); }
  function openLan()      { if (lanUrl) window.electronAPI?.openBrowserLan(lanUrl); }

  function toggleServer() {
    if (isRunning) window.electronAPI?.stopServer();
    else           window.electronAPI?.startServer();
  }

  function copyUrl(which) {
    const url = which === 'lan' ? lanUrl : localUrl;
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    const btn = document.querySelector('.copy-btn[onclick="copyUrl(\\''+which+'\\')"]');
    if (btn) {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
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
    box.scrollTop = box.scrollHeight;

    // Detect first run from log message
    if (entry.line && entry.line.includes('First run detected')) {
      isFirstRun = true;
      document.getElementById('first-run-banner').classList.add('visible');
    }
    // Auto-open crash log panel when a crash loop is detected
    if (entry.level === 'error' && entry.line && (entry.line.includes('fast crash') || entry.line.includes('crash loop') || entry.line.includes('Watchdog'))) {
      if (!crashPanelOpen) toggleCrashLog();
    }
  }

  function loadQrCode(networkUrl) {
    if (qrLoaded || !networkUrl) return;
    qrLoaded = true;
    const wrap = document.getElementById('qr-wrap');
    // Fetch QR from the server's built-in QR endpoint
    const qrUrl = networkUrl + '/api/remote/qr?size=200';
    const img = document.createElement('img');
    img.src = qrUrl;
    img.alt = 'QR code';
    img.onerror = () => {
      // QR endpoint needs auth — show a manual hint instead
      wrap.innerHTML = '<div class="qr-placeholder">Open network URL on phone</div>';
    };
    img.onload = () => {
      wrap.innerHTML = '';
      wrap.appendChild(img);
    };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateStatus(status) {
    isRunning = status.running;
    lanUrl = status.lanUrl || '';
    localUrl = status.localUrl || '';
    currentPort = status.port || 3000;

    const dot        = document.getElementById('dot');
    const text       = document.getElementById('status-text');
    const localChip  = document.getElementById('local-url');
    const accessPanel = document.getElementById('access-panel');
    const localLink  = document.getElementById('local-link');
    const lanLink    = document.getElementById('lan-link');
    const btnOpen    = document.getElementById('btn-open');
    const btnSetup   = document.getElementById('btn-setup');
    const btnStop    = document.getElementById('btn-stop');

    dot.className = 'status-dot' + (isRunning ? ' running' : '');
    text.innerHTML = isRunning
      ? '<strong>Running</strong> — ready to stream'
      : '<strong>Stopped</strong>';

    if (isRunning) {
      localChip.style.display = 'block';
      localChip.textContent = \`localhost:\${currentPort}\`;
      accessPanel.classList.add('visible');
      localLink.textContent = localUrl;
      if (lanUrl) {
        lanLink.textContent = lanUrl;
        loadQrCode(lanUrl);
      } else {
        lanLink.textContent = 'Not connected to a network';
      }
    } else {
      localChip.style.display = 'none';
      accessPanel.classList.remove('visible');
    }

    btnOpen.disabled  = !isRunning;
    btnSetup.disabled = !isRunning;
    btnStop.disabled  = false;
    btnStop.textContent = isRunning ? 'Stop Server' : 'Start Server';
    btnStop.className   = isRunning ? 'btn-danger' : 'btn-secondary';
  }

  window.electronAPI?.onStatus(updateStatus);
  window.electronAPI?.onLog(appendLog);
  window.electronAPI?.requestStatus();

  // ── Auto-updater UI ────────────────────────────────────────────────────────

  let updateState = 'idle';

  function checkForUpdate() {
    window.electronAPI?.checkForUpdate();
    // Briefly disable the button and show feedback
    const btn = document.getElementById('btn-check-update');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Check for Updates'; }, 6_000);
    }
    // Show a brief "checking" indicator on the version badge
    const badge = document.getElementById('version-badge');
    if (badge) { badge.textContent = 'Checking…'; setTimeout(() => { badge.textContent = badge.dataset.version || 'v?'; }, 4000); }
  }

  function handleUpdateStatus(data) {
    updateState = data.state;
    const panel    = document.getElementById('update-panel');
    const title    = document.getElementById('update-title');
    const sub      = document.getElementById('update-sub');
    const icon     = document.getElementById('update-icon');
    const progress = document.getElementById('update-progress');
    const bar      = document.getElementById('update-progress-bar');
    const actions  = document.getElementById('update-actions');

    // Reset panel classes
    panel.className = 'update-panel';
    progress.style.display = 'none';
    actions.innerHTML = '';

    switch (data.state) {
      case 'checking':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '🔄';
        title.textContent = 'Checking for updates…';
        sub.textContent = '';
        break;

      case 'available':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '⬆️';
        title.textContent = \`Update available — v\${data.version}\`;
        sub.textContent = 'A delta update is ready. Download is small — no reinstall needed.';
        actions.innerHTML =
          '<button class="btn-update btn-update-primary" onclick="window.electronAPI?.downloadUpdate()">Download Update</button>' +
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Later</button>';
        break;

      case 'downloading': {
        panel.classList.add('visible', 'state-downloading');
        icon.textContent = '⬇️';
        const pct = data.percent ?? 0;
        title.textContent = \`Downloading update — \${pct}%\`;
        const mbps = data.bytesPerSecond ? (data.bytesPerSecond / 1_048_576).toFixed(1) + ' MB/s' : '';
        sub.textContent = mbps ? \`Downloading at \${mbps}\` : 'Downloading…';
        progress.style.display = 'block';
        bar.style.width = pct + '%';
        break;
      }

      case 'ready':
        panel.classList.add('visible', 'state-ready');
        icon.textContent = '✅';
        title.textContent = \`v\${data.version} ready to install\`;
        sub.textContent = 'HomeStream will restart and apply the update automatically. No reinstall needed.';
        actions.innerHTML =
          '<button class="btn-update btn-update-success" onclick="window.electronAPI?.installUpdate()">Restart & Update</button>' +
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Later</button>';
        break;

      case 'not-available':
        panel.classList.add('visible', 'state-available');
        icon.textContent = '✓';
        title.textContent = 'HomeStream is up to date';
        sub.textContent = '';
        // Auto-dismiss after 4 seconds
        setTimeout(dismissUpdate, 4_000);
        break;

      case 'error':
        panel.classList.add('visible', 'state-error');
        icon.textContent = '⚠️';
        title.textContent = 'Update check failed';
        sub.textContent = data.error ?? 'Could not reach update server.';
        actions.innerHTML =
          '<button class="btn-update btn-update-dismiss" onclick="dismissUpdate()">Dismiss</button>';
        break;

      case 'idle':
      default:
        // Hide panel
        break;
    }
  }

  function dismissUpdate() {
    const panel = document.getElementById('update-panel');
    panel.className = 'update-panel'; // remove 'visible'
    updateState = 'idle';
  }

  window.electronAPI?.onUpdateStatus(handleUpdateStatus);

  // ── Crash log panel ────────────────────────────────────────────────────────
  let crashPanelOpen = false;

  function toggleCrashLog() {
    crashPanelOpen = !crashPanelOpen;
    const panel = document.getElementById('crash-panel');
    panel.style.display = crashPanelOpen ? 'flex' : 'none';
    if (crashPanelOpen) refreshCrashLog();
  }

  function openCrashFolder() {
    window.electronAPI?.openCrashLogFolder();
  }

  async function refreshCrashLog() {
    const box = document.getElementById('crash-box');
    box.innerHTML = '<div style="color:#555;font-style:italic;">Loading…</div>';
    try {
      const result = await window.electronAPI?.readCrashLog();
      const pathEl = document.getElementById('crash-path');
      if (pathEl && result?.path) pathEl.textContent = result.path;

      if (!result || result.entries.length === 0) {
        box.innerHTML = '<div style="color:#22c55e;font-style:italic;">No crashes recorded — server is healthy.</div>';
        return;
      }
      box.innerHTML = '';
      result.entries.forEach(e => {
        const div = document.createElement('div');
        div.style.cssText = 'margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #1a0a0a;';
        const ts = new Date(e.timestamp).toLocaleString();
        const typeColor = e.type === 'uncaughtException' ? '#ef4444' : e.type === 'startup' ? '#f59e0b' : '#f87171';
        div.innerHTML =
          '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px;">' +
            '<span style="color:' + typeColor + ';font-weight:700;font-size:0.65rem;text-transform:uppercase;">' + escHtml(e.type) + '</span>' +
            '<span style="color:#444;font-size:0.62rem;">' + escHtml(ts) + '</span>' +
            '<span style="color:#333;font-size:0.6rem;">uptime:' + e.uptime + 's</span>' +
          '</div>' +
          '<div style="color:#ef4444;margin-bottom:3px;">' + escHtml(e.message) + '</div>' +
          (e.stack ? '<div style="color:#555;font-size:0.62rem;white-space:pre-wrap;word-break:break-all;">' + escHtml(e.stack.split('\\n').slice(0,4).join('\\n')) + '</div>' : '') +
          (e.context ? '<div style="color:#444;font-size:0.6rem;margin-top:2px;">context: ' + escHtml(e.context) + '</div>' : '');
        box.appendChild(div);
      });
    } catch(err) {
      box.innerHTML = '<div style="color:#ef4444;">Failed to read crash log: ' + escHtml(String(err)) + '</div>';
    }
  }

</script>
</body>
</html>`;

// ── Minimal tray icon (16×16 purple square as data URL) ───────────────────────
// Used as fallback when tray-icon.png doesn't exist (B3 fix)
const TRAY_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAI0lEQVQ4jWNgYGD4z8BAgGIqGDUAXxqNBqMGjBowasCoAQCZAAQAAWiHlwAAAABJRU5ErkJggg==';
