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
let drainTimer = null;
let getControlWindow = null; // injected by main.js
let activePort = 3000;       // injected by main.js via setupAutoUpdater({ port })

// ── HTTP bridge helpers ───────────────────────────────────────────────────────
// The Electron main process and the Express server are separate OS processes
// (utilityProcess.fork).  They share no memory.  The only way to communicate
// is over the loopback network.
//
// Push path  (Electron → server → React):
//   sendStatus() calls POST /api/updater/push with the new state.
//   The server stores it.  React polls GET /api/updater/status every 10 s.
//
// Action path (React → server → Electron):
//   React calls POST /api/updater/action { action }.
//   The server enqueues it.  Electron polls GET /api/updater/drain every 5 s.

const http = require('http');

function httpPost(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: activePort, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: activePort, path },
      (res) => {
        let body = '';
        res.on('data', d => { body += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

function pushStatus(state, extra = {}) {
  // On Linux, tell the React app which package format is running so it can
  // show the correct update UI (AppImage = auto-update; deb/pacman = manual).
  let linuxPackageFormat;
  if (process.platform === 'linux') {
    // The APPIMAGE env var is set by the AppImage runtime when running from an
    // AppImage. deb/pacman installs do not set it.
    if (process.env.APPIMAGE) {
      linuxPackageFormat = 'appimage';
    } else {
      // Heuristic: check if the executable path looks like a pacman/deb install
      const execPath = process.execPath || '';
      if (execPath.includes('/usr/lib/') || execPath.includes('/opt/')) {
        linuxPackageFormat = execPath.includes('pacman') ? 'pacman' : 'deb';
      } else {
        linuxPackageFormat = 'unknown';
      }
    }
  }
  httpPost('/api/updater/push', {
    state,
    version: availableVersion,
    // Always include the running version so the UI can show "v1.7.0 — up to date"
    currentVersion: app.getVersion(),
    ...extra,
    isElectron: true,
    ...(linuxPackageFormat ? { linuxPackageFormat } : {}),
  }).catch(() => {}); // fire-and-forget; errors are non-fatal
}

function startDrainPoller() {
  if (drainTimer) return; // already running
  drainTimer = setInterval(async () => {
    const result = await httpGet('/api/updater/drain');
    if (!result?.actions?.length) return;
    for (const action of result.actions) {
      if (action === 'check')    checkForUpdate();
      if (action === 'download') handleDownload();
      if (action === 'install')  handleInstall();
    }
  }, 5_000);
  drainTimer.unref();
}

function handleDownload() {
  if (currentState !== 'available') return;
  pushLogFn?.('[updater] Starting update download…', 'info');
  autoUpdater.downloadUpdate().catch(err => {
    pushLogFn?.(`[updater] Download failed: ${err?.message ?? err}`, 'error');
    sendStatus('error', { error: err?.message ?? String(err) });
  });
}

function handleInstall() {
  if (currentState !== 'ready') return;
  const currentVersion = app.getVersion();
  if (!availableVersion || !semverGt(availableVersion, currentVersion)) {
    pushLogFn?.(`[updater] Refusing to install v${availableVersion} — not newer than v${currentVersion}`, 'warn');
    sendStatus('idle');
    return;
  }
  pushLogFn?.('[updater] Restarting to install update…', 'warn');
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

// Beta channel opt-in — persisted to a simple JSON file next to the app data.
// When true, autoUpdater.allowPrerelease = true so pre-release tags (v1.6.0-beta.1)
// are included in update checks alongside stable releases.
let betaChannelEnabled = false;

function loadBetaPreference() {
  try {
    const fs = require('fs');
    const p = path.join(app.getPath('userData'), 'homestream-prefs.json');
    if (fs.existsSync(p)) {
      const prefs = JSON.parse(fs.readFileSync(p, 'utf8'));
      betaChannelEnabled = !!prefs.betaChannel;
    }
  } catch { /* ignore */ }
}

function saveBetaPreference(enabled) {
  try {
    const fs = require('fs');
    const p = path.join(app.getPath('userData'), 'homestream-prefs.json');
    let prefs = {};
    try { prefs = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* fresh file */ }
    prefs.betaChannel = enabled;
    fs.writeFileSync(p, JSON.stringify(prefs, null, 2));
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendStatus(state, extra = {}) {
  currentState = state;
  const payload = { state, version: availableVersion, ...extra };
  // 1. IPC → control panel tray window
  const win = getControlWindow?.();
  win?.webContents?.send('update-status', payload);
  // 2. HTTP push → Express server → React app polling /api/updater/status
  pushStatus(state, extra);
}

function log(msg, level = 'info') {
  // Delegate to main.js pushLog via the injected logger
  pushLogFn?.(`[updater] ${msg}`, level);
}

let pushLogFn = null;

// Simple semver comparison — returns true if `a` is strictly greater than `b`
function semverGt(a, b) {
  try {
    const pa = String(a).replace(/^v/, '').split('.').map(Number);
    const pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na > nb) return true;
      if (na < nb) return false;
    }
    return false; // equal
  } catch {
    return false;
  }
}



function setupAutoUpdater({ controlWindowGetter, pushLog, port = 3000 }) {
  getControlWindow = controlWindowGetter;
  pushLogFn = pushLog;
  activePort = port;

  // Load beta preference from disk before anything else
  loadBetaPreference();

  // Skip entirely in dev mode
  if (!app.isPackaged) {
    log('Auto-updater disabled in dev mode', 'info');
    return;
  }

  // Skip if the GitHub repo hasn't been configured yet.
  let pkg = {};
  try { pkg = require('../package.json'); } catch { /* ignore */ }

  // Hardcoded fallbacks — these never change and ensure the updater works
  // even if package.json can't be read from the asar (e.g. path resolution edge case).
  const HARDCODED_OWNER = 'HomeStream-co';
  const HARDCODED_REPO  = 'homestream';

  const owner = process.env.HOMESTREAM_GH_OWNER || pkg?.build?.ghOwner || HARDCODED_OWNER;
  const repo  = process.env.HOMESTREAM_GH_REPO  || pkg?.build?.ghRepo  || HARDCODED_REPO;

  if (!owner || !repo) {
    log('Auto-updater not configured — set GH_OWNER + GH_REPO as GitHub Actions secrets to enable.', 'info');
    sendStatus('idle');
    return;
  }

  log(`Auto-updater configured for ${owner}/${repo}`);

  // ── Private repo: configure the feed URL with the token ─────────────────────
  // For a private GitHub repo, electron-updater must use PrivateGitHubProvider
  // (which routes through api.github.com) instead of the default GitHubProvider
  // (which hits the public CDN and gets 404s on private repos).
  //
  // The provider is selected in providerFactory.js via this logic:
  //   token = (options.private ? process.env.GH_TOKEN : null) || options.token
  //   token == null → GitHubProvider (public, no auth)
  //   token != null → PrivateGitHubProvider (api.github.com, authenticated)
  //
  // So we must call setFeedURL() with { private: true, token } to force
  // PrivateGitHubProvider. Setting autoUpdater.requestHeaders alone is NOT
  // enough — that only affects downloads, not the provider class instantiation.
  //
  // The token is baked into the app at build time via electron-builder
  // extraMetadata.ghToken (set from the GH_TOKEN CI secret).
  // Use a fine-grained PAT scoped to read-only release assets on this repo only.
  const ghToken = process.env.HOMESTREAM_GH_TOKEN || pkg?.build?.ghToken || '';
  if (ghToken) {
    // setFeedURL forces PrivateGitHubProvider — the token field is passed
    // directly to the provider constructor, bypassing the GH_TOKEN env var check.
    autoUpdater.setFeedURL({
      provider: 'github',
      owner,
      repo,
      private: true,
      token: ghToken,
    });
    log('GitHub token configured — using PrivateGitHubProvider (api.github.com)');
  } else {
    // No token: fall back to public GitHubProvider. This will 404 on a private
    // repo but is the best we can do without a token.
    autoUpdater.setFeedURL({
      provider: 'github',
      owner,
      repo,
    });
    log('No GitHub token found — update checks will fail on private repos. Set GH_TOKEN in CI and add ghToken to extraMetadata.', 'warn');
  }

  // Disable auto-download so the user controls when to download.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Apply beta channel preference
  autoUpdater.allowPrerelease = betaChannelEnabled;
  log(`Beta channel: ${betaChannelEnabled ? 'enabled' : 'disabled'}`);

  // ── Event handlers ──────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates…');
    sendStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    // Guard: only treat it as an update if the remote version is strictly newer.
    // This prevents an install loop where the app keeps re-installing itself.
    const currentVersion = app.getVersion();
    if (!semverGt(info.version, currentVersion)) {
      log(`Update check returned v${info.version} which is not newer than current v${currentVersion} — skipping`, 'info');
      sendStatus('not-available');
      setTimeout(() => sendStatus('idle'), 5_000);
      return;
    }
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
    // Final safety check — only install if strictly newer
    const currentVersion = app.getVersion();
    if (!availableVersion || !semverGt(availableVersion, currentVersion)) {
      log(`Refusing to install v${availableVersion} — not newer than current v${currentVersion}`, 'warn');
      sendStatus('idle');
      return;
    }
    log('Restarting to install update…', 'warn');
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  // Beta channel toggle — renderer sends { enabled: boolean }
  ipcMain.on('set-beta-channel', (_event, { enabled }) => {
    betaChannelEnabled = !!enabled;
    saveBetaPreference(betaChannelEnabled);
    autoUpdater.allowPrerelease = betaChannelEnabled;
    log(`Beta channel ${betaChannelEnabled ? 'enabled' : 'disabled'} — next update check will ${betaChannelEnabled ? 'include' : 'exclude'} pre-releases`, 'info');
    // Notify renderer of the current state so the toggle reflects reality
    sendStatus(currentState, { betaChannel: betaChannelEnabled });
  });

  // Renderer can query current beta preference on load
  ipcMain.handle('get-beta-channel', () => betaChannelEnabled);

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

  // ── Action drain poller ─────────────────────────────────────────────────────
  // Poll the server every 5 s for actions queued by the React app
  // (check / download / install).  Starts after a short delay so the server
  // has time to boot before the first request.
  setTimeout(() => startDrainPoller(), STARTUP_CHECK_DELAY_MS);
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
  if (autoCheckTimer) { clearInterval(autoCheckTimer); autoCheckTimer = null; }
  if (drainTimer)     { clearInterval(drainTimer);     drainTimer = null; }
}

/**
 * downloadAndInstall — triggered from crash handler when an update is available.
 * Downloads the update and quits+installs immediately.
 */
function downloadAndInstall() {
  return autoUpdater.downloadUpdate()
    .then(() => autoUpdater.quitAndInstall(false, true));
}

/**
 * checkForUpdateNow — used by crash handler to see if a fix is already out.
 * Resolves with { available: true, version } if a newer version exists,
 * or { available: false } if up to date or check fails.
 * Times out after 8 seconds so it never blocks the crash dialog.
 */
function checkForUpdateNow() {
  return new Promise((resolve) => {
    if (!app.isPackaged) { resolve({ available: false }); return; }

    const timeout = setTimeout(() => resolve({ available: false }), 8_000);

    const onAvailable = (info) => {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
      const isNewer = semverGt(info.version, app.getVersion());
      resolve(isNewer ? { available: true, version: info.version } : { available: false });
    };
    const onNotAvailable = () => {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('error', onError);
      resolve({ available: false });
    };
    const onError = () => {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      resolve({ available: false });
    };

    autoUpdater.once('update-available',     onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error',                onError);

    autoUpdater.checkForUpdates().catch(() => {
      clearTimeout(timeout);
      resolve({ available: false });
    });
  });
}

module.exports = { setupAutoUpdater, teardown, checkForUpdateNow, downloadAndInstall };
