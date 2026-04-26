/**
 * updaterBridge — shared in-memory state between the Electron main process
 * and the Express API routes.
 *
 * The Electron main process (main.cjs) calls setUpdaterStatus() whenever the
 * auto-updater state changes.  The API route GET /api/updater/status reads it
 * via getUpdaterStatus().  This lets the React app (running in the system
 * browser, not an Electron BrowserWindow) poll for update state over HTTP
 * instead of needing IPC / window.electronAPI.
 *
 * When running outside Electron (dev server, browser preview) the status
 * stays at { state: 'idle' } and action callbacks are no-ops.
 */

export interface UpdaterStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
  /** True when running inside the packaged Electron app */
  isElectron?: boolean;
}

let _status: UpdaterStatus = { state: 'idle', isElectron: false };

// Callbacks registered by the Electron main process
let _onCheck:    (() => void) | null = null;
let _onDownload: (() => void) | null = null;
let _onInstall:  (() => void) | null = null;

/** Called by the Electron main process to push state into the bridge */
export function setUpdaterStatus(status: UpdaterStatus): void {
  _status = { ...status, isElectron: true };
}

/** Called by GET /api/updater/status */
export function getUpdaterStatus(): UpdaterStatus {
  return _status;
}

/** Called by the Electron main process to register action handlers */
export function registerUpdaterCallbacks(callbacks: {
  onCheck:    () => void;
  onDownload: () => void;
  onInstall:  () => void;
}): void {
  _onCheck    = callbacks.onCheck;
  _onDownload = callbacks.onDownload;
  _onInstall  = callbacks.onInstall;
  // Mark as running inside Electron
  _status = { ..._status, isElectron: true };
}

/** Called by POST /api/updater/action */
export function triggerUpdaterAction(action: 'check' | 'download' | 'install'): void {
  if (action === 'check')    _onCheck?.();
  if (action === 'download') _onDownload?.();
  if (action === 'install')  _onInstall?.();
}
