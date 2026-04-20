/**
 * Setup Wizard — Orchestrator
 *
 * Thin shell that owns all shared state and routes between the 9 step
 * components in src/pages/setup/.  Zero business logic lives here —
 * each step component handles its own API calls and validation.
 *
 * Steps:
 *   0  StepSysReqs    — System requirements checklist
 *   1  StepWelcome    — What HomeStream needs (overview)
 *   2  StepMediaFolder — Media directory + quality settings
 *   3  StepQBittorrent — Optional qBittorrent connection
 *   4  StepJellyfin   — Optional Jellyfin connection
 *   5  StepVPN        — Optional VPN for downloads
 *   6  StepApiKeys    — TMDB / OMDB / AI keys + admin password
 *   7  StepHttps      — HTTPS options (informational)
 *   8  StepFinish     — Config summary + launch
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Film } from 'lucide-react';

import type {
  FormData, StepStatus, KeyTestState, ScanState, ScannedFile,
} from './setup/types';
import StepSysReqs     from './setup/StepSysReqs';
import StepWelcome     from './setup/StepWelcome';
import StepMediaFolder from './setup/StepMediaFolder';
import StepQBittorrent from './setup/StepQBittorrent';
import StepJellyfin    from './setup/StepJellyfin';
import StepVPN         from './setup/StepVPN';
import StepApiKeys     from './setup/StepApiKeys';
import StepHttps       from './setup/StepHttps';
import StepFinish      from './setup/StepFinish';

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'sysreqs',  label: 'Requirements' },
  { id: 'welcome',  label: 'Welcome' },
  { id: 'media',    label: 'Media Folder' },
  { id: 'qbit',     label: 'qBittorrent' },
  { id: 'jellyfin', label: 'Jellyfin' },
  { id: 'vpn',      label: 'VPN' },
  { id: 'apikeys',  label: 'API Keys' },
  { id: 'https',    label: 'HTTPS' },
  { id: 'finish',   label: 'Finish' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // ── Form state ──
  // Default mediaDir: fetched from the server on mount (Electron injects the
  // correct OS path; cloud/dev falls back to a sensible platform default).
  // We start with a Windows path as the optimistic default since the .exe
  // installer targets Windows first — it gets replaced on mount.
  const [form, setForm] = useState<FormData>({
    mediaDir: 'C:\\Users\\Public\\Videos\\HomeStream',
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
    vpnEnabled: false,
    vpnProtocol: 'wireguard',
    vpnProvider: 'custom',
    vpnConfigContent: '',
    vpnUsername: '',
    vpnPassword: '',
    vpnAutoConnect: false,
    vpnServerType: 'p2p',
    vpnAutoFastest: true,
    vpnKnownServers: '',
  });

  const set = (key: keyof FormData, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }));

  // ── Status state ──
  const [status, setStatus] = useState<StepStatus>({
    mediaDir: 'idle',
    qbit: 'idle',
    jellyfin: 'idle',
    apiKeys: 'idle',
    complete: 'idle',
  });

  // ── UI state (hoisted so it survives step transitions) ──
  const [showQbitPass, setShowQbitPass]   = useState(false);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [qbitVersion, setQbitVersion]     = useState('');
  const [jellyfinVersion, setJellyfinVersion] = useState('');
  const [testError, setTestError]         = useState('');

  const [tmdbTest, setTmdbTest]           = useState<KeyTestState>('idle');
  const [omdbTest, setOmdbTest]           = useState<KeyTestState>('idle');
  const [googleAiTest, setGoogleAiTest]   = useState<KeyTestState>('idle');
  const [ollamaTest, setOllamaTest]       = useState<KeyTestState>('idle');
  const [tmdbTestMsg, setTmdbTestMsg]     = useState('');
  const [omdbTestMsg, setOmdbTestMsg]     = useState('');
  const [googleAiTestMsg, setGoogleAiTestMsg] = useState('');
  const [ollamaTestMsg, setOllamaTestMsg] = useState('');

  const [scanState, setScanState]         = useState<ScanState>('idle');
  const [scanFound, setScanFound]         = useState(0);
  const [scanSkipped, setScanSkipped]     = useState(0);
  const [scanFiles, setScanFiles]         = useState<ScannedFile[]>([]);
  const [importExisting, setImportExisting] = useState(true);

  const [vpnTestState, setVpnTestState]   = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [vpnTestMsg, setVpnTestMsg]       = useState('');

  // Track whether the Electron platform defaults have been fetched.
  // StepMediaFolder disables its "Save & Continue" button until this resolves
  // so the user can't accidentally save the hardcoded fallback path.
  const [platformDefaultsReady, setPlatformDefaultsReady] = useState(false);

  // ── Redirect if already set up ──
  useEffect(() => {
    fetch('/api/setup').then(r => r.json()).then((data: { setupComplete?: boolean }) => {
      if (data.setupComplete) navigate('/');
    }).catch(() => {});
  }, [navigate]);

  // ── Fetch platform-aware default media directory from Electron ──
  useEffect(() => {
    fetch('/api/electron')
      .then(r => r.json())
      .then((data: { defaultMediaDir?: string }) => {
        if (data.defaultMediaDir) {
          setForm(f => ({ ...f, mediaDir: data.defaultMediaDir! }));
        }
      })
      .catch(() => {/* non-fatal — keep the optimistic default */})
      .finally(() => setPlatformDefaultsReady(true));
  }, []);

  // ── Auto-scan when reaching finish step ──
  const runScan = useCallback(async (dir: string) => {
    // Guard: don't scan if dir is empty or still the placeholder default
    if (!dir || dir.trim() === '') {
      setScanState('done');
      setScanFound(0);
      setScanSkipped(0);
      setScanFiles([]);
      return;
    }
    setScanState('scanning');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_existing', mediaDir: dir }),
      });
      if (!res.ok) {
        // Server error (e.g. dir doesn't exist yet) — show 0 found, not an error
        setScanFound(0);
        setScanSkipped(0);
        setScanFiles([]);
        setScanState('done');
        return;
      }
      const data = await res.json() as {
        found: number; skipped: number;
        files: ScannedFile[];
        error?: string;
      };
      setScanFound(data.found ?? 0);
      setScanSkipped(data.skipped ?? 0);
      setScanFiles(data.files ?? []);
      setScanState('done');
    } catch {
      // Network error — don't block the user, just show 0 found
      setScanFound(0);
      setScanSkipped(0);
      setScanFiles([]);
      setScanState('done');
    }
  }, []);

  // Reset scan state whenever mediaDir changes so re-visiting step 8 re-scans
  useEffect(() => {
    setScanState('idle');
  }, [form.mediaDir]);

  useEffect(() => {
    if (step === 8 && scanState === 'idle') {
      runScan(form.mediaDir);
    }
  }, [step, scanState, form.mediaDir, runScan]);

  // ── Shared props passed to every step ──
  const stepProps = {
    form, set, status, setStatus,
    onNext: () => setStep(s => s + 1),
    onBack: () => setStep(s => s - 1),
    showQbitPass, setShowQbitPass,
    showAdminPass, setShowAdminPass,
    qbitVersion, setQbitVersion,
    jellyfinVersion, setJellyfinVersion,
    testError, setTestError,
    tmdbTest, setTmdbTest, tmdbTestMsg, setTmdbTestMsg,
    omdbTest, setOmdbTest, omdbTestMsg, setOmdbTestMsg,
    googleAiTest, setGoogleAiTest, googleAiTestMsg, setGoogleAiTestMsg,
    ollamaTest, setOllamaTest, ollamaTestMsg, setOllamaTestMsg,
    scanState, setScanState,
    scanFound, setScanFound,
    scanSkipped, setScanSkipped,
    scanFiles, setScanFiles,
    importExisting, setImportExisting,
    vpnTestState, setVpnTestState,
    vpnTestMsg, setVpnTestMsg,
    platformDefaultsReady,
  };

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
            {step === 0 && <StepSysReqs     {...stepProps} />}
            {step === 1 && <StepWelcome     {...stepProps} />}
            {step === 2 && <StepMediaFolder {...stepProps} />}
            {step === 3 && <StepQBittorrent {...stepProps} />}
            {step === 4 && <StepJellyfin    {...stepProps} />}
            {step === 5 && <StepVPN         {...stepProps} />}
            {step === 6 && <StepApiKeys     {...stepProps} />}
            {step === 7 && <StepHttps       {...stepProps} />}
            {step === 8 && <StepFinish      {...stepProps} />}
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
