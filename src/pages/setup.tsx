import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  HardDrive, Wifi, KeyRound, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, AlertCircle,
  FolderOpen, Eye, EyeOff, ExternalLink, Zap,
  Film, Tv2, Shield, RefreshCw, ScanSearch, PackageOpen,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepStatus {
  mediaDir: 'idle' | 'saving' | 'done' | 'error';
  qbit: 'idle' | 'testing' | 'ok' | 'error' | 'skip';
  jellyfin: 'idle' | 'testing' | 'ok' | 'error' | 'skip';
  apiKeys: 'idle' | 'saving' | 'done';
  complete: 'idle' | 'saving' | 'done' | 'error';
}

interface FormData {
  mediaDir: string;
  qbitUrl: string;
  qbitUsername: string;
  qbitPassword: string;
  jellyfinUrl: string;
  jellyfinApiKey: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  omdbApiKey: string;
  googleAiApiKey: string;
  preferredQuality: '720p' | '1080p' | '4k' | 'best';
  watchFolderEnabled: boolean;
  autoTranscode: boolean;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'welcome',  label: 'Welcome',      icon: Zap },
  { id: 'media',    label: 'Media Folder', icon: HardDrive },
  { id: 'qbit',     label: 'qBittorrent',  icon: Wifi },
  { id: 'jellyfin', label: 'Jellyfin',     icon: Tv2 },
  { id: 'apikeys',  label: 'API Keys',     icon: KeyRound },
  { id: 'finish',   label: 'Finish',       icon: CheckCircle2 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiPost(action: string, data: Record<string, unknown> = {}) {
  const res = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    mediaDir: '/media',
    qbitUrl: 'http://localhost:8080',
    qbitUsername: 'admin',
    qbitPassword: 'homestream',
    jellyfinUrl: 'http://localhost:8096',
    jellyfinApiKey: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    omdbApiKey: '',
    googleAiApiKey: '',
    preferredQuality: '1080p',
    watchFolderEnabled: true,
    autoTranscode: true,
  });
  const [status, setStatus] = useState<StepStatus>({
    mediaDir: 'idle',
    qbit: 'idle',
    jellyfin: 'idle',
    apiKeys: 'idle',
    complete: 'idle',
  });
  const [showQbitPass, setShowQbitPass] = useState(false);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [qbitVersion, setQbitVersion] = useState('');
  const [jellyfinVersion, setJellyfinVersion] = useState('');
  const [testError, setTestError] = useState('');

  // Existing media scan state
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'importing' | 'imported'>('idle');
  const [scanFound, setScanFound] = useState(0);
  const [scanSkipped, setScanSkipped] = useState(0);
  const [scanFiles, setScanFiles] = useState<{ name: string; size: number; path: string }[]>([]);
  const [importExisting, setImportExisting] = useState(true);

  // Check if already set up
  useEffect(() => {
    fetch('/api/setup').then(r => r.json()).then((data: { setupComplete?: boolean }) => {
      if (data.setupComplete) navigate('/');
    }).catch(() => {});
  }, [navigate]);

  const set = (key: keyof FormData, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }));

  // Auto-scan when reaching finish step
  const runScan = useCallback(async (dir: string) => {
    setScanState('scanning');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_existing', mediaDir: dir }),
      });
      const data = await res.json() as {
        found: number; skipped: number;
        files: { name: string; size: number; path: string }[];
      };
      setScanFound(data.found);
      setScanSkipped(data.skipped);
      setScanFiles(data.files ?? []);
      setScanState('done');
    } catch {
      setScanState('done');
    }
  }, []);

  useEffect(() => {
    if (step === 5 && scanState === 'idle') {
      runScan(form.mediaDir);
    }
  }, [step, scanState, form.mediaDir, runScan]);

  // ── Step actions ──

  const saveMediaDir = async () => {
    setStatus(s => ({ ...s, mediaDir: 'saving' }));
    try {
      await apiPost('save', {
        mediaDir: form.mediaDir,
        watchFolderEnabled: String(form.watchFolderEnabled),
        autoTranscode: String(form.autoTranscode),
        preferredQuality: form.preferredQuality,
      });
      setStatus(s => ({ ...s, mediaDir: 'done' }));
      setStep(2);
    } catch {
      setStatus(s => ({ ...s, mediaDir: 'error' }));
    }
  };

  const testQbit = async () => {
    setStatus(s => ({ ...s, qbit: 'testing' }));
    setTestError('');
    try {
      await apiPost('save', {
        qbitUrl: form.qbitUrl,
        qbitUsername: form.qbitUsername,
        qbitPassword: form.qbitPassword,
      });
      const result = await apiPost('test_qbit', {
        qbitUrl: form.qbitUrl,
        qbitUsername: form.qbitUsername,
        qbitPassword: form.qbitPassword,
      }) as { ok: boolean; version?: string; error?: string };

      if (result.ok) {
        setQbitVersion(result.version ?? '');
        setStatus(s => ({ ...s, qbit: 'ok' }));
      } else {
        setTestError(result.error ?? 'Connection failed');
        setStatus(s => ({ ...s, qbit: 'error' }));
      }
    } catch {
      setTestError('Could not reach qBittorrent');
      setStatus(s => ({ ...s, qbit: 'error' }));
    }
  };

  const skipQbit = async () => {
    await apiPost('save', {
      qbitUrl: form.qbitUrl,
      qbitUsername: form.qbitUsername,
      qbitPassword: form.qbitPassword,
    });
    setStatus(s => ({ ...s, qbit: 'skip' }));
    setStep(3);
  };

  const testJellyfin = async () => {
    setStatus(s => ({ ...s, jellyfin: 'testing' }));
    setTestError('');
    try {
      await apiPost('save', {
        jellyfinUrl: form.jellyfinUrl,
        jellyfinApiKey: form.jellyfinApiKey,
      });
      const result = await apiPost('test_jellyfin', {
        jellyfinUrl: form.jellyfinUrl,
        jellyfinApiKey: form.jellyfinApiKey,
      }) as { ok: boolean; version?: string; error?: string };

      if (result.ok) {
        setJellyfinVersion(result.version ?? '');
        setStatus(s => ({ ...s, jellyfin: 'ok' }));
      } else {
        setTestError(result.error ?? 'Connection failed');
        setStatus(s => ({ ...s, jellyfin: 'error' }));
      }
    } catch {
      setTestError('Could not reach Jellyfin');
      setStatus(s => ({ ...s, jellyfin: 'error' }));
    }
  };

  const skipJellyfin = async () => {
    await apiPost('save', {
      jellyfinUrl: form.jellyfinUrl,
      jellyfinApiKey: form.jellyfinApiKey,
    });
    setStatus(s => ({ ...s, jellyfin: 'skip' }));
    setStep(4);
  };

  const saveApiKeys = async () => {
    setStatus(s => ({ ...s, apiKeys: 'saving' }));
    await apiPost('save', {
      adminPassword: form.adminPassword,
      omdbApiKey: form.omdbApiKey,
      googleAiApiKey: form.googleAiApiKey,
    });
    setStatus(s => ({ ...s, apiKeys: 'done' }));
    setStep(5);
  };

  const completeSetup = async () => {
    setStatus(s => ({ ...s, complete: 'saving' }));
    try {
      // Kick off existing media import in background if user opted in
      if (importExisting && scanFound > 0) {
        setScanState('importing');
        await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import_existing' }),
        });
        setScanState('imported');
      }

      const result = await apiPost('complete') as { ok: boolean; error?: string };
      if (result.ok) {
        setStatus(s => ({ ...s, complete: 'done' }));
        toast.success(
          scanFound > 0 && importExisting
            ? `HomeStream is ready! Importing ${scanFound} existing files in the background.`
            : 'HomeStream is ready!'
        );
        setTimeout(() => navigate('/'), 1800);
      } else {
        setStatus(s => ({ ...s, complete: 'error' }));
      }
    } catch {
      setStatus(s => ({ ...s, complete: 'error' }));
    }
  };

  // ── Render ──

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <title>Setup — HomeStream</title>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <Film className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-2xl font-heading font-bold text-foreground">HomeStream</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < step ? 'bg-green-500 text-white' :
              i === step ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 transition-all ${i < step ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-card border border-border rounded-2xl p-8 shadow-2xl"
          >

            {/* ── STEP 0: Welcome ── */}
            {step === 0 && (
              <div className="flex flex-col gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-2xl font-heading font-bold text-foreground">Welcome to HomeStream</h1>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    Let's get your self-hosted media server set up. This takes about 5 minutes.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {[
                    { icon: HardDrive, label: 'Media folder', desc: 'Where your movies and shows live' },
                    { icon: Wifi, label: 'qBittorrent', desc: 'Download engine (optional but recommended)' },
                    { icon: Tv2, label: 'Jellyfin', desc: 'Stream to any device on your network' },
                    { icon: KeyRound, label: 'API keys', desc: 'Metadata, AI enrichment (all optional)' },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Running with Docker?</strong> Check your <code className="bg-muted px-1 rounded">.env</code> file — most settings are pre-filled from environment variables.
                </div>

                <button onClick={() => setStep(1)}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold transition-colors">
                  Get Started <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ── STEP 1: Media Folder ── */}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-heading font-bold text-foreground">Media Folder</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Where should HomeStream store your media? On a RAID array, use your mount point.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Media directory path</label>
                    <div className="relative">
                      <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="text" value={form.mediaDir} onChange={e => set('mediaDir', e.target.value)}
                        placeholder="/media"
                        className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      HomeStream will create: <code className="bg-muted px-1 rounded">{form.mediaDir}/downloads</code> and <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code>
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Preferred download quality</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['720p', '1080p', '4k', 'best'] as const).map(q => (
                        <button key={q} onClick={() => set('preferredQuality', q)}
                          className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${form.preferredQuality === q ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                          {q === 'best' ? 'Best' : q}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      1080p recommended — great quality, reasonable storage use
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-foreground">Auto-import from downloads folder</p>
                        <p className="text-xs text-muted-foreground">Watch for new files and add them automatically</p>
                      </div>
                      <button onClick={() => set('watchFolderEnabled', !form.watchFolderEnabled)}
                        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${form.watchFolderEnabled ? 'bg-primary' : 'bg-muted'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form.watchFolderEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-foreground">Auto-transcode to H.264</p>
                        <p className="text-xs text-muted-foreground">Ensures all files play in any browser</p>
                      </div>
                      <button onClick={() => set('autoTranscode', !form.autoTranscode)}
                        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${form.autoTranscode ? 'bg-primary' : 'bg-muted'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${form.autoTranscode ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={saveMediaDir} disabled={!form.mediaDir || status.mediaDir === 'saving'}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60">
                    {status.mediaDir === 'saving' ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Save & Continue <ChevronRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: qBittorrent ── */}
            {step === 2 && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Wifi className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-heading font-bold text-foreground">qBittorrent</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect to qBittorrent for fast, reliable downloads with full BitTorrent swarm access.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-blue-400">Using Docker Compose?</strong> qBittorrent is already running at <code className="bg-muted px-1 rounded">http://qbittorrent:8080</code>. Default login: <code className="bg-muted px-1 rounded">admin / homestream</code>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">qBittorrent Web UI URL</label>
                    <input type="text" value={form.qbitUrl} onChange={e => set('qbitUrl', e.target.value)}
                      placeholder="http://localhost:8080"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Username</label>
                      <input type="text" value={form.qbitUsername} onChange={e => set('qbitUsername', e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Password</label>
                      <div className="relative">
                        <input type={showQbitPass ? 'text' : 'password'} value={form.qbitPassword} onChange={e => set('qbitPassword', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary" />
                        <button onClick={() => setShowQbitPass(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showQbitPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test result */}
                {status.qbit === 'ok' && (
                  <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Connected! qBittorrent {qbitVersion}
                  </div>
                )}
                {status.qbit === 'error' && (
                  <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Connection failed</p>
                      <p className="text-xs opacity-80 mt-0.5">{testError}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={testQbit} disabled={status.qbit === 'testing'}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors disabled:opacity-60">
                    {status.qbit === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test
                  </button>
                  {status.qbit === 'ok' ? (
                    <button onClick={() => setStep(3)}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors">
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={skipQbit}
                      className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-muted-foreground py-2.5 rounded-xl text-sm transition-colors">
                      Skip for now <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <a href="https://www.qbittorrent.org/download" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center justify-center gap-1">
                  Download qBittorrent <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* ── STEP 3: Jellyfin ── */}
            {step === 3 && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Tv2 className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-heading font-bold text-foreground">Jellyfin</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect Jellyfin to stream your library to any TV, phone, or browser on your network.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-blue-400">Using Docker Compose?</strong> Jellyfin is at <code className="bg-muted px-1 rounded">http://jellyfin:8096</code>. Complete Jellyfin's first-run setup first, then get your API key from <strong>Dashboard → API Keys</strong>.
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Jellyfin URL</label>
                    <input type="text" value={form.jellyfinUrl} onChange={e => set('jellyfinUrl', e.target.value)}
                      placeholder="http://localhost:8096"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      API Key <span className="text-muted-foreground/60">(optional — needed for library sync)</span>
                    </label>
                    <input type="text" value={form.jellyfinApiKey} onChange={e => set('jellyfinApiKey', e.target.value)}
                      placeholder="Paste your Jellyfin API key here"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                  </div>
                </div>

                {status.jellyfin === 'ok' && (
                  <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Connected! Jellyfin {jellyfinVersion}
                  </div>
                )}
                {status.jellyfin === 'error' && (
                  <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Connection failed</p>
                      <p className="text-xs opacity-80 mt-0.5">{testError}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={testJellyfin} disabled={status.jellyfin === 'testing'}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors disabled:opacity-60">
                    {status.jellyfin === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test
                  </button>
                  {status.jellyfin === 'ok' ? (
                    <button onClick={() => setStep(4)}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors">
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={skipJellyfin}
                      className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-muted-foreground py-2.5 rounded-xl text-sm transition-colors">
                      Skip for now <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <a href="https://jellyfin.org/downloads" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center justify-center gap-1">
                  Download Jellyfin <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* ── STEP 4: API Keys ── */}
            {step === 4 && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-heading font-bold text-foreground">API Keys</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    All optional — HomeStream works without them, but they unlock richer features.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Admin password */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">Admin Password</p>
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Optional</span>
                    </div>
                    <div className="relative">
                      <input type={showAdminPass ? 'text' : 'password'} value={form.adminPassword}
                        onChange={e => set('adminPassword', e.target.value)}
                        placeholder="Set a password to protect settings"
                        className="w-full bg-background border border-border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                      <button onClick={() => setShowAdminPass(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* OMDB */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">OMDB API Key</p>
                      </div>
                      <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                        Get free key <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Movie posters, plot summaries, ratings</p>
                    <input type="text" value={form.omdbApiKey} onChange={e => set('omdbApiKey', e.target.value)}
                      placeholder="xxxxxxxx"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                  </div>

                  {/* Google AI */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Google AI API Key</p>
                      </div>
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                        Get free key <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">AI tags, mood analysis, smart recommendations</p>
                    <input type="text" value={form.googleAiApiKey} onChange={e => set('googleAiApiKey', e.target.value)}
                      placeholder="AIzaSy…"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={saveApiKeys}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors">
                    {status.apiKeys === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save & Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 5: Finish ── */}
            {step === 5 && (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h2 className="text-2xl font-heading font-bold text-foreground">You're all set!</h2>
                  <p className="text-muted-foreground mt-2 text-sm">Here's your HomeStream configuration summary.</p>
                </div>

                {/* Config summary */}
                <div className="flex flex-col gap-1.5 text-sm">
                  {[
                    { label: 'Media folder', value: form.mediaDir, ok: !!form.mediaDir },
                    { label: 'qBittorrent', value: status.qbit === 'ok' ? `Connected (${qbitVersion})` : 'Not configured', ok: status.qbit === 'ok' },
                    { label: 'Jellyfin', value: status.jellyfin === 'ok' ? `Connected (${jellyfinVersion})` : 'Not configured', ok: status.jellyfin === 'ok' },
                    { label: 'OMDB metadata', value: form.omdbApiKey ? 'API key set' : 'Not configured', ok: !!form.omdbApiKey },
                    { label: 'AI enrichment', value: form.googleAiApiKey ? 'API key set' : 'Not configured', ok: !!form.googleAiApiKey },
                    { label: 'Auto-import', value: form.watchFolderEnabled ? 'Enabled' : 'Disabled', ok: form.watchFolderEnabled },
                    { label: 'Preferred quality', value: form.preferredQuality, ok: true },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <span className={`flex items-center gap-1.5 font-medium text-xs ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {ok ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <AlertCircle className="w-3 h-3 text-muted-foreground" />}
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* ── Existing media scan panel ── */}
                <div className={`rounded-xl border p-4 transition-colors ${
                  scanState === 'done' && scanFound > 0
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-muted/20'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ScanSearch className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-sm font-semibold text-foreground">Existing Media on RAID</p>
                    {scanState === 'scanning' && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />
                    )}
                  </div>

                  {scanState === 'scanning' && (
                    <p className="text-xs text-muted-foreground">
                      Scanning <code className="bg-muted px-1 rounded">{form.mediaDir}</code> for existing video files…
                    </p>
                  )}

                  {scanState === 'done' && scanFound === 0 && scanSkipped === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No existing video files found in <code className="bg-muted px-1 rounded">{form.mediaDir}</code>.
                      {' '}Files will appear here as you download content.
                    </p>
                  )}

                  {scanState === 'done' && scanSkipped > 0 && scanFound === 0 && (
                    <p className="text-xs text-green-400">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                      All {scanSkipped} existing files are already in your library.
                    </p>
                  )}

                  {scanState === 'done' && scanFound > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-primary">{scanFound} file{scanFound !== 1 ? 's' : ''} found</p>
                          <p className="text-xs text-muted-foreground">
                            {scanSkipped > 0 ? `${scanSkipped} already in library · ` : ''}
                            Ready to import into HomeStream
                          </p>
                        </div>
                        <PackageOpen className="w-8 h-8 text-primary/40" />
                      </div>

                      {/* File preview list */}
                      {scanFiles.length > 0 && (
                        <div className="max-h-28 overflow-y-auto flex flex-col gap-0.5 rounded-lg bg-background/60 p-2">
                          {scanFiles.slice(0, 50).map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                              <span className="text-foreground truncate max-w-[260px]">{f.name}</span>
                              <span className="text-muted-foreground flex-shrink-0 ml-2">
                                {(f.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                              </span>
                            </div>
                          ))}
                          {scanFiles.length > 50 && (
                            <p className="text-[10px] text-muted-foreground text-center pt-1">
                              +{scanFiles.length - 50} more files
                            </p>
                          )}
                        </div>
                      )}

                      {/* Import toggle */}
                      <label className="flex items-center justify-between cursor-pointer bg-background/60 rounded-lg px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Import all into HomeStream library</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Files stay in place — nothing is moved or deleted</p>
                        </div>
                        <button
                          onClick={() => setImportExisting(v => !v)}
                          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 focus:outline-none ${importExisting ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${importExisting ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </label>
                    </div>
                  )}

                  {(scanState === 'importing' || scanState === 'imported') && (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      {scanState === 'importing'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing {scanFound} files in background…</>
                        : <><CheckCircle2 className="w-3.5 h-3.5" />Import started — files will appear in your library shortly</>
                      }
                    </div>
                  )}
                </div>

                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Next step:</strong> Open Jellyfin at{' '}
                  <a href={form.jellyfinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{form.jellyfinUrl}</a>{' '}
                  and add <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code> as a media library.
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={completeSetup} disabled={status.complete === 'saving' || status.complete === 'done' || scanState === 'scanning'}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-60">
                    {status.complete === 'saving' || scanState === 'importing'
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Starting HomeStream…</>
                      : status.complete === 'done'
                      ? <><CheckCircle2 className="w-4 h-4" />Done! Redirecting…</>
                      : scanState === 'scanning'
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning media…</>
                      : <>Launch HomeStream <Zap className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step label */}
      <p className="text-xs text-muted-foreground mt-4">
        Step {step + 1} of {STEPS.length} — {currentStep.label}
      </p>
    </div>
  );
}
