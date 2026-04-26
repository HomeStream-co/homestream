/**
 * updaterBridge — in-memory state store for the auto-updater, living in the
 * Express server process.
 *
 * Architecture overview:
 *
 *   ┌─────────────────────────┐        HTTP (loopback)       ┌──────────────────────────┐
 *   │  Electron main process  │ ──POST /api/updater/push──▶  │  Express server process  │
 *   │  (updater.cjs)          │                              │  (updaterBridge.ts)      │
 *   │                         │ ◀─GET  /api/updater/drain──  │                          │
 *   └─────────────────────────┘                              └──────────────────────────┘
 *                                                                        │  HTTP poll
 *                                                                        ▼
 *                                                            ┌──────────────────────────┐
 *                                                            │  React app (browser)     │
 *                                                            │  useAppUpdater hook      │
 *                                                            └──────────────────────────┘
 *
 * Push path  (Electron → server → React):
 *   Electron calls POST /api/updater/push with the new state.
 *   The bridge stores it.  React polls GET /api/updater/status every 10 s.
 *
 * Action path (React → server → Electron):
 *   React calls POST /api/updater/action { action }.
 *   The bridge enqueues the action.
 *   Electron polls GET /api/updater/drain every 5 s and executes any queued actions.
 *
 * When running outside Electron (dev server, browser preview) the status
 * stays at { state: 'idle', isElectron: false } and the drain queue is always empty.
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

export type UpdaterAction = 'check' | 'download' | 'install';

let _status: UpdaterStatus = { state: 'idle', isElectron: false };

// Pending actions queued by the React app, drained by Electron
const _actionQueue: UpdaterAction[] = [];

/** Called by POST /api/updater/push (from Electron main process over loopback) */
export function setUpdaterStatus(status: UpdaterStatus): void {
  _status = { ...status, isElectron: true };
}

/** Called by GET /api/updater/status (polled by React app) */
export function getUpdaterStatus(): UpdaterStatus {
  return _status;
}

/** Called by POST /api/updater/action (from React app) */
export function enqueueUpdaterAction(action: UpdaterAction): void {
  // Deduplicate — no point queuing the same action twice
  if (!_actionQueue.includes(action)) {
    _actionQueue.push(action);
  }
}

/**
 * Called by GET /api/updater/drain (polled by Electron main process).
 * Returns and clears all pending actions.
 */
export function drainUpdaterActions(): UpdaterAction[] {
  return _actionQueue.splice(0);
}
