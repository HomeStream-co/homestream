import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  HardDrive, Wifi, KeyRound, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, AlertCircle,
  FolderOpen, Eye, EyeOff, ExternalLink, Zap,
  Film, Tv2, Shield, RefreshCw, ScanSearch, PackageOpen, XCircle,
  Lock, Globe, ToggleLeft, ToggleRight, Upload, CheckCircle, XCircle as XCircleIcon,
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
  tmdbApiKey: string;
  aiProvider: 'gemini' | 'ollama';
  ollamaUrl: string;
  ollamaModel: string;
  preferredQuality: '720p' | '1080p' | '4k' | 'best';
  watchFolderEnabled: boolean;
  autoTranscode: boolean;
  // VPN
  vpnEnabled: boolean;
  vpnProtocol: 'wireguard' | 'openvpn';
  vpnProvider: string;
  vpnConfigContent: string;
  vpnUsername: string;
  vpnPassword: string;
  vpnAutoConnect: boolean;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'welcome',  label: 'Welcome',      icon: Zap },
  { id: 'media',    label: 'Media Folder', icon: HardDrive },
  { id: 'qbit',     label: 'qBittorrent',  icon: Wifi },
  { id: 'jellyfin', label: 'Jellyfin',     icon: Tv2 },
  { id: 'vpn',      label: 'VPN',          icon: Lock },
  { id: 'apikeys',  label: 'API Keys',     icon: KeyRound },
  { id: 'https',    label: 'HTTPS',        icon: Shield },
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
    tmdbApiKey: '',
    aiProvider: 'gemini',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    preferredQuality: '1080p',
    watchFolderEnabled: true,
    autoTranscode: true,
    // VPN defaults
    vpnEnabled: false,
    vpnProtocol: 'wireguard',
    vpnProvider: 'custom',
    vpnConfigContent: '',
    vpnUsername: '',
    vpnPassword: '',
    vpnAutoConnect: false,
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

  // Per-key validation state
  type KeyTestState = 'idle' | 'testing' | 'ok' | 'error';
  const [tmdbTest, setTmdbTest]       = useState<KeyTestState>('idle');
  const [omdbTest, setOmdbTest]       = useState<KeyTestState>('idle');
  const [googleAiTest, setGoogleAiTest] = useState<KeyTestState>('idle');
  const [ollamaTest, setOllamaTest]   = useState<KeyTestState>('idle');
  const [tmdbTestMsg, setTmdbTestMsg]   = useState('');
  const [omdbTestMsg, setOmdbTestMsg]   = useState('');
  const [googleAiTestMsg, setGoogleAiTestMsg] = useState('');
  const [ollamaTestMsg, setOllamaTestMsg] = useState('');

  // Existing media scan state
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'importing' | 'imported'>('idle');
  const [scanFound, setScanFound] = useState(0);
  const [scanSkipped, setScanSkipped] = useState(0);
  const [scanFiles, setScanFiles] = useState<{ name: string; size: number; path: string }[]>([]);
  const [importExisting, setImportExisting] = useState(true);

  // VPN state
  const [vpnTestState, setVpnTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [vpnTestMsg, setVpnTestMsg] = useState('');

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
    if (step === 7 && scanState === 'idle') {
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

  // ── API key testers ──

  const testTmdbKey = async () => {
    if (!form.tmdbApiKey.trim()) return;
    setTmdbTest('testing');
    setTmdbTestMsg('');
    try {
      const res = await fetch('https://api.themoviedb.org/3/configuration', {
        headers: { Authorization: `Bearer ${form.tmdbApiKey.trim()}` },
      });
      if (res.ok) {
        setTmdbTest('ok');
        setTmdbTestMsg('Key is valid — TMDB connected!');
      } else {
        const body = await res.json() as { status_message?: string };
        setTmdbTest('error');
        setTmdbTestMsg(body.status_message ?? `HTTP ${res.status}`);
      }
    } catch {
      setTmdbTest('error');
      setTmdbTestMsg('Network error — check your connection');
    }
  };

  const testOmdbKey = async () => {
    if (!form.omdbApiKey.trim()) return;
    setOmdbTest('testing');
    setOmdbTestMsg('');
    try {
      const res = await fetch(`https://www.omdbapi.com/?apikey=${form.omdbApiKey.trim()}&t=inception`);
      const body = await res.json() as { Response: string; Error?: string; Title?: string };
      if (body.Response === 'True') {
        setOmdbTest('ok');
        setOmdbTestMsg(`Key is valid — fetched "${body.Title}" successfully`);
      } else {
        setOmdbTest('error');
        setOmdbTestMsg(body.Error ?? 'Invalid key');
      }
    } catch {
      setOmdbTest('error');
      setOmdbTestMsg('Network error — check your connection');
    }
  };

  const testGoogleAiKey = async () => {
    if (!form.googleAiApiKey.trim()) return;
    setGoogleAiTest('testing');
    setGoogleAiTestMsg('');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${form.googleAiApiKey.trim()}`
      );
      if (res.ok) {
        setGoogleAiTest('ok');
        setGoogleAiTestMsg('Key is valid — Gemini API connected!');
      } else {
        const body = await res.json() as { error?: { message?: string } };
        setGoogleAiTest('error');
        setGoogleAiTestMsg(body.error?.message ?? `HTTP ${res.status}`);
      }
    } catch {
      setGoogleAiTest('error');
      setGoogleAiTestMsg('Network error — check your connection');
    }
  };

  const testOllamaConnection = async () => {
    if (!form.ollamaUrl.trim()) return;
    setOllamaTest('testing');
    setOllamaTestMsg('');
    try {
      // Ollama exposes GET /api/tags — lists locally available models
      const res = await fetch(`${form.ollamaUrl.trim()}/api/tags`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        const models = data.models?.map(m => m.name) ?? [];
        const modelInstalled = models.some(n => n.startsWith(form.ollamaModel.trim()));
        if (models.length === 0) {
          setOllamaTest('error');
          setOllamaTestMsg('Ollama is running but no models are installed. Run: ollama pull ' + (form.ollamaModel || 'llama3'));
        } else if (!modelInstalled) {
          setOllamaTest('error');
          setOllamaTestMsg(`Connected! But "${form.ollamaModel}" not found. Available: ${models.slice(0, 3).join(', ')}`);
        } else {
          setOllamaTest('ok');
          setOllamaTestMsg(`Connected! "${form.ollamaModel}" is ready.`);
        }
      } else {
        setOllamaTest('error');
        setOllamaTestMsg(`HTTP ${res.status} — is Ollama running?`);
      }
    } catch {
      setOllamaTest('error');
      setOllamaTestMsg(`Cannot reach ${form.ollamaUrl} — make sure Ollama is running`);
    }
  };

  const saveApiKeys = async () => {
    setStatus(s => ({ ...s, apiKeys: 'saving' }));
    await apiPost('save', {
      adminPassword: form.adminPassword,
      omdbApiKey: form.omdbApiKey,
      googleAiApiKey: form.googleAiApiKey,
      tmdbApiKey: form.tmdbApiKey,
      aiProvider: form.aiProvider,
      ollamaUrl: form.ollamaUrl,
      ollamaModel: form.ollamaModel,
    });
    setStatus(s => ({ ...s, apiKeys: 'done' }));
    setStep(6);
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 py-8">
      <title>Setup — HomeStream</title>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <Film className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-2xl font-heading font-bold text-foreground">HomeStream</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap justify-center">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div
              title={s.label}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-default ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-0.5 transition-all ${i < step ? 'bg-green-500' : 'bg-muted'}`} />
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
            className="bg-card border border-border rounded-2xl p-8 shadow-2xl max-h-[80vh] overflow-y-auto"
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
                    { icon: KeyRound, label: 'API keys', desc: 'TMDB, OMDB, Google AI — all free, all optional' },
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

            {/* ── STEP 4: VPN ── */}
            {step === 4 && (() => {
              // Provider metadata (mirrors vpnService.ts VPN_PROVIDERS)
              type ProviderAuthType = 'config_file' | 'credentials';
              interface ProviderMeta {
                id: string; name: string; authType: ProviderAuthType;
                protocol: 'wireguard' | 'openvpn'; configUrl?: string;
              }
              const PROVIDERS: ProviderMeta[] = [
                { id: 'mullvad',    name: 'Mullvad',                  authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://mullvad.net/en/account/wireguard-config' },
                { id: 'protonvpn',  name: 'ProtonVPN',                authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://account.proton.me/u/0/vpn/WireGuard' },
                { id: 'surfshark',  name: 'Surfshark',                authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://my.surfshark.com/vpn/manual-setup/main/wireguard' },
                { id: 'nordvpn',    name: 'NordVPN',                  authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://downloads.nordcdn.com/configs/archives/servers/ovpn_udp.zip' },
                { id: 'expressvpn', name: 'ExpressVPN',               authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://www.expressvpn.com/setup#manual' },
                { id: 'norton',     name: 'Norton VPN',               authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://support.norton.com/sp/en/us/home/current/solutions/v134005887' },
                { id: 'pia',        name: 'Private Internet Access',  authType: 'config_file',  protocol: 'openvpn',   configUrl: 'https://www.privateinternetaccess.com/openvpn/openvpn.zip' },
                { id: 'ipvanish',   name: 'IPVanish',                 authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://www.ipvanish.com/software/configs/' },
                { id: 'ivpn',       name: 'IVPN',                     authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://www.ivpn.net/account/wireguard' },
                { id: 'airvpn',     name: 'AirVPN',                   authType: 'config_file',  protocol: 'openvpn',   configUrl: 'https://airvpn.org/generator/' },
                { id: 'custom',     name: 'Custom / Other',           authType: 'config_file',  protocol: 'wireguard' },
              ];

              const selectedProvider = PROVIDERS.find(p => p.id === form.vpnProvider) ?? PROVIDERS[PROVIDERS.length - 1];
              const needsCredentials = selectedProvider.authType === 'credentials';

              return (
                <div className="flex flex-col gap-5">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-heading font-bold text-foreground">VPN Protection</h2>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Protects your downloads from ISP throttling and DMCA notices.
                    </p>
                    {/* Download-only callout */}
                    <div className="mt-3 flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                      <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Downloads only — streaming is never slowed down</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          The VPN tunnel activates automatically when a torrent starts and disconnects when it finishes.
                          Video playback always uses your direct connection for full speed.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Enable toggle */}
                  <div
                    onClick={() => set('vpnEnabled', !form.vpnEnabled)}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      form.vpnEnabled ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Globe className={`w-5 h-5 ${form.vpnEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Enable VPN for Downloads</p>
                        <p className="text-xs text-muted-foreground">Automatically tunnel torrent traffic</p>
                      </div>
                    </div>
                    {form.vpnEnabled
                      ? <ToggleRight className="w-8 h-8 text-primary" />
                      : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                  </div>

                  {form.vpnEnabled && (
                    <div className="flex flex-col gap-4">
                      {/* Provider grid */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                          Your VPN Provider
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {PROVIDERS.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                set('vpnProvider', p.id);
                                set('vpnProtocol', p.protocol);
                              }}
                              className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                                form.vpnProvider === p.id
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              <span className="text-[11px] font-semibold leading-tight">{p.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                p.protocol === 'wireguard'
                                  ? 'bg-green-500/10 text-green-500'
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                {p.protocol === 'wireguard' ? 'WireGuard' : 'OpenVPN'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Config file — for config_file providers */}
                      {!needsCredentials && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {selectedProvider.protocol === 'wireguard' ? 'WireGuard Config (.conf)' : 'OpenVPN Config (.ovpn)'}
                            </label>
                            {selectedProvider.configUrl && (
                              <a href={selectedProvider.configUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                Get config from {selectedProvider.name} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="relative">
                            <textarea
                              value={form.vpnConfigContent}
                              onChange={e => set('vpnConfigContent', e.target.value)}
                              placeholder={selectedProvider.protocol === 'wireguard'
                                ? '[Interface]\nPrivateKey = ...\nAddress = 10.x.x.x/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0'
                                : 'client\ndev tun\nproto udp\nremote vpn.example.com 1194\n...'
                              }
                              rows={7}
                              className="w-full px-3 py-2 text-xs font-mono bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                            />
                            <label className="absolute bottom-2 right-2 cursor-pointer">
                              <input type="file" accept=".conf,.ovpn,.txt" className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  set('vpnConfigContent', await file.text());
                                }}
                              />
                              <span className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 bg-card border border-border rounded px-2 py-1">
                                <Upload className="w-3 h-3" /> Upload file
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Credentials — for credential-based providers */}
                      {needsCredentials && (
                        <div className="flex flex-col gap-3">
                          <div className="p-3 bg-muted/30 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <span className="font-semibold text-foreground">{selectedProvider.name}</span> uses username + password authentication.
                              Enter your VPN credentials below. You'll also need to{' '}
                              {selectedProvider.configUrl ? (
                                <a href={selectedProvider.configUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  download a server config file <ExternalLink className="w-2.5 h-2.5 inline" />
                                </a>
                              ) : 'download a server config file'}{' '}
                              and paste it in the Config field below.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Username</label>
                              <input
                                type="text"
                                value={form.vpnUsername}
                                onChange={e => set('vpnUsername', e.target.value)}
                                placeholder="VPN username"
                                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Password</label>
                              <input
                                type="password"
                                value={form.vpnPassword}
                                onChange={e => set('vpnPassword', e.target.value)}
                                placeholder="VPN password"
                                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                          {/* Config file still needed for server address */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Server Config (.ovpn)
                              </label>
                            </div>
                            <div className="relative">
                              <textarea
                                value={form.vpnConfigContent}
                                onChange={e => set('vpnConfigContent', e.target.value)}
                                placeholder={'client\ndev tun\nproto udp\nremote vpn.example.com 1194\nauth-user-pass\n...'}
                                rows={5}
                                className="w-full px-3 py-2 text-xs font-mono bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                              />
                              <label className="absolute bottom-2 right-2 cursor-pointer">
                                <input type="file" accept=".conf,.ovpn,.txt" className="hidden"
                                  onChange={async e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    set('vpnConfigContent', await file.text());
                                  }}
                                />
                                <span className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 bg-card border border-border rounded px-2 py-1">
                                  <Upload className="w-3 h-3" /> Upload .ovpn
                                </span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Validate config */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setVpnTestState('testing');
                            setVpnTestMsg('');
                            try {
                              const r = await fetch('/api/vpn', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'test',
                                  protocol: form.vpnProtocol,
                                  configContent: form.vpnConfigContent,
                                  username: form.vpnUsername || undefined,
                                  password: form.vpnPassword || undefined,
                                }),
                              });
                              const data = await r.json() as { ok: boolean; error?: string };
                              setVpnTestState(data.ok ? 'ok' : 'error');
                              setVpnTestMsg(data.error ?? 'Config looks valid!');
                            } catch {
                              setVpnTestState('error');
                              setVpnTestMsg('Could not reach VPN API');
                            }
                          }}
                          disabled={!form.vpnConfigContent.trim() || vpnTestState === 'testing'}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground disabled:opacity-50 transition-colors"
                        >
                          {vpnTestState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : vpnTestState === 'ok' ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            : vpnTestState === 'error' ? <XCircleIcon className="w-3.5 h-3.5 text-red-400" />
                            : <Shield className="w-3.5 h-3.5" />}
                          Validate Config
                        </button>
                        {vpnTestMsg && (
                          <span className={`text-xs ${vpnTestState === 'ok' ? 'text-green-500' : 'text-red-400'}`}>
                            {vpnTestMsg}
                          </span>
                        )}
                      </div>

                      {/* Auto-connect toggle */}
                      <div
                        onClick={() => set('vpnAutoConnect', !form.vpnAutoConnect)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          form.vpnAutoConnect ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <Zap className={`w-4 h-4 ${form.vpnAutoConnect ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground">Auto-Connect on Download</p>
                          <p className="text-[10px] text-muted-foreground">Tunnel activates automatically when any download starts</p>
                        </div>
                        {form.vpnAutoConnect
                          ? <ToggleRight className="w-6 h-6 text-primary" />
                          : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                      </div>
                    </div>
                  )}

                  {!form.vpnEnabled && (
                    <div className="p-4 bg-muted/20 rounded-xl border border-dashed border-border text-center">
                      <p className="text-sm text-muted-foreground">
                        No VPN — you can add one later in Settings → VPN.
                      </p>
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={async () => {
                        if (form.vpnEnabled) {
                          await fetch('/api/vpn', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'save',
                              enabled: true,
                              protocol: form.vpnProtocol,
                              provider: form.vpnProvider,
                              configContent: form.vpnConfigContent,
                              username: form.vpnUsername || undefined,
                              password: form.vpnPassword || undefined,
                              autoConnect: form.vpnAutoConnect,
                            }),
                          }).catch(() => {});
                        }
                        setStep(5);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors"
                    >
                      {form.vpnEnabled ? 'Save & Continue' : 'Skip'} <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── STEP 5: API Keys ── */}
            {step === 5 && (
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
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">Admin Password</p>
                      <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Recommended</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Protects the Settings panel and setup reset. Leave blank to skip (anyone on your LAN can access settings).
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <input type={showAdminPass ? 'text' : 'password'} value={form.adminPassword}
                          onChange={e => set('adminPassword', e.target.value)}
                          placeholder="Enter a password"
                          className="w-full bg-background border border-border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                        <button onClick={() => setShowAdminPass(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {form.adminPassword && (
                        <div className="relative">
                          <input type={showAdminPass ? 'text' : 'password'} value={form.adminPasswordConfirm}
                            onChange={e => set('adminPasswordConfirm', e.target.value)}
                            placeholder="Confirm password"
                            className={`w-full bg-background border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${
                              form.adminPasswordConfirm && form.adminPasswordConfirm !== form.adminPassword
                                ? 'border-destructive'
                                : 'border-border'
                            }`} />
                        </div>
                      )}
                      {form.adminPassword && form.adminPasswordConfirm && form.adminPasswordConfirm !== form.adminPassword && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Passwords don't match
                        </p>
                      )}
                      {form.adminPassword && form.adminPasswordConfirm && form.adminPasswordConfirm === form.adminPassword && (
                        <p className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Passwords match
                        </p>
                      )}
                    </div>
                  </div>

                  {/* TMDB */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">TMDB API Key</p>
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                      </div>
                      <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                        Get free key <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Powers the hero banner, Discover page (upcoming &amp; trending movies), and personalised recommendations. Free — just create a TMDB account.
                    </p>
                    <div className="flex gap-2">
                      <input type="text" value={form.tmdbApiKey} onChange={e => { set('tmdbApiKey', e.target.value); setTmdbTest('idle'); }}
                        placeholder="eyJhbGciOiJSUzI1NiJ9…  (v4 read access token)"
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
                      <button
                        onClick={testTmdbKey}
                        disabled={!form.tmdbApiKey.trim() || tmdbTest === 'testing'}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        {tmdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Test
                      </button>
                    </div>
                    {tmdbTest === 'ok' && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{tmdbTestMsg}
                      </div>
                    )}
                    {tmdbTest === 'error' && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{tmdbTestMsg}
                      </div>
                    )}
                    <div className="mt-2 flex flex-col gap-1 text-[10px] text-muted-foreground">
                      <p className="font-medium text-foreground/70">How to get your key:</p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-1">
                        <li>Go to <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">themoviedb.org/signup</a> and create a free account</li>
                        <li>Visit <strong>Settings → API</strong> and click <strong>Create</strong></li>
                        <li>Choose <strong>Developer</strong>, fill in the form (any app name/URL is fine)</li>
                        <li>Copy the <strong>API Read Access Token (v4)</strong> — it starts with <code className="bg-muted px-1 rounded">eyJ…</code></li>
                      </ol>
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
                    <p className="text-xs text-muted-foreground mb-2">Movie posters, plot summaries, IMDb ratings</p>
                    <div className="flex gap-2">
                      <input type="text" value={form.omdbApiKey} onChange={e => { set('omdbApiKey', e.target.value); setOmdbTest('idle'); }}
                        placeholder="xxxxxxxx"
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
                      <button
                        onClick={testOmdbKey}
                        disabled={!form.omdbApiKey.trim() || omdbTest === 'testing'}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        {omdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Test
                      </button>
                    </div>
                    {omdbTest === 'ok' && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{omdbTestMsg}
                      </div>
                    )}
                    {omdbTest === 'error' && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{omdbTestMsg}
                      </div>
                    )}
                  </div>

                  {/* AI Chat Assistant — provider picker */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">AI Chat Assistant</p>
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">100% Free</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Powers the "Ask AI" chat — movie recommendations, mood matching, and watch suggestions. Choose your preferred provider below.
                    </p>

                    {/* Provider toggle */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {(['gemini', 'ollama'] as const).map(provider => (
                        <button
                          key={provider}
                          onClick={() => { set('aiProvider', provider); setGoogleAiTest('idle'); setOllamaTest('idle'); }}
                          className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                            form.aiProvider === provider
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {provider === 'gemini'
                              ? <Film className="w-3.5 h-3.5 flex-shrink-0" />
                              : <ScanSearch className="w-3.5 h-3.5 flex-shrink-0" />
                            }
                            <span className="text-xs font-semibold capitalize">{provider === 'gemini' ? 'Google Gemini' : 'Ollama (Local)'}</span>
                            {form.aiProvider === provider && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
                          </div>
                          <span className="text-[10px] leading-tight">
                            {provider === 'gemini'
                              ? 'Cloud API — free tier, no install needed'
                              : 'Runs on your machine — fully private, no API key'}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Gemini fields */}
                    {form.aiProvider === 'gemini' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground/80">Google AI API Key</p>
                          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                            Get free key <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={form.googleAiApiKey} onChange={e => { set('googleAiApiKey', e.target.value); setGoogleAiTest('idle'); }}
                            placeholder="AIzaSy…"
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
                          <button
                            onClick={testGoogleAiKey}
                            disabled={!form.googleAiApiKey.trim() || googleAiTest === 'testing'}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
                          >
                            {googleAiTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Test
                          </button>
                        </div>
                        {googleAiTest === 'ok' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{googleAiTestMsg}
                          </div>
                        )}
                        {googleAiTest === 'error' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{googleAiTestMsg}
                          </div>
                        )}
                        <div className="flex flex-col gap-1 text-[10px] text-muted-foreground mt-1">
                          <p className="font-medium text-foreground/70">How to get your key:</p>
                          <ol className="list-decimal list-inside space-y-0.5 ml-1">
                            <li>Go to <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com</a> and sign in with a Google account</li>
                            <li>Click <strong>Get API key</strong> → <strong>Create API key</strong></li>
                            <li>Copy the key — it starts with <code className="bg-muted px-1 rounded">AIzaSy…</code></li>
                            <li>Free tier: 1,500 requests/day, no credit card required</li>
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* Ollama fields */}
                    {form.aiProvider === 'ollama' && (
                      <div className="flex flex-col gap-3">
                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed">
                          <strong>Ollama</strong> runs AI models locally on your machine — completely free, no API key, no data leaves your home.
                          Install from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a>, then run <code className="bg-black/30 px-1 rounded">ollama pull llama3</code> (or any model you prefer).
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-foreground/70">Ollama URL</label>
                            <input type="text" value={form.ollamaUrl} onChange={e => { set('ollamaUrl', e.target.value); setOllamaTest('idle'); }}
                              placeholder="http://localhost:11434"
                              className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-foreground/70">Model name</label>
                            <input type="text" value={form.ollamaModel} onChange={e => { set('ollamaModel', e.target.value); setOllamaTest('idle'); }}
                              placeholder="llama3"
                              className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
                          </div>
                        </div>
                        <button
                          onClick={testOllamaConnection}
                          disabled={!form.ollamaUrl.trim() || ollamaTest === 'testing'}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
                        >
                          {ollamaTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Test Ollama Connection
                        </button>
                        {ollamaTest === 'ok' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{ollamaTestMsg}
                          </div>
                        )}
                        {ollamaTest === 'error' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{ollamaTestMsg}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          <strong className="text-foreground/70">Recommended models:</strong>{' '}
                          <code className="bg-muted px-1 rounded">llama3</code> (best quality),{' '}
                          <code className="bg-muted px-1 rounded">mistral</code> (fast),{' '}
                          <code className="bg-muted px-1 rounded">phi3</code> (lightweight, low RAM)
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button onClick={saveApiKeys}
                    disabled={
                      status.apiKeys === 'saving' ||
                      (!!form.adminPassword && form.adminPassword !== form.adminPasswordConfirm)
                    }
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {status.apiKeys === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save & Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 6: Finish ── */}
            {/* ── STEP 6: HTTPS Setup ── */}
            {step === 6 && (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-heading font-bold text-foreground">Enable HTTPS</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    Optional but recommended — required for Chromecast, PWA install, and remote streaming.
                  </p>
                </div>

                {/* What HTTPS unlocks */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Chromecast casting', desc: 'Requires HTTPS origin' },
                    { label: 'PWA install prompt', desc: 'Add to home screen' },
                    { label: 'Remote streaming',   desc: 'Outside home WiFi' },
                    { label: 'Jellyfin iOS/Android', desc: 'Native app support' },
                  ].map(item => (
                    <div key={item.label} className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Three scenario cards */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose your setup method</p>

                  {[
                    {
                      icon: Wifi,
                      title: 'LAN Only (Self-Signed)',
                      desc: 'Caddy internal CA — no domain, no port forwarding. One browser warning to accept once.',
                      badge: 'Easiest',
                      badgeColor: 'bg-green-500/15 text-green-400',
                    },
                    {
                      icon: Globe,
                      title: 'Custom Domain (Let\'s Encrypt)',
                      desc: 'Real trusted cert via Caddy. Requires a domain + port 443 open on your router.',
                      badge: 'Recommended',
                      badgeColor: 'bg-primary/15 text-primary',
                    },
                    {
                      icon: Shield,
                      title: 'Cloudflare Tunnel',
                      desc: 'Zero open ports. Works behind CGNAT. Free Cloudflare account + domain required.',
                      badge: 'No Port Forwarding',
                      badgeColor: 'bg-orange-500/15 text-orange-400',
                    },
                  ].map(s => {
                    const Icon = s.icon;
                    return (
                      <div key={s.title} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/60">
                        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-semibold text-foreground">{s.title}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${s.badgeColor}`}>{s.badge}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  The full step-by-step guide with copy-paste configs is in{' '}
                  <button
                    onClick={() => navigate('/https-setup')}
                    className="text-primary hover:underline font-medium"
                  >
                    Settings → HTTPS Setup
                  </button>
                  {' '}— you can come back to it any time.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(5)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />Back
                  </button>
                  <button
                    onClick={() => navigate('/https-setup')}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-sm font-medium transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    Open HTTPS Setup guide
                  </button>
                  <button
                    onClick={() => setStep(7)}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-bold text-sm transition-colors"
                  >
                    Skip for now <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 7: Finish ── */}
            {step === 7 && (
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
                    { label: 'TMDB (hero/discover)', value: form.tmdbApiKey ? 'API key set ✓' : 'Not configured — Discover page disabled', ok: !!form.tmdbApiKey },
                    { label: 'OMDB metadata', value: form.omdbApiKey ? 'API key set' : 'Not configured', ok: !!form.omdbApiKey },
                    { label: 'AI assistant', value: form.aiProvider === 'gemini'
                        ? (form.googleAiApiKey ? 'Google Gemini — API key set ✓' : 'Google Gemini — API key missing')
                        : `Ollama (${form.ollamaModel || 'llama3'}) @ ${form.ollamaUrl}`,
                      ok: form.aiProvider === 'ollama' || !!form.googleAiApiKey },
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
                  <strong className="text-foreground">Jellyfin tip:</strong> Open Jellyfin at{' '}
                  <a href={form.jellyfinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{form.jellyfinUrl}</a>{' '}
                  and add <code className="bg-muted px-1 rounded">{form.mediaDir}/library</code> as a media library.
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(6)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
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
