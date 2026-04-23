/**
 * SettingsPanel — cog-wheel dropdown in the header.
 *
 * This file is the orchestrator: it owns all state and data-fetching, then
 * passes props down to the per-section components in ./settings/.
 *
 * Sections (in render order):
 *  1. Appearance        — SettingsAppearance
 *  2. Playback          — SettingsPlayback
 *  3. Library           — SettingsLibrary
 *  4. Discover          — SettingsDiscover
 *  5. Storage & Library — SettingsStorage
 *  6. Parental Controls — SettingsParentalControls
 *  7. API Keys          — SettingsApiKeys
 *  8. Backup & Restore  — SettingsBackup
 *  9. VPN Kill-Switch   — SettingsVpn
 * 10. Tools             — SettingsTools
 * 11. Session           — SettingsSession
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/context/ThemeContext';

import { ConfirmDialog, type ConfirmDialogState } from './settings/shared';
import SettingsAppearance       from './settings/SettingsAppearance';
import SettingsPlayback         from './settings/SettingsPlayback';
import SettingsLibrary          from './settings/SettingsLibrary';
import SettingsDiscover         from './settings/SettingsDiscover';
import SettingsStorage, { type StorageStats } from './settings/SettingsStorage';
import SettingsParentalControls from './settings/SettingsParentalControls';
import SettingsApiKeys, { type ApiKeysState, type ApiKeysSavedState } from './settings/SettingsApiKeys';
import SettingsBackup           from './settings/SettingsBackup';
import SettingsVpn, { type VpnInterface } from './settings/SettingsVpn';
import SettingsTools            from './settings/SettingsTools';
import SettingsSession          from './settings/SettingsSession';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  onOpenSecurity?: () => void;
  onOpenDebug?: () => void;
  /** When true, the panel opens programmatically (e.g. back-from-Security) */
  forceOpen?: boolean;
  /** Called when the panel closes itself (so parent can clear forceOpen) */
  onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPanel({
  onOpenSecurity, onOpenDebug, forceOpen, onClose,
}: SettingsPanelProps) {
  const { activeTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Allow parent to open the panel programmatically
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        onClose?.();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  // ── Confirm dialog ──────────────────────────────────────────────────────────

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false, title: '', message: '', confirmLabel: '', onConfirm: () => {},
  });

  const openConfirm = useCallback((state: Omit<ConfirmDialogState, 'open'>) => {
    setConfirmDialog({ open: true, ...state });
  }, []);

  // ── PIN state (passed to SettingsParentalControls) ──────────────────────────

  const [pinMode, setPinMode]     = useState<'idle' | 'set' | 'change' | 'confirm'>('idle');
  const [pinInput, setPinInput]   = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError]   = useState<string | null>(null);

  // ── TMDB refresh state ──────────────────────────────────────────────────────

  const [tmdbRefreshing, setTmdbRefreshing] = useState(false);
  const [tmdbLastRefreshed, setTmdbLastRefreshed] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem('homestream-tmdb-session');
      if (!raw) return null;
      const data = JSON.parse(raw) as { fetchedAt?: number };
      return data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null;
    } catch { return null; }
  });
  const [tmdbStale, setTmdbStale] = useState(false);

  const handleTmdbRefresh = useCallback(async () => {
    setTmdbRefreshing(true);
    try {
      const res = await fetch('/api/tmdb?refresh=1');
      if (res.ok) {
        const data = await res.json() as { fetchedAt?: number; stale?: boolean };
        const existing = (() => {
          try { return JSON.parse(sessionStorage.getItem('homestream-tmdb-session') || '{}'); }
          catch { return {}; }
        })();
        sessionStorage.setItem('homestream-tmdb-session', JSON.stringify({ ...existing, ...data }));
        setTmdbLastRefreshed(data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null);
        setTmdbStale(data.stale ?? false);
      }
    } catch {
      setTmdbStale(true);
    } finally {
      setTmdbRefreshing(false);
    }
  }, []);

  // ── API Keys state ──────────────────────────────────────────────────────────

  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    omdbApiKey: '', googleAiApiKey: '', tmdbApiKey: '',
  });
  const [apiKeysSaving, setApiKeysSaving]   = useState(false);
  const [apiKeysSaved, setApiKeysSaved]     = useState(false);
  const [apiKeysLoaded, setApiKeysLoaded]   = useState(false);
  const [apiKeysSavedState, setApiKeysSavedState] = useState<ApiKeysSavedState>({
    omdb: false, googleAi: false, tmdb: false,
  });

  useEffect(() => {
    if (!open || apiKeysLoaded) return;
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { config?: { omdbApiKey?: string; googleAiApiKey?: string; tmdbApiKey?: string } }) => {
        if (data.config) {
          setApiKeys({ omdbApiKey: '', googleAiApiKey: '', tmdbApiKey: '' });
          setApiKeysSavedState({
            omdb: !!data.config.omdbApiKey,
            googleAi: !!data.config.googleAiApiKey,
            tmdb: !!data.config.tmdbApiKey,
          });
          setApiKeysLoaded(true);
        }
      })
      .catch(() => setApiKeysLoaded(true));
  }, [open, apiKeysLoaded]);

  const handleChangeKey = useCallback((key: keyof ApiKeysState, value: string) => {
    setApiKeys(k => ({ ...k, [key]: value }));
  }, []);

  const saveApiKeys = useCallback(async () => {
    setApiKeysSaving(true);
    setApiKeysSaved(false);
    try {
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...apiKeys }),
      });
      setApiKeysSaved(true);
      setTimeout(() => setApiKeysSaved(false), 3000);
    } catch { /* ignore */ } finally {
      setApiKeysSaving(false);
    }
  }, [apiKeys]);

  const testOmdb = useCallback(async () => {
    const res = await fetch(`https://www.omdbapi.com/?t=Inception&apikey=${apiKeys.omdbApiKey}`);
    const data = await res.json() as { Response?: string; Error?: string; Title?: string };
    if (data.Response === 'True') return { ok: true, message: `Connected — found "${data.Title}"` };
    return { ok: false, message: data.Error ?? 'Invalid key' };
  }, [apiKeys.omdbApiKey]);

  const testTmdb = useCallback(async () => {
    const key = apiKeys.tmdbApiKey.trim();
    const isToken = key.startsWith('eyJ');
    const url = isToken
      ? 'https://api.themoviedb.org/3/configuration'
      : `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`;
    const headers: Record<string, string> = isToken ? { Authorization: `Bearer ${key}` } : {};
    const res = await fetch(url, { headers });
    if (res.ok) return { ok: true, message: 'Connected to TMDB' };
    if (res.status === 401) return { ok: false, message: 'Invalid API key (401)' };
    return { ok: false, message: `HTTP ${res.status}` };
  }, [apiKeys.tmdbApiKey]);

  const testGemini = useCallback(async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeys.googleAiApiKey}`,
    );
    if (res.ok) return { ok: true, message: 'Gemini API key valid' };
    if (res.status === 400 || res.status === 403) return { ok: false, message: 'Invalid API key' };
    return { ok: false, message: `HTTP ${res.status}` };
  }, [apiKeys.googleAiApiKey]);

  // ── Storage state ───────────────────────────────────────────────────────────

  const [storageStats, setStorageStats]     = useState<StorageStats | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [scanResult, setScanResult]         = useState<{ added: number; skipped: number } | null>(null);
  const [allocMovies, setAllocMovies]       = useState(60);
  const [allocTv, setAllocTv]               = useState(30);
  const [allocSaving, setAllocSaving]       = useState(false);
  const [allocSaved, setAllocSaved]         = useState(false);

  useEffect(() => {
    if (!open || storageStats) return;
    setStorageLoading(true);
    fetch('/api/library/storage')
      .then(r => r.json())
      .then((data: StorageStats & { storageAllocation?: { moviesPct: number; tvPct: number } }) => {
        setStorageStats(data);
        if (data.storageAllocation) {
          setAllocMovies(data.storageAllocation.moviesPct);
          setAllocTv(data.storageAllocation.tvPct);
        }
      })
      .catch(() => {})
      .finally(() => setStorageLoading(false));
  }, [open, storageStats]);

  const handleScanLibrary = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/library/scan', { method: 'POST' });
      const data = await res.json() as { added: number; skipped: number; errors?: string[] };
      setScanResult({ added: data.added, skipped: data.skipped });
      if (data.added > 0) {
        toast.success(`Found ${data.added} new file${data.added !== 1 ? 's' : ''} — added to library`);
        setStorageStats(null); // force re-fetch
      } else {
        toast.info('Library is up to date — no new files found');
      }
    } catch {
      toast.error('Scan failed — check server logs');
    } finally {
      setScanning(false);
    }
  }, []);

  const saveAllocation = useCallback(async () => {
    setAllocSaving(true);
    setAllocSaved(false);
    try {
      const res = await fetch('/api/library/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moviesPct: allocMovies, tvPct: allocTv }),
      });
      if (!res.ok) throw new Error('Save failed');
      setAllocSaved(true);
      setTimeout(() => setAllocSaved(false), 3000);
      toast.success('Storage allocation saved');
    } catch {
      toast.error('Failed to save allocation');
    } finally {
      setAllocSaving(false);
    }
  }, [allocMovies, allocTv]);

  // ── Health badge ────────────────────────────────────────────────────────────

  const [healthStatus, setHealthStatus] = useState<'ok' | 'warn' | 'error' | null>(null);

  useEffect(() => {
    if (!open || healthStatus !== null) return;
    fetch('/api/health/full')
      .then(r => r.json())
      .then((data: { overall?: 'ok' | 'warn' | 'error' }) => {
        setHealthStatus(data.overall ?? null);
      })
      .catch(() => {});
  }, [open, healthStatus]);

  // ── VPN state ───────────────────────────────────────────────────────────────

  const [vpnInterfaces, setVpnInterfaces]           = useState<VpnInterface[]>([]);
  const [vpnCurrentInterface, setVpnCurrentInterface] = useState<string | null>(null);
  const [vpnSelectedInterface, setVpnSelectedInterface] = useState<string>('');
  const [vpnBindState, setVpnBindState]             = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [vpnBindMsg, setVpnBindMsg]                 = useState('');
  const [vpnLoaded, setVpnLoaded]                   = useState(false);

  useEffect(() => {
    if (!open || vpnLoaded) return;
    setVpnLoaded(true);
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { vpnInterface?: string | null }) => {
        const current = data.vpnInterface ?? null;
        setVpnCurrentInterface(current);
        setVpnSelectedInterface(current ?? '');
      })
      .catch(() => {});
    fetch('/api/vpn/interfaces')
      .then(r => r.json())
      .then((data: { interfaces: VpnInterface[] }) => {
        setVpnInterfaces((data.interfaces ?? []).filter(i => !i.internal && i.family === 'IPv4'));
      })
      .catch(() => {});
  }, [open, vpnLoaded]);

  const handleVpnSelectInterface = useCallback((name: string) => {
    setVpnSelectedInterface(name);
    setVpnBindState('idle');
    setVpnBindMsg('');
  }, []);

  const handleVpnBind = useCallback(async () => {
    setVpnBindState('saving');
    setVpnBindMsg('');
    try {
      const res = await fetch('/api/vpn/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: vpnSelectedInterface || null }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setVpnBindState(data.ok ? 'ok' : 'error');
      setVpnBindMsg(data.message);
      if (data.ok) {
        setVpnCurrentInterface(vpnSelectedInterface || null);
        toast.success(vpnSelectedInterface ? 'VPN kill-switch enabled' : 'VPN binding cleared');
      }
    } catch {
      setVpnBindState('error');
      setVpnBindMsg('Could not reach server');
    }
  }, [vpnSelectedInterface]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Confirm dialog — rendered outside the panel so it's not clipped */}
      <AnimatePresence>
        {confirmDialog.open && (
          <ConfirmDialog
            {...confirmDialog}
            onConfirm={() => {
              confirmDialog.onConfirm();
              setConfirmDialog(d => ({ ...d, open: false }));
            }}
            onCancel={() => setConfirmDialog(d => ({ ...d, open: false }))}
          />
        )}
      </AnimatePresence>

      <div ref={panelRef} className="relative">
        {/* Cog button */}
        <button
          onClick={() => setOpen(prev => !prev)}
          title="Settings"
          className={`p-2 rounded-lg transition-colors ${
            open
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-card'
          }`}
        >
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Settings className="w-5 h-5" />
          </motion.div>
        </button>

        {/* Panel */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Settings</span>
                </div>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    borderColor: `hsl(${activeTheme.vars['--primary']})`,
                    color: `hsl(${activeTheme.vars['--primary']})`,
                    background: `hsl(${activeTheme.vars['--primary']} / 0.1)`,
                  }}
                >
                  {activeTheme.name}
                </span>
              </div>

              <div className="max-h-[calc(100vh-120px)] overflow-y-auto">
                <SettingsAppearance />
                <SettingsPlayback />
                <SettingsLibrary />
                <SettingsDiscover
                  tmdbRefreshing={tmdbRefreshing}
                  tmdbLastRefreshed={tmdbLastRefreshed}
                  tmdbStale={tmdbStale}
                  onRefresh={handleTmdbRefresh}
                />
                <SettingsStorage
                  storageStats={storageStats}
                  storageLoading={storageLoading}
                  scanning={scanning}
                  scanResult={scanResult}
                  allocMovies={allocMovies}
                  allocTv={allocTv}
                  allocSaving={allocSaving}
                  allocSaved={allocSaved}
                  onScanLibrary={handleScanLibrary}
                  onSetAllocMovies={setAllocMovies}
                  onSetAllocTv={setAllocTv}
                  onSaveAllocation={saveAllocation}
                />
                <SettingsParentalControls
                  onClose={handleClose}
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
                <SettingsApiKeys
                  apiKeys={apiKeys}
                  apiKeysSavedState={apiKeysSavedState}
                  apiKeysSaving={apiKeysSaving}
                  apiKeysSaved={apiKeysSaved}
                  onChangeKey={handleChangeKey}
                  onSave={saveApiKeys}
                  onTestOmdb={testOmdb}
                  onTestTmdb={testTmdb}
                  onTestGemini={testGemini}
                />
                <SettingsBackup />
                <SettingsVpn
                  vpnInterfaces={vpnInterfaces}
                  vpnCurrentInterface={vpnCurrentInterface}
                  vpnSelectedInterface={vpnSelectedInterface}
                  vpnBindState={vpnBindState}
                  vpnBindMsg={vpnBindMsg}
                  onSelectInterface={handleVpnSelectInterface}
                  onBind={handleVpnBind}
                />
                <SettingsTools
                  onClose={handleClose}
                  onOpenSecurity={onOpenSecurity}
                  onOpenDebug={onOpenDebug}
                  onClearHealth={() => setHealthStatus(null)}
                  healthStatus={healthStatus}
                />
                <SettingsSession onOpenConfirm={openConfirm} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
