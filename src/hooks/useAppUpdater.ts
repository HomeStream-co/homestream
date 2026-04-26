/**
 * useAppUpdater
 *
 * Polls GET /api/updater/status every 10 seconds so the React app can show
 * the UpdateBanner without needing Electron IPC.
 *
 * Why HTTP polling instead of IPC:
 *   The React app runs in the system browser (shell.openExternal), NOT in an
 *   Electron BrowserWindow with a preload script.  window.electronAPI is
 *   therefore always undefined in the React app.  The Electron main process
 *   pushes updater state into the Express server's in-memory bridge
 *   (updaterBridge.ts) and this hook reads it over HTTP.
 *
 * States:
 *   idle          — no update activity (or not running in Electron)
 *   checking      — checking GitHub for a newer version
 *   available     — a newer version exists, not yet downloaded
 *   not-available — already on the latest version
 *   downloading   — downloading the update package
 *   ready         — downloaded, waiting for user to restart
 *   error         — something went wrong
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateStatus {
  state: UpdateState;
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
  isElectron?: boolean;
}

export interface UseAppUpdaterReturn {
  /** True when the server reports it is running inside the packaged Electron app */
  isElectron: boolean;
  status: UpdateStatus;
  checkForUpdate: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  dismiss: () => void;
}

const POLL_INTERVAL_MS = 10_000; // poll every 10 s

async function fetchStatus(): Promise<UpdateStatus> {
  const r = await fetch('/api/updater/status');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<UpdateStatus>;
}

async function postAction(action: 'check' | 'download' | 'install'): Promise<void> {
  await fetch('/api/updater/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action }),
  });
}

export function useAppUpdater(): UseAppUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', isElectron: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef(false);

  const poll = useCallback(async () => {
    // Don't overwrite a user-dismissed state with a stale 'idle' from the server
    try {
      const s = await fetchStatus();
      // If the user dismissed, only update if the server has a non-idle state
      if (dismissedRef.current && s.state === 'idle') return;
      dismissedRef.current = false;
      setStatus(s);
    } catch {
      // Network error — don't change state, just wait for next poll
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    poll();
    // Poll every 10 s
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll]);

  const checkForUpdate = useCallback(() => {
    setStatus(s => ({ ...s, state: 'checking' }));
    postAction('check').catch(() => {});
    // Poll immediately after triggering so the UI updates fast
    setTimeout(poll, 1_000);
  }, [poll]);

  const downloadUpdate = useCallback(() => {
    postAction('download').catch(() => {});
    setTimeout(poll, 1_000);
  }, [poll]);

  const installUpdate = useCallback(() => {
    postAction('install').catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setStatus(s => ({ ...s, state: 'idle' }));
  }, []);

  return {
    isElectron: !!status.isElectron,
    status,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismiss,
  };
}
