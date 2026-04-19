/**
 * SettingsPanel — cog-wheel dropdown in the header.
 *
 * Sections:
 *  1. Appearance  — theme picker (6 dark themes) + player color sync
 *  2. Playback    — autoplay next, auto-resume, auto-skip intro, default quality
 *  3. Library     — show storage savings badges, show enrichment tags
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, Check, Palette, Play, Library,
  Monitor, Zap, SkipForward, RotateCcw, Tag, HardDrive,
  Compass, RefreshCw, Clock, WifiOff, KeyRound, Eye, EyeOff,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { useTheme, THEMES, type AppSettings } from '@/context/ThemeContext';

// ── Small reusable toggle ─────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
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
      {/* Toggle pill */}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
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

// ── API Key field ─────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

function ApiKeyField({
  label,
  description,
  value,
  onChange,
  onTest,
  placeholder,
  testLabel,
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
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
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
             status === 'error' ? <XCircle className="w-3 h-3 text-destructive" /> :
             null}
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
export default function SettingsPanel() {
  const { settings, activeTheme, setTheme, updateSetting } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Load current keys when panel opens (masked — server returns partial keys)
  useEffect(() => {
    if (!open || apiKeysLoaded) return;
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { config?: { omdbApiKey?: string; googleAiApiKey?: string; tmdbApiKey?: string } }) => {
        if (data.config) {
          setApiKeys({
            omdbApiKey: data.config.omdbApiKey ?? '',
            googleAiApiKey: data.config.googleAiApiKey ?? '',
            tmdbApiKey: data.config.tmdbApiKey ?? '',
          });
          setApiKeysLoaded(true);
        }
      })
      .catch(() => setApiKeysLoaded(true));
  }, [open, apiKeysLoaded]);

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
    const res = await fetch('https://api.themoviedb.org/3/configuration', {
      headers: { Authorization: `Bearer ${apiKeys.tmdbApiKey}` },
    });
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
        // Update session cache so the hook picks it up on next render
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
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSetting(key, value);
  }

  return (
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
                      {/* Dual swatch */}
                      <div className="flex gap-0.5 rounded-full overflow-hidden w-8 h-4 flex-shrink-0">
                        <div className="flex-1" style={{ background: theme.swatch }} />
                        <div className="flex-1" style={{ background: theme.accentSwatch }} />
                      </div>
                      <span className="text-[10px] text-center leading-tight text-foreground font-medium line-clamp-2">
                        {theme.name}
                      </span>
                      {settings.themeId === theme.id && (
                        <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Player color sync */}
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
                    Movie data is cached for 30 days to keep things fast. Use the button below to pull the latest new releases and trending titles right now.
                  </p>

                  {/* Last refreshed */}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {tmdbLastRefreshed
                      ? `Last updated: ${tmdbLastRefreshed}`
                      : 'Not yet fetched — will load on first visit to Discover'}
                    {tmdbStale && (
                      <span className="flex items-center gap-1 text-orange-400 ml-1">
                        <WifiOff className="w-2.5 h-2.5" />
                        Stale
                      </span>
                    )}
                  </div>

                  {/* Refresh button */}
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

              {/* ── 5. API Keys ── */}
              <div className="border-t border-border/50">
                <SectionHeader icon={KeyRound} label="API Keys" />
                <div className="px-4 pb-4 divide-y divide-border/30">
                  <ApiKeyField
                    label="OMDB"
                    description="Movie metadata (posters, ratings, plot). Get free key at omdbapi.com"
                    value={apiKeys.omdbApiKey}
                    onChange={v => setApiKeys(k => ({ ...k, omdbApiKey: v }))}
                    onTest={testOmdb}
                    placeholder="e.g. a1b2c3d4"
                  />
                  <ApiKeyField
                    label="TMDB"
                    description="Discover page, trending movies & TV. Get key at themoviedb.org"
                    value={apiKeys.tmdbApiKey}
                    onChange={v => setApiKeys(k => ({ ...k, tmdbApiKey: v }))}
                    onTest={testTmdb}
                    placeholder="Bearer token or v4 key"
                  />
                  <ApiKeyField
                    label="Google Gemini"
                    description="AI enrichment & chat assistant. Get key at aistudio.google.com"
                    value={apiKeys.googleAiApiKey}
                    onChange={v => setApiKeys(k => ({ ...k, googleAiApiKey: v }))}
                    onTest={testGemini}
                    placeholder="AIza…"
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
                      {apiKeysSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : apiKeysSaved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      {apiKeysSaving ? 'Saving…' : apiKeysSaved ? 'Saved!' : 'Save API Keys'}
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      Keys are stored in homestream-config.json on your server
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
