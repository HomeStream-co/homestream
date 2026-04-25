/**
 * useAppUpdater
 *
 * Bridges the Electron IPC auto-updater into React state.
 * Works in both Electron (real IPC) and browser (no-op / hidden).
 *
 * States:
 *   idle          — no update activity
 *   checking      — checking GitHub for a newer version
 *   available     — a newer version exists, not yet downloaded
 *   not-available — already on the latest version
 *   downloading   — downloading the update package
 *   ready         — downloaded, waiting for user to restart
 *   error         — something went wrong
 */

import { useState, useEffect, useCallback } from 'react';

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
  version?: string;   // available/ready: the new version string
  percent?: number;   // downloading: 0-100
  bytesPerSecond?: number;
  error?: string;     // error: message
  betaChannel?: boolean;
}

type ElectronUpdaterAPI = {
  checkForUpdate?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  setBetaChannel?: (enabled: boolean) => void;
  getBetaChannel?: () => Promise<boolean>;
  onUpdateStatus?: (cb: (data: UpdateStatus) => void) => void;
};

function getAPI(): ElectronUpdaterAPI | null {
  return (window as unknown as { electronAPI?: ElectronUpdaterAPI }).electronAPI ?? null;
}

export interface UseAppUpdaterReturn {
  /** Whether we're running inside Electron (false = browser, hide all update UI) */
  isElectron: boolean;
  status: UpdateStatus;
  checkForUpdate: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  dismiss: () => void;
  betaEnabled: boolean;
  toggleBeta: () => void;
}

export function useAppUpdater(): UseAppUpdaterReturn {
  const api = getAPI();
  const isElectron = !!api?.onUpdateStatus;

  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [betaEnabled, setBetaEnabled] = useState(false);

  // Subscribe to update-status events from the main process
  useEffect(() => {
    if (!api?.onUpdateStatus) return;
    api.onUpdateStatus((data) => setStatus(data));

    // Load current beta preference
    api.getBetaChannel?.().then(v => setBetaEnabled(!!v)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForUpdate = useCallback(() => {
    if (!api?.checkForUpdate) return;
    setStatus({ state: 'checking' });
    api.checkForUpdate();
  }, [api]);

  const downloadUpdate = useCallback(() => {
    if (!api?.downloadUpdate) return;
    api.downloadUpdate();
  }, [api]);

  const installUpdate = useCallback(() => {
    if (!api?.installUpdate) return;
    api.installUpdate();
  }, [api]);

  const dismiss = useCallback(() => {
    setStatus({ state: 'idle' });
  }, []);

  const toggleBeta = useCallback(() => {
    if (!api?.setBetaChannel) return;
    const next = !betaEnabled;
    setBetaEnabled(next);
    api.setBetaChannel(next);
  }, [api, betaEnabled]);

  return {
    isElectron,
    status,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismiss,
    betaEnabled,
    toggleBeta,
  };
}
