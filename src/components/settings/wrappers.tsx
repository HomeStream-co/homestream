/**
 * Self-contained wrappers for settings components that require external state.
 * SettingsPage imports these instead of the raw components.
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import SettingsApiKeys, { type ApiKeysState, type ApiKeysSavedState } from './SettingsApiKeys';
import SettingsDiscover from './SettingsDiscover';
import SettingsParentalControls from './SettingsParentalControls';
import SettingsSession from './SettingsSession';
import SettingsStorage, { type StorageStats } from './SettingsStorage';
import SettingsTools from './SettingsTools';
import SettingsVpn, { type VpnInterface } from './SettingsVpn';
import type { ConfirmDialogState } from './shared';

// ── Confirm dialog stub ───────────────────────────────────────────────────────
// The settings components call onOpenConfirm to show a confirmation dialog.
// We handle it inline with a simple window.confirm fallback.
function useConfirm() {
  const openConfirm = useCallback((state: Omit<ConfirmDialogState, 'open'>) => {
    if (window.confirm(state.message ?? state.title)) {
      state.onConfirm?.();
    }
  }, []);
  return openConfirm;
}

// ── ApiKeys wrapper ───────────────────────────────────────────────────────────
export function SettingsApiKeysWrapper() {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    omdbApiKey: '', googleAiApiKey: '', tmdbApiKey: '', realDebridApiKey: '',
  });
  const [savedState, setSavedState] = useState<ApiKeysSavedState>({
    omdb: false, googleAi: false, tmdb: false, realDebrid: false,
  });
  const [timestamps, setTimestamps] = useState<{omdb: string|null, googleAi: string|null, tmdb: string|null}>({ omdb: null, googleAi: null, tmdb: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d && d.config) {
          setSavedState({
            omdb: !!d.config.omdbApiKey,
            googleAi: !!d.config.googleAiApiKey,
            tmdb: !!d.config.tmdbApiKey,
            realDebrid: !!d.hasRealDebridKey
          });
          setTimestamps({
            omdb: d.config.omdbApiKeySavedAt ?? null,
            googleAi: d.config.googleAiApiKeySavedAt ?? null,
            tmdb: d.config.tmdbApiKeySavedAt ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/setup', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...apiKeys, aiProvider: 'gemini' }),
      });
      setSaved(true);
      setSavedState({ omdb: !!apiKeys.omdbApiKey, googleAi: !!apiKeys.googleAiApiKey, tmdb: !!apiKeys.tmdbApiKey, realDebrid: !!apiKeys.realDebridApiKey });
      setTimeout(() => setSaved(false), 3000);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const makeTest = (key: string) => async () => {
    try {
      if (key === 'realDebrid') {
        const r = await fetch('/api/setup', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test_real_debrid', realDebridApiKey: apiKeys.realDebridApiKey })
        });
        const d = await r.json() as any;
        if (d.ok && d.user) {
          const days = Math.floor((d.user.premium ?? 0) / 86400);
          return { ok: days > 0, message: days > 0 ? `${d.user.username} — ${days} days remaining` : 'Expired' };
        }
        return { ok: false, message: d.error || 'Failed' };
      }

      const val = apiKeys[`${key}ApiKey` as keyof ApiKeysState] || '';
      const r = await fetch('/api/setup/test-keys', { 
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val }) 
      });
      const d = await r.json() as { ok: boolean; message?: string };
      return d;
    } catch { return { ok: false, message: 'Network error' }; }
  };

  return (
    <SettingsApiKeys
      apiKeys={apiKeys}
      apiKeysSavedState={savedState}
      apiKeyTimestamps={timestamps}
      apiKeysSaving={saving}
      apiKeysSaved={saved}
      onChangeKey={(k, v) => setApiKeys(prev => ({ ...prev, [k]: v }))}
      onSave={handleSave}
      onTestOmdb={makeTest('omdb')}
      onTestTmdb={makeTest('tmdb')}
      onTestGemini={makeTest('googleAi')}
      onTestRealDebrid={makeTest('realDebrid')}
    />
  );
}

// ── Discover wrapper ──────────────────────────────────────────────────────────
export function SettingsDiscoverWrapper() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/tmdb/refresh', { method: 'POST', credentials: 'include' });
      setLastRefreshed(new Date().toISOString());
      setStale(false);
      toast.success('TMDB cache refreshed');
    } catch { toast.error('Refresh failed'); }
    finally { setRefreshing(false); }
  };

  return (
    <SettingsDiscover
      tmdbRefreshing={refreshing}
      tmdbLastRefreshed={lastRefreshed}
      tmdbStale={stale}
      onRefresh={handleRefresh}
    />
  );
}

// ── ParentalControls wrapper ──────────────────────────────────────────────────
export function SettingsParentalControlsWrapper() {
  const openConfirm = useConfirm();
  const [pinMode, setPinMode] = useState<'idle' | 'set' | 'change' | 'confirm'>('idle');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  return (
    <SettingsParentalControls
      onClose={() => {}}
      onOpenConfirm={openConfirm}
      pinMode={pinMode}
      pinInput={pinInput}
      pinConfirm={pinConfirm}
      pinError={pinError}
      onSetPinMode={setPinMode}
      onSetPinInput={setPinInput}
      onSetPinConfirm={setPinConfirm}
      onSetPinError={setPinError}
    />
  );
}

// ── Session wrapper ───────────────────────────────────────────────────────────
export function SettingsSessionWrapper() {
  const openConfirm = useConfirm();
  return <SettingsSession onOpenConfirm={openConfirm} />;
}

// ── Storage wrapper ───────────────────────────────────────────────────────────
export function SettingsStorageWrapper() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ added: number; skipped: number } | null>(null);
  const [allocMovies, setAllocMovies] = useState(50);
  const [allocTv, setAllocTv] = useState(50);
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocSaved, setAllocSaved] = useState(false);

  useEffect(() => {
    fetch('/api/library/storage', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: StorageStats | null) => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const r = await fetch('/api/library/scan', { method: 'POST', credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { added: number; skipped: number };
        setScanResult(d);
      }
    } catch { toast.error('Scan failed'); }
    finally { setScanning(false); }
  };

  const handleSaveAlloc = async () => {
    setAllocSaving(true);
    try {
      await fetch('/api/library/storage', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocMovies, allocTv }),
      });
      setAllocSaved(true);
      setTimeout(() => setAllocSaved(false), 3000);
    } catch { toast.error('Failed to save'); }
    finally { setAllocSaving(false); }
  };

  return (
    <SettingsStorage
      storageStats={stats}
      storageLoading={loading}
      scanning={scanning}
      scanResult={scanResult}
      allocMovies={allocMovies}
      allocTv={allocTv}
      allocSaving={allocSaving}
      allocSaved={allocSaved}
      onScanLibrary={handleScan}
      onSetAllocMovies={setAllocMovies}
      onSetAllocTv={setAllocTv}
      onSaveAllocation={handleSaveAlloc}
    />
  );
}

// ── Tools wrapper ─────────────────────────────────────────────────────────────
export function SettingsToolsWrapper({ onOpenDebug }: { onOpenDebug?: () => void }) {
  const [healthStatus, setHealthStatus] = useState<'ok' | 'warn' | 'error' | null>(null);

  const clearHealth = () => setHealthStatus(null);

  return (
    <SettingsTools
      onClose={() => {}}
      onOpenDebug={onOpenDebug}
      onClearHealth={clearHealth}
      healthStatus={healthStatus}
    />
  );
}

// ── VPN wrapper ───────────────────────────────────────────────────────────────
export function SettingsVpnWrapper() {
  const [interfaces, setInterfaces] = useState<VpnInterface[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [bindState, setBindState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [bindMsg, setBindMsg] = useState('');

  useEffect(() => {
    fetch('/api/vpn/interfaces', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { interfaces: VpnInterface[]; current: string | null } | null) => {
        if (d) { setInterfaces(d.interfaces); setCurrent(d.current); setSelected(d.current ?? ''); }
      })
      .catch(() => {});
  }, []);

  const handleBind = async () => {
    setBindState('saving');
    try {
      const r = await fetch('/api/vpn/bind', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selected }),
      });
      if (r.ok) { setBindState('ok'); setCurrent(selected); setBindMsg('Bound successfully'); }
      else { setBindState('error'); setBindMsg('Failed to bind'); }
    } catch { setBindState('error'); setBindMsg('Network error'); }
  };

  return (
    <SettingsVpn
      vpnInterfaces={interfaces}
      vpnCurrentInterface={current}
      vpnSelectedInterface={selected}
      vpnBindState={bindState}
      vpnBindMsg={bindMsg}
      onSelectInterface={setSelected}
      onBind={handleBind}
    />
  );
}
