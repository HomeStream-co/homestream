/**
 * HomeStream Auto-Updater
 *
 * Uses electron-updater (part of electron-builder) to check GitHub Releases
 * for new versions and notify the user via the control panel.
 *
 * Update flow:
 *   1. App starts → check for update after a 10-second delay (avoids slowing startup)
 *   2. If an update is available → notify control panel (shows banner)
 *   3. User clicks "Download Update" → download starts, progress shown
 *   4. Download complete → user clicks "Restart & Install" → app restarts
 *
 * Manual check: user can click "Check for Updates" in the control panel at any time.
 *
 * Auto-check interval: every 4 hours while the app is running.
 *
 * Safety rules:
 *   - Never auto-installs without user confirmation
 *   - Only runs in packaged app (app.isPackaged); skipped in dev mode
 *   - All errors are caught and surfaced as log messages, never crash the app
 *
 * IPC events emitted to renderer (control panel):
 *   'update-status'  { state, version?, percent?, error? }
 *     states: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'
 *
 * IPC messages received from renderer:
 *   'check-for-update'    — manual check
 *   'download-update'     — start downloading the available update
 *   'install-update'      — quit and install (only valid in 'ready' state)
 */

const { ipcMain, app } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

// Check every 4 hours while the app is open
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Delay first check after startup so it doesn't compete with server boot
const STARTUP_CHECK_DELAY_MS = 10_000;

// ── State ─────────────────────────────────────────────────────────────────────

let currentState = 'idle';
let availableVersion = null;
let autoCheckTimer = null;
let getControlWindow = null; // injected by main.js

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendStatus(state, extra = {}) {
  currentState = state;
  const payload = { state, version: availableVersion, ...extra };
  const win = getControlWindow?.();
  win?.webContents?.send('update-status', payload);
}

function log(msg, level = 'info') {
  // Delegate to main.js pushLog via the injected logger
  pushLogFn?.(`[updater] ${msg}`, level);
}

let pushLogFn = null;

// ── Auto-updater setup ────────────────────────────────────────────────────────

function setupAutoUpdater({ controlWindowGetter, pushLog }) {
  getControlWindow = controlWindowGetter;
  pushLogFn = pushLog;

  // electron-updater reads publish config from electron-builder.yml automatically.
  // Disable auto-download so the user controls when to download.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // In dev mode, allow testing update flow with a local dev-app-update.yml
  // (electron-updater skips update checks in dev unless this is set)
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = false; // keep skipped in dev by default
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates…');
    sendStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version;
    log(`Update available: v${info.version}`, 'success');
    sendStatus('available');
  });

  autoUpdater.on('update-not-available', (info) => {
    log(`Up to date (v${info.version})`);
    sendStatus('not-available');
    // Reset to idle after a short delay so the UI doesn't stay on "up to date" forever
    setTimeout(() => sendStatus('idle'), 5_000);
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    const mbps = (progress.bytesPerSecond / 1_048_576).toFixed(1);
    log(`Downloading update… ${pct}% (${mbps} MB/s)`);
    sendStatus('downloading', { percent: pct, bytesPerSecond: progress.bytesPerSecond });
  });

  autoUpdater.on('update-downloaded', (info) => {
    availableVersion = info.version;
    log(`Update v${info.version} downloaded — ready to install`, 'success');
    sendStatus('ready');
  });

  autoUpdater.on('error', (err) => {
    // Network errors during background checks are common (offline, firewall, etc.)
    // Log them but don't alarm the user unless they explicitly triggered a check.
    const msg = err?.message ?? String(err);
    log(`Update check failed: ${msg}`, 'warn');
    sendStatus('error', { error: msg });
    // Reset to idle after a delay so the UI recovers
    setTimeout(() => sendStatus('idle'), 8_000);
  });

  // ── IPC handlers ────────────────────────────────────────────────────────────

  ipcMain.on('check-for-update', () => {
    if (!app.isPackaged) {
      log('Skipping update check in dev mode', 'warn');
      sendStatus('not-available');
      setTimeout(() => sendStatus('idle'), 3_000);
      return;
    }
    checkForUpdate();
  });

  ipcMain.on('download-update', () => {
    if (currentState !== 'available') return;
    log('Starting update download…');
    autoUpdater.downloadUpdate().catch(err => {
      log(`Download failed: ${err?.message ?? err}`, 'error');
      sendStatus('error', { error: err?.message ?? String(err) });
    });
  });

  ipcMain.on('install-update', () => {
    if (currentState !== 'ready') return;
    log('Restarting to install update…', 'warn');
    // setImmediate gives the IPC reply time to flush before the process exits
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  // ── Scheduled checks ────────────────────────────────────────────────────────

  // First check: delayed so it doesn't compete with server startup
  const startupTimer = setTimeout(() => {
    if (app.isPackaged) checkForUpdate();
  }, STARTUP_CHECK_DELAY_MS);
  startupTimer.unref(); // don't block clean exit

  // Recurring check every 4 hours
  autoCheckTimer = setInterval(() => {
    if (app.isPackaged) checkForUpdate();
  }, AUTO_CHECK_INTERVAL_MS);
  autoCheckTimer.unref(); // don't block clean exit
}

// ── Public API ────────────────────────────────────────────────────────────────

function checkForUpdate() {
  autoUpdater.checkForUpdates().catch(err => {
    // checkForUpdates() itself can throw synchronously if misconfigured
    log(`checkForUpdates error: ${err?.message ?? err}`, 'warn');
    sendStatus('error', { error: err?.message ?? String(err) });
    setTimeout(() => sendStatus('idle'), 8_000);
  });
}

function teardown() {
  if (autoCheckTimer) {
    clearInterval(autoCheckTimer);
    autoCheckTimer = null;
  }
}

module.exports = { setupAutoUpdater, teardown };
