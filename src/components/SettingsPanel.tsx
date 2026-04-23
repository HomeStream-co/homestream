/**
 * SettingsPanel — cog-wheel dropdown in the header.
 *
 * Sections:
 *  1. Appearance  — theme picker + player color sync
 *  2. Playback    — autoplay, resume, skip intro, quality, volume, subtitles
 *  3. Library     — storage badges, enrichment tags
 *  4. Discover    — TMDB cache refresh
 *  5. Storage & Library — disk stats, scan
 *  6. Parental Controls
 *  7. API Keys
 *  8. Backup & Restore
 *  9. Tools       — Security Center, HTTPS Setup, Setup Wizard, Debug Panel (always visible)
 * 10. Session     — sign out
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, Check, Palette, Play, Library,
  Monitor, Zap, SkipForward, RotateCcw, Tag, HardDrive,
  Compass, RefreshCw, Clock, WifiOff, KeyRound, Eye, EyeOff,
  Loader2, CheckCircle2, XCircle, ScanLine, Database, ShieldCheck, LogOut, Wrench, Lock, ShieldAlert,
  Volume2, Subtitles, Wand2, AlertTriangle, X, Film, Tv2, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme, THEMES, type AppSettings } from '@/context/ThemeContext';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';

// ── Format bytes helper ───────────────────────────────────────────────────────
function fmtBytes(bytes: number): string {
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824)     return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)         return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ── Small reusable toggle ─────────────────────────────────────────────────────
function Toggle({
  checked, onChange, label, description, icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ElementType;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0 group-hover:text-foreground transition-colors" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-tight">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, variant = 'destructive',
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'destructive' | 'warning';
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${variant === 'destructive' ? 'bg-destructive/15' : 'bg-yellow-500/15'}`}>
            <AlertTriangle className={`w-5 h-5 ${variant === 'destructive' ? 'text-destructive' : 'text-yellow-400'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{message}</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              variant === 'destructive'
                ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive border border-destructive/30'
                : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Backup restore button ─────────────────────────────────────────────────────
function BackupRestoreButton() {
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as { version?: number };
      if (backup.version !== 1) throw new Error('Unrecognised backup format (expected version 1)');
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup, options: { restoreLibrary: true, restoreProfiles: true, restoreConfig: false } }),
      });
      const data = await res.json() as { ok?: boolean; restored?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setRestoreResult((data.restored ?? []).join(' · ') || 'Restored successfully');
      toast.success('Backup restored — reload the page to see changes');
    } catch (err) {
      setRestoreResult(`Error: ${String(err)}`);
      toast.error('Restore failed — check the file and try again');
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={restoring}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-colors text-left group disabled:opacity-60"
      >
        <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors">
          {restoring ? <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" /> : <RotateCcw className="w-4 h-4 text-yellow-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{restoring ? 'Restoring…' : 'Restore from Backup'}</p>
          <p className="text-[11px] text-muted-foreground">Select a homestream-backup-*.json file</p>
        </div>
      </button>
      {restoreResult && (
        <p className={`text-[11px] mt-1.5 px-1 leading-snug ${restoreResult.startsWith('Error') ? 'text-destructive' : 'text-green-400'}`}>
          {restoreResult}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-1">
        API keys and passwords are never exported or restored — re-enter them after a restore.
      </p>
    </div>
  );
}

// ── API Key field ─────────────────────────────────────────────────────────────
type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

function ApiKeyField({
  label, description, value, onChange, onTest, placeholder, testLabel,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  onTest?: () => Promise<{ ok: boolean; message?: string }>;
  placeholder?: string;
  testLabel?: string;
}) {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  const handleTest = async () => {
    if (!onTest) return;
    setStatus('testing');
    setTestMsg('');
    try {
      const result = await onTest();
      setStatus(result.ok ? 'ok' : 'error');
      setTestMsg(result.message ?? (result.ok ? 'Connected' : 'Failed'));
    } catch (err) {
      setStatus('error');
      setTestMsg(String(err));
    }
  };

  return (
    <div className="py-2.5">
      <p className="text-sm text-foreground font-medium mb-0.5">{label}</p>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">{description}</p>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => { onChange(e.target.value); setDirty(true); setStatus('idle'); }}
            placeholder={placeholder ?? 'Enter API key…'}
            className="w-full pr-8 pl-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
          />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {onTest && (
          <button
            onClick={handleTest}
            disabled={!value.trim() || status === 'testing'}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-40 flex-shrink-0 bg-muted hover:bg-muted/80 border-border text-foreground"
          >
            {status === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
             status === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-400" /> :
             status === 'error' ? <XCircle className="w-3 h-3 text-destructive" /> : null}
            {testLabel ?? 'Test'}
          </button>
        )}
      </div>
      {testMsg && (
        <p className={`text-[10px] mt-1.5 ${status === 'ok' ? 'text-green-400' : 'text-destructive'}`}>
          {status === 'ok' ? '✓ ' : '✗ '}{testMsg}
        </p>
      )}
      {dirty && status === 'idle' && (
        <p className="text-[10px] text-yellow-400 mt-1">Unsaved — click Save below</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface SettingsPanelProps {
  onOpenSecurity?: () => void;
  onOpenDebug?: () => void;
  /** When true, the panel opens programmatically (e.g. back-from-Security) */
  forceOpen?: boolean;
  /** Called when the panel closes itself (so parent can clear forceOpen) */
  onClose?: () => void;
}

export default function SettingsPanel({ onOpenSecurity, onOpenDebug, forceOpen, onClose }: SettingsPanelProps) {
  const { settings, activeTheme, setTheme, updateSetting } = useTheme();
  const { profiles, setPin, clearPin, activeProfile } = useProfile();
  const adultProfile = profiles.find(p => p.id === 'adult');
  const adultPinEnabled = adultProfile?.hasPin ?? false;
  const { requiresPassword, logout, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Allow parent to open the panel programmatically (e.g. back from Security Center)
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // PIN management state
  const [pinMode, setPinMode] = useState<'idle' | 'set' | 'change' | 'confirm'>('idle');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    variant?: 'destructive' | 'warning';
  }>({ open: false, title: '', message: '', confirmLabel: '', onConfirm: () => {} });

  // TMDB refresh state
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

  // API Keys state
  const [apiKeys, setApiKeys] = useState({ omdbApiKey: '', googleAiApiKey: '', tmdbApiKey: '' });
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [apiKeysSaved, setApiKeysSaved] = useState(false);
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  // Tracks which keys are already saved on the server (from wizard)
  const [apiKeysSavedState, setApiKeysSavedState] = useState({ omdb: false, googleAi: false, tmdb: false });

  // Storage stats state
  const [storageStats, setStorageStats] = useState<{
    libraryBytes: number; libraryCount: number;
    diskFreeBytes: number | null; diskTotalBytes: number | null;
  } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // Scan library state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ added: number; skipped: number } | null>(null);

  // Storage allocation sliders
  const [allocMovies, setAllocMovies] = useState(60);
  const [allocTv, setAllocTv] = useState(30);
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocSaved, setAllocSaved] = useState(false);
  const allocOther = Math.max(0, 100 - allocMovies - allocTv);

  // Health badge for debug button
  const [healthStatus, setHealthStatus] = useState<'ok' | 'warn' | 'error' | null>(null);

  // VPN bind state (Settings panel quick-bind)
  const [vpnInterfaces, setVpnInterfaces] = useState<{ name: string; address: string; likelyVpn: boolean; internal: boolean; family: string }[]>([]);
  const [vpnCurrentInterface, setVpnCurrentInterface] = useState<string | null>(null);
  const [vpnSelectedInterface, setVpnSelectedInterface] = useState<string>('');
  const [vpnBindState, setVpnBindState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [vpnBindMsg, setVpnBindMsg] = useState('');
  const [vpnLoaded, setVpnLoaded] = useState(false);

  // Load current keys when panel opens
  useEffect(() => {
    if (!open || apiKeysLoaded) return;
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { config?: { omdbApiKey?: string; googleAiApiKey?: string; tmdbApiKey?: string } }) => {
        if (data.config) {
          // Server returns masked keys (e.g. "ab12••••••••") — treat as "key is set"
          // Show empty string so user can type a new key, but display a saved indicator
          setApiKeys({
            omdbApiKey: '',
            googleAiApiKey: '',
            tmdbApiKey: '',
          });
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

  // Load storage stats + allocation when panel opens
  useEffect(() => {
    if (!open || storageStats) return;
    setStorageLoading(true);
    fetch('/api/library/storage')
      .then(r => r.json())
      .then((data: {
        libraryBytes: number; libraryCount: number;
        diskFreeBytes: number | null; diskTotalBytes: number | null;
        storageAllocation?: { moviesPct: number; tvPct: number };
      }) => {
        setStorageStats(data);
        if (data.storageAllocation) {
          setAllocMovies(data.storageAllocation.moviesPct);
          setAllocTv(data.storageAllocation.tvPct);
        }
      })
      .catch(() => {})
      .finally(() => setStorageLoading(false));
  }, [open, storageStats]);

  // Fetch health badge when panel opens
  useEffect(() => {
    if (!open || healthStatus !== null) return;
    fetch('/api/health/full')
      .then(r => r.json())
      .then((data: { overall?: 'ok' | 'warn' | 'error' }) => {
        setHealthStatus(data.overall ?? null);
      })
      .catch(() => {});
  }, [open, healthStatus]);

  // Load VPN interfaces + current binding when panel opens
  useEffect(() => {
    if (!open || vpnLoaded) return;
    setVpnLoaded(true);
    // Load current binding from setup config
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { vpnInterface?: string | null }) => {
        const current = data.vpnInterface ?? null;
        setVpnCurrentInterface(current);
        setVpnSelectedInterface(current ?? '');
      })
      .catch(() => {});
    // Load available adapters
    fetch('/api/vpn/interfaces')
      .then(r => r.json())
      .then((data: { interfaces: { name: string; address: string; likelyVpn: boolean; internal: boolean; family: string }[] }) => {
        setVpnInterfaces((data.interfaces ?? []).filter(i => !i.internal && i.family === 'IPv4'));
      })
      .catch(() => {});
  }, [open, vpnLoaded]);

  const handleVpnBind = async () => {
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
  };

  const handleScanLibrary = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/library/scan', { method: 'POST' });
      const data = await res.json() as { added: number; skipped: number; errors?: string[] };
      setScanResult({ added: data.added, skipped: data.skipped });
      if (data.added > 0) {
        toast.success(`Found ${data.added} new file${data.added !== 1 ? 's' : ''} — added to library`);
        setStorageStats(null);
      } else {
        toast.info('Library is up to date — no new files found');
      }
    } catch {
      toast.error('Scan failed — check server logs');
    } finally {
      setScanning(false);
    }
  };

  const saveAllocation = async () => {
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
  };

  const saveApiKeys = async () => {
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
  };

  const testOmdb = async () => {
    const res = await fetch(`https://www.omdbapi.com/?t=Inception&apikey=${apiKeys.omdbApiKey}`);
    const data = await res.json() as { Response?: string; Error?: string; Title?: string };
    if (data.Response === 'True') return { ok: true, message: `Connected — found "${data.Title}"` };
    return { ok: false, message: data.Error ?? 'Invalid key' };
  };

  const testTmdb = async () => {
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
  };

  const testGemini = async () => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeys.googleAiApiKey}`);
    if (res.ok) return { ok: true, message: 'Gemini API key valid' };
    if (res.status === 400 || res.status === 403) return { ok: false, message: 'Invalid API key' };
    return { ok: false, message: `HTTP ${res.status}` };
  };

  const handleTmdbRefresh = async () => {
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
  };

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

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSetting(key, value);
  }

  const healthBadgeColor = healthStatus === 'ok' ? 'bg-green-500' : healthStatus === 'warn' ? 'bg-yellow-400' : healthStatus === 'error' ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <>
      {/* Confirm dialog — rendered outside the panel so it's not clipped */}
      <AnimatePresence>
        {confirmDialog.open && (
          <ConfirmDialog
            open={confirmDialog.open}
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            variant={confirmDialog.variant}
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
          className={`p-2 rounded-lg transition-colors ${open ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-card'}`}
        >
          <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
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

                {/* ── 1. Appearance ── */}
                <SectionHeader icon={Palette} label="Appearance" />
                <div className="px-4 pb-2">
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        title={theme.name}
                        className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                          settings.themeId === theme.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border/80 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex gap-0.5 rounded-full overflow-hidden w-8 h-4 flex-shrink-0">
                          <div className="flex-1" style={{ background: theme.swatch }} />
                          <div className="flex-1" style={{ background: theme.accentSwatch }} />
                        </div>
                        <span className="text-[10px] text-center leading-tight text-foreground font-medium line-clamp-2">{theme.name}</span>
                        {settings.themeId === theme.id && (
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <Toggle
                      checked={settings.syncPlayerColor}
                      onChange={v => set('syncPlayerColor', v)}
                      label="Sync player accent color"
                      description="Tints the video player controls to match the active theme"
                      icon={Monitor}
                    />
                  </div>
                </div>

                {/* ── 2. Playback ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={Play} label="Playback" />
                  <div className="px-4 pb-2 divide-y divide-border/30">
                    <Toggle
                      checked={settings.autoplayNext}
                      onChange={v => set('autoplayNext', v)}
                      label="Autoplay next"
                      description="Automatically play a recommendation after watching"
                      icon={Zap}
                    />
                    <Toggle
                      checked={settings.autoResume}
                      onChange={v => set('autoResume', v)}
                      label="Auto-resume"
                      description="Pick up where you left off when reopening a title"
                      icon={RotateCcw}
                    />
                    <Toggle
                      checked={settings.autoSkipIntro}
                      onChange={v => set('autoSkipIntro', v)}
                      label="Auto-skip intro"
                      description="Skip the intro automatically when the button appears"
                      icon={SkipForward}
                    />

                    {/* Default quality */}
                    <div className="flex items-center gap-3 py-2">
                      <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-tight">Default quality</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Preferred resolution hint for playback</p>
                      </div>
                      <select
                        value={settings.defaultQuality}
                        onChange={e => set('defaultQuality', e.target.value as AppSettings['defaultQuality'])}
                        className="text-xs bg-muted border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="auto">Auto</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                    </div>

                    {/* Default volume */}
                    <div className="flex items-center gap-3 py-2">
                      <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-tight">Default volume</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Starting volume when a video opens</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={settings.defaultVolume}
                          onChange={e => set('defaultVolume', Number(e.target.value))}
                          className="w-20 accent-primary cursor-pointer"
                        />
                        <span className="text-xs text-foreground font-mono w-8 text-right">{settings.defaultVolume}%</span>
                      </div>
                    </div>

                    {/* Subtitle language */}
                    <div className="flex items-center gap-3 py-2">
                      <Subtitles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-tight">Subtitle language</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Auto-select subtitles when available</p>
                      </div>
                      <select
                        value={settings.subtitleLanguage}
                        onChange={e => set('subtitleLanguage', e.target.value)}
                        className="text-xs bg-muted border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="off">Off</option>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="pt">Portuguese</option>
                        <option value="it">Italian</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                        <option value="ar">Arabic</option>
                        <option value="ru">Russian</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── 3. Library ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={Library} label="Library" />
                  <div className="px-4 pb-3 divide-y divide-border/30">
                    <Toggle
                      checked={settings.showStorageBadges}
                      onChange={v => set('showStorageBadges', v)}
                      label="Storage savings badges"
                      description="Show how much disk space was saved after transcoding"
                      icon={HardDrive}
                    />
                    <Toggle
                      checked={settings.showEnrichmentTags}
                      onChange={v => set('showEnrichmentTags', v)}
                      label="AI enrichment tags"
                      description="Show mood and genre tags on media cards"
                      icon={Tag}
                    />
                  </div>
                </div>

                {/* ── 4. Discover / TMDB ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={Compass} label="Discover" />
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Movie data is cached for 30 days to keep things fast. Refresh to pull the latest new releases and trending titles right now.
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      {tmdbLastRefreshed ? `Last updated: ${tmdbLastRefreshed}` : 'Not yet fetched — will load on first visit to Discover'}
                      {tmdbStale && (
                        <span className="flex items-center gap-1 text-orange-400 ml-1">
                          <WifiOff className="w-2.5 h-2.5" /> Stale
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleTmdbRefresh}
                      disabled={tmdbRefreshing}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${tmdbRefreshing ? 'animate-spin' : ''}`} />
                      {tmdbRefreshing ? 'Refreshing…' : 'Refresh New Releases Now'}
                    </button>
                  </div>
                </div>

                {/* ── 5. Storage & Library ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={Database} label="Storage & Library" />
                  <div className="px-4 pb-4 space-y-3">
                    {storageLoading ? (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading storage info…
                      </div>
                    ) : storageStats ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <HardDrive className="w-3 h-3" /> Library ({storageStats.libraryCount} items)
                          </span>
                          <span className="text-foreground font-medium">{fmtBytes(storageStats.libraryBytes)}</span>
                        </div>
                        {storageStats.diskTotalBytes && storageStats.diskFreeBytes !== null && (
                          <>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Disk free</span>
                              <span className={`font-medium ${
                                storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 ? 'text-destructive' :
                                storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.2 ? 'text-orange-400' : 'text-foreground'
                              }`}>
                                {fmtBytes(storageStats.diskFreeBytes)} / {fmtBytes(storageStats.diskTotalBytes)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 ? 'bg-destructive' :
                                  storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.2 ? 'bg-orange-400' : 'bg-primary'
                                }`}
                                style={{ width: `${Math.round(((storageStats.diskTotalBytes - storageStats.diskFreeBytes) / storageStats.diskTotalBytes) * 100)}%` }}
                              />
                            </div>
                            {/* Low disk warning */}
                            {storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 && (
                              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-destructive leading-snug">
                                  Disk is nearly full. Downloads and transcoding may fail. Free up space soon.
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Storage info unavailable</p>
                    )}

                    <div className="space-y-1.5">
                      <button
                        onClick={handleScanLibrary}
                        disabled={scanning}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        <ScanLine className={`w-3.5 h-3.5 ${scanning ? 'animate-pulse' : ''}`} />
                        {scanning ? 'Scanning media folder…' : 'Scan Library for New Files'}
                      </button>
                      {scanResult && (
                        <p className="text-[10px] text-center text-muted-foreground">
                          {scanResult.added > 0
                            ? `✓ Added ${scanResult.added} new file${scanResult.added !== 1 ? 's' : ''} · ${scanResult.skipped} already in library`
                            : `✓ Up to date · ${scanResult.skipped} file${scanResult.skipped !== 1 ? 's' : ''} already in library`}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground text-center">Finds video files in your media folder not yet in the library</p>
                    </div>

                    {/* Storage allocation sliders */}
                    <div className="border-t border-border/40 pt-3 space-y-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Storage Allocation Targets</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Set how much of your disk you want reserved for each content type. These are soft targets — HomeStream uses them to warn you when a category is over-allocated.
                      </p>

                      {/* Movies slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-foreground flex items-center gap-1.5">
                            <Film className="w-3 h-3 text-blue-400" /> Movies
                          </span>
                          <span className="font-mono font-semibold text-foreground">{allocMovies}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} step={5}
                          value={allocMovies}
                          onChange={e => {
                            const v = Number(e.target.value);
                            setAllocMovies(v);
                            if (v + allocTv > 100) setAllocTv(100 - v);
                          }}
                          className="w-full accent-blue-400 cursor-pointer"
                        />
                      </div>

                      {/* TV slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-foreground flex items-center gap-1.5">
                            <Tv2 className="w-3 h-3 text-purple-400" /> TV Shows
                          </span>
                          <span className="font-mono font-semibold text-foreground">{allocTv}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} step={5}
                          value={allocTv}
                          onChange={e => {
                            const v = Number(e.target.value);
                            setAllocTv(v);
                            if (allocMovies + v > 100) setAllocMovies(100 - v);
                          }}
                          className="w-full accent-purple-400 cursor-pointer"
                        />
                      </div>

                      {/* Other (read-only remainder) */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Layers className="w-3 h-3" /> Other (remainder)
                        </span>
                        <span className="font-mono text-muted-foreground">{allocOther}%</span>
                      </div>

                      {/* Visual bar */}
                      <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
                        <div className="bg-blue-400 rounded-l-full transition-all" style={{ width: `${allocMovies}%` }} />
                        <div className="bg-purple-400 transition-all" style={{ width: `${allocTv}%` }} />
                        <div className="bg-muted flex-1 rounded-r-full" />
                      </div>

                      <button
                        onClick={saveAllocation}
                        disabled={allocSaving}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          allocSaved
                            ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                            : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
                        } disabled:opacity-60`}
                      >
                        {allocSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         allocSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                         <HardDrive className="w-3.5 h-3.5" />}
                        {allocSaving ? 'Saving…' : allocSaved ? 'Saved!' : 'Save Allocation'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── 6. Parental Controls ── */}
                {/* Only show to adult (non-restricted) profiles */}
                {!activeProfile?.restricted && (
                <div className="border-t border-border/50">
                  <SectionHeader icon={ShieldCheck} label="Parental Controls" />
                  <div className="px-4 pb-4 space-y-4">
                    <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> How parental controls work
                      </p>
                      <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
                        <li><span className="text-foreground font-medium">Kids Mode</span> — restricts a profile to G, PG, TV-Y, TV-Y7, TV-G and TV-PG rated content only.</li>
                        <li><span className="text-foreground font-medium">PIN on a kids profile</span> — lets a parent temporarily unlock restricted content (30-min session).</li>
                        <li><span className="text-foreground font-medium">PIN on your adult profile</span> — prevents kids from switching to your profile.</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">All profiles</p>
                      {profiles.map(p => (
                        <div key={p.id} className="flex items-center gap-3 bg-background rounded-xl px-3 py-2.5 border border-border">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">{p.avatar}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {p.restricted ? (
                                <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Kids Mode ON
                                </span>
                              ) : (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Adult profile</span>
                              )}
                              {p.hasPin ? (
                                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> PIN set
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded-full border border-border/40">No PIN</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => { setOpen(false); navigate('/profiles'); }} className="text-[11px] text-primary hover:underline flex-shrink-0">Edit</button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => { setOpen(false); navigate('/profiles'); }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm font-medium text-foreground"
                    >
                      <ShieldCheck className="w-4 h-4 text-yellow-400" />
                      Manage Profiles &amp; Parental Controls
                    </button>

                    <div className="border-t border-border/40 pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">Adult profile PIN</p>
                      <p className="text-[11px] text-muted-foreground mb-3">
                        Require a PIN to switch to the Adult profile from the "Who's watching?" screen.
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground">
                          PIN lock: <span className={adultPinEnabled ? 'text-green-400' : 'text-muted-foreground'}>
                            {adultPinEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </span>
                        {adultPinEnabled ? (
                          <div className="flex gap-2">
                            <button onClick={() => { setPinMode('change'); setPinInput(''); setPinConfirm(''); setPinError(null); }} className="text-[11px] text-primary hover:text-primary/80 transition-colors">Change PIN</button>
                            <button
                              onClick={() => setConfirmDialog({
                                open: true,
                                title: 'Remove Adult PIN?',
                                message: 'This will allow anyone to switch to the Adult profile without a PIN.',
                                confirmLabel: 'Remove PIN',
                                variant: 'warning',
                                onConfirm: async () => {
                                  try {
                                    await clearPin('adult', '');
                                    setPinMode('idle');
                                    toast.success('Adult PIN removed');
                                  } catch {
                                    toast.error('Enter current PIN on the Profiles page to remove it');
                                  }
                                },
                              })}
                              className="text-[11px] text-destructive hover:text-destructive/80 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setPinMode('set'); setPinInput(''); setPinConfirm(''); setPinError(null); }} className="text-[11px] text-primary hover:text-primary/80 transition-colors">Set PIN</button>
                        )}
                      </div>

                      {(pinMode === 'set' || pinMode === 'change') && (
                        <div className="space-y-2 pt-1">
                          <input
                            type="password" inputMode="numeric" maxLength={4} value={pinInput}
                            onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) { setPinInput(e.target.value); setPinError(null); } }}
                            placeholder="New PIN (4 digits)"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest text-center"
                          />
                          <input
                            type="password" inputMode="numeric" maxLength={4} value={pinConfirm}
                            onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) { setPinConfirm(e.target.value); setPinError(null); } }}
                            placeholder="Confirm PIN"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 tracking-widest text-center"
                          />
                          {pinError && <p className="text-[11px] text-destructive text-center">{pinError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (pinInput.length < 4) { setPinError('PIN must be 4 digits'); return; }
                                if (pinInput !== pinConfirm) { setPinError('PINs do not match'); return; }
                                void setPin('adult', pinInput).then(() => {
                                  setPinMode('idle'); setPinInput(''); setPinConfirm('');
                                  toast.success('Adult PIN saved');
                                }).catch(err => setPinError(String(err)));
                              }}
                              className="flex-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold py-2 rounded-lg transition-colors"
                            >
                              Save PIN
                            </button>
                            <button
                              onClick={() => { setPinMode('idle'); setPinInput(''); setPinConfirm(''); setPinError(null); }}
                              className="flex-1 bg-muted hover:bg-muted/70 text-muted-foreground text-xs font-semibold py-2 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )} {/* end !activeProfile?.restricted */}

                {/* ── 7. API Keys ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={KeyRound} label="API Keys" />
                  <div className="px-4 pb-4 divide-y divide-border/30">
                    {apiKeysSavedState.omdb && !apiKeys.omdbApiKey && (
                      <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
                        <CheckCircle2 className="w-3 h-3" /> OMDB key saved — enter a new value to replace it
                      </div>
                    )}
                    <ApiKeyField
                      label="OMDB"
                      description="Movie metadata (posters, ratings, plot). Get free key at omdbapi.com"
                      value={apiKeys.omdbApiKey}
                      onChange={v => setApiKeys(k => ({ ...k, omdbApiKey: v }))}
                      onTest={testOmdb}
                      placeholder={apiKeysSavedState.omdb ? '(key saved — enter new to replace)' : 'e.g. a1b2c3d4'}
                    />
                    {apiKeysSavedState.tmdb && !apiKeys.tmdbApiKey && (
                      <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
                        <CheckCircle2 className="w-3 h-3" /> TMDB key saved — enter a new value to replace it
                      </div>
                    )}
                    <ApiKeyField
                      label="TMDB"
                      description="Discover page, trending movies & TV. Get key at themoviedb.org"
                      value={apiKeys.tmdbApiKey}
                      onChange={v => setApiKeys(k => ({ ...k, tmdbApiKey: v }))}
                      onTest={testTmdb}
                      placeholder={apiKeysSavedState.tmdb ? '(key saved — enter new to replace)' : 'v3 API key or Bearer token'}
                    />
                    {apiKeysSavedState.googleAi && !apiKeys.googleAiApiKey && (
                      <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
                        <CheckCircle2 className="w-3 h-3" /> Google AI key saved — enter a new value to replace it
                      </div>
                    )}
                    <ApiKeyField
                      label="Google Gemini"
                      description="AI enrichment & chat assistant. Get key at aistudio.google.com"
                      value={apiKeys.googleAiApiKey}
                      onChange={v => setApiKeys(k => ({ ...k, googleAiApiKey: v }))}
                      onTest={testGemini}
                      placeholder={apiKeysSavedState.googleAi ? '(key saved — enter new to replace)' : 'AIza…'}
                    />
                    <div className="pt-3">
                      <button
                        onClick={saveApiKeys}
                        disabled={apiKeysSaving}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          apiKeysSaved
                            ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                            : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
                        } disabled:opacity-60`}
                      >
                        {apiKeysSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         apiKeysSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                         <KeyRound className="w-3.5 h-3.5" />}
                        {apiKeysSaving ? 'Saving…' : apiKeysSaved ? 'Saved!' : 'Save API Keys'}
                      </button>
                      <p className="text-[10px] text-muted-foreground text-center mt-2">
                        Keys are stored in homestream-config.json on your server
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── 8. Backup & Restore ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={Database} label="Backup & Restore" />
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Export your entire library, profiles, and settings to a single JSON file. Restore it on any HomeStream instance.
                      Passwords and API keys are never included.
                    </p>
                    <a
                      href="/api/backup"
                      download
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                      onClick={() => toast.success('Backup download started')}
                    >
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Database className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">Export Backup</p>
                        <p className="text-[11px] text-muted-foreground">Downloads homestream-backup-YYYY-MM-DD.json</p>
                      </div>
                    </a>
                    <BackupRestoreButton />
                  </div>
                </div>

                {/* ── 8.5. VPN Kill-Switch ── */}
                <div className="border-t border-border/50">
                  <SectionHeader icon={WifiOff} label="VPN Kill-Switch" />
                  <div className="px-4 pb-4 flex flex-col gap-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Lock downloads to your VPN adapter. If the VPN disconnects, all downloads pause automatically so your real IP is never exposed.
                    </p>

                    {/* Current binding status */}
                    {vpnCurrentInterface ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <p className="text-[11px] text-green-300">
                          Kill-switch active — bound to <span className="font-mono font-semibold">{vpnCurrentInterface}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
                        <WifiOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <p className="text-[11px] text-muted-foreground">No VPN binding — downloads use any available interface</p>
                      </div>
                    )}

                    {/* Adapter selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">VPN Adapter</label>
                      <select
                        value={vpnSelectedInterface}
                        onChange={e => { setVpnSelectedInterface(e.target.value); setVpnBindState('idle'); setVpnBindMsg(''); }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="">— Disable kill-switch —</option>
                        {vpnInterfaces.map(i => (
                          <option key={`${i.name}-${i.address}`} value={i.name}>
                            {i.likelyVpn ? '🔒 ' : ''}{i.name} ({i.address})
                          </option>
                        ))}
                      </select>
                      {vpnInterfaces.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">No adapters detected — connect your VPN first, then reopen Settings.</p>
                      )}
                    </div>

                    <button
                      onClick={handleVpnBind}
                      disabled={vpnBindState === 'saving' || vpnSelectedInterface === (vpnCurrentInterface ?? '')}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      {vpnBindState === 'saving'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                        : vpnBindState === 'ok'
                          ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Saved</>
                          : <><WifiOff className="w-3.5 h-3.5" />{vpnSelectedInterface ? 'Apply VPN Binding' : 'Clear VPN Binding'}</>
                      }
                    </button>

                    {vpnBindMsg && (
                      <p className={`text-[11px] ${vpnBindState === 'error' ? 'text-destructive' : 'text-green-400'}`}>
                        {vpnBindMsg}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── 9. Tools ── */}
                <div className="border-t border-border/50 px-4 py-3 flex flex-col gap-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Tools</p>

                  {/* Security Center */}
                  <button
                    onClick={() => { setOpen(false); onOpenSecurity?.(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
                      <ShieldCheck className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">Security Center</p>
                      <p className="text-[11px] text-muted-foreground">Quarantine, scan &amp; threat log</p>
                    </div>
                  </button>

                  {/* HTTPS Setup */}
                  <button
                    onClick={() => { setOpen(false); navigate('/https-setup'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                      <Lock className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">HTTPS Setup</p>
                      <p className="text-[11px] text-muted-foreground">Caddy, Let's Encrypt &amp; remote access</p>
                    </div>
                  </button>

                  {/* Samsung TV Setup */}
                  <button
                    onClick={() => { setOpen(false); navigate('/samsung-tv'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                      <Tv2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">Samsung TV Setup</p>
                      <p className="text-[11px] text-muted-foreground">Browser guide, bookmarks &amp; remote tips</p>
                    </div>
                  </button>

                  {/* Setup Wizard */}
                  <button
                    onClick={() => { setOpen(false); navigate('/setup'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                      <Wand2 className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">Setup Wizard</p>
                      <p className="text-[11px] text-muted-foreground">Re-run initial configuration &amp; VPN setup</p>
                    </div>
                  </button>

                  {/* Debug Panel — always visible, not DEV-only */}
                  {onOpenDebug && (
                    <button
                      onClick={() => { setOpen(false); setHealthStatus(null); onOpenDebug(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-colors text-left group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors relative">
                        <Wrench className="w-4 h-4 text-yellow-400" />
                        {/* Live health dot */}
                        {healthStatus && (
                          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${healthBadgeColor}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">Debug &amp; Diagnostics</p>
                        <p className="text-[11px] text-muted-foreground">
                          {healthStatus === 'error' ? 'Issues detected — tap to investigate' :
                           healthStatus === 'warn' ? 'Warnings detected — tap to review' :
                           healthStatus === 'ok' ? 'All systems healthy' :
                           'Health checks, quick fixes &amp; crash log'}
                        </p>
                      </div>
                      {healthStatus && healthStatus !== 'ok' && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${
                          healthStatus === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {healthStatus.toUpperCase()}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* ── 10. Session ── */}
                {requiresPassword && (
                  <div className="border-t border-border/50 px-4 py-4 flex flex-col gap-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Session</p>
                    <button
                      onClick={async () => {
                        await logout();
                        toast.info('Signed out');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent/10 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out This Device
                    </button>
                    <button
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Sign out all devices?',
                        message: 'Every active session will be invalidated immediately. You will need to log in again on all devices.',
                        confirmLabel: 'Sign Out All Devices',
                        variant: 'destructive',
                        onConfirm: async () => {
                          await logoutAll();
                          toast.warning('All sessions invalidated — please log in again');
                        },
                      })}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Sign Out All Devices
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center leading-snug">
                      "All devices" immediately invalidates every active session — useful if a session token is compromised.
                    </p>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
