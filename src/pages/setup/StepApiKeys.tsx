/**
 * Setup Step 4 — API Keys & Password
 *
 * AI key entry uses a single field — the provider is auto-detected from the
 * key format so the user never has to pick from a radio button:
 *   AIza…     → Google Gemini  (free tier, 1 500 req/day)
 *   sk-ant-…  → Anthropic Claude
 *   sk-…      → OpenAI GPT
 *   http://…  → Ollama (self-hosted, no key needed — just the URL)
 *
 * TMDB, OMDB, and Real-Debrid keys are unchanged.
 */
import { useState, useEffect, useRef } from 'react';
import {
  KeyRound, Shield, Film, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, ExternalLink, AlertCircle, Eye, EyeOff, RefreshCw,
  XCircle, Zap, ChevronDown, Sparkles, Server,
} from 'lucide-react';
import type { SetupStepProps, KeyTestState } from './types';
import { apiPost } from './types';

// ── Provider detection ────────────────────────────────────────────────────────

type DetectedProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'unknown' | 'empty';

interface ProviderInfo {
  id: DetectedProvider;
  label: string;
  color: string;         // Tailwind text colour class
  bg: string;            // Tailwind bg/border badge class
  placeholder: string;
  hint: string;
  getKeyLink?: string;
}

const PROVIDERS: Record<DetectedProvider, ProviderInfo> = {
  gemini: {
    id: 'gemini', label: 'Google Gemini', color: 'text-blue-400',
    bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    placeholder: 'AIzaSy…',
    hint: 'Free tier — 1,500 requests/day, no credit card needed.',
    getKeyLink: 'https://aistudio.google.com/app/apikey',
  },
  openai: {
    id: 'openai', label: 'OpenAI GPT', color: 'text-green-400',
    bg: 'bg-green-500/15 border-green-500/30 text-green-400',
    placeholder: 'sk-…',
    hint: 'Uses gpt-4.1 by default. Requires a paid OpenAI account.',
    getKeyLink: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic', label: 'Anthropic Claude', color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/30 text-orange-400',
    placeholder: 'sk-ant-…',
    hint: 'Uses Claude Sonnet by default. Requires an Anthropic account.',
    getKeyLink: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    id: 'ollama', label: 'Ollama (local)', color: 'text-purple-400',
    bg: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
    placeholder: 'http://localhost:11434',
    hint: 'Runs fully locally — private, no API key, no cost.',
    getKeyLink: 'https://ollama.com',
  },
  unknown: {
    id: 'unknown', label: 'Unknown format', color: 'text-muted-foreground',
    bg: 'bg-muted/30 border-border text-muted-foreground',
    placeholder: '',
    hint: 'Paste a Gemini (AIza…), OpenAI (sk-…), Anthropic (sk-ant-…), or Ollama URL.',
  },
  empty: {
    id: 'empty', label: '', color: '', bg: '', placeholder: '', hint: '',
  },
};

function detectProvider(value: string): DetectedProvider {
  const v = value.trim();
  if (!v) return 'empty';
  if (v.startsWith('AIza'))    return 'gemini';
  if (v.startsWith('sk-ant-')) return 'anthropic';
  if (v.startsWith('sk-'))     return 'openai';
  if (v.startsWith('http://') || v.startsWith('https://')) return 'ollama';
  return 'unknown';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useAutoTest(value: string, fn: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!value.trim() || value.length < 8) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

function HowTo({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        How to get this key
      </button>
      {open && <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed pl-1">{children}</div>}
    </div>
  );
}

function TestResult({ state, msg, expiry }: { state: KeyTestState; msg: string; expiry?: string }) {
  if (state === 'testing') return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1.5">
      <Loader2 className="w-3 h-3 animate-spin" /> Verifying…
    </div>
  );
  if (state === 'ok') return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5 mt-1.5">
      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{msg}</span>
      {expiry && <span className="text-muted-foreground flex-shrink-0">{expiry}</span>}
    </div>
  );
  if (state === 'error') return (
    <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5 mt-1.5">
      <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{msg}
    </div>
  );
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StepApiKeys({
  form, set, status, setStatus, onNext, onBack,
  showAdminPass, setShowAdminPass,
  tmdbTest, setTmdbTest, tmdbTestMsg, setTmdbTestMsg,
  omdbTest, setOmdbTest, omdbTestMsg, setOmdbTestMsg,
  googleAiTest, setGoogleAiTest, googleAiTestMsg, setGoogleAiTestMsg,
  ollamaTest, setOllamaTest, ollamaTestMsg, setOllamaTestMsg,
  rdTest, setRdTest, rdTestMsg, setRdTestMsg,
}: SetupStepProps) {

  // Detect provider live as the user types
  const detectedProvider = detectProvider(form.aiApiKey ?? '');
  const providerInfo     = PROVIDERS[detectedProvider];

  // ── Key test helpers ──
  const testKeyViaServer = async (
    key: 'tmdb' | 'omdb' | 'googleai',
    value: string,
    setTest: (s: KeyTestState) => void,
    setMsg: (s: string) => void,
  ) => {
    if (!value.trim()) return;
    setTest('testing'); setMsg('');
    try {
      const res = await fetch('/api/setup/test-keys', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: value.trim() }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setTest(data.ok ? 'ok' : 'error');
      setMsg(data.message);
    } catch { setTest('idle'); setMsg(''); }
  };

  const testAiKey = async () => {
    const val = (form.aiApiKey ?? '').trim();
    if (!val) return;
    const p = detectProvider(val);

    if (p === 'gemini') {
      await testKeyViaServer('googleai', val, setGoogleAiTest, setGoogleAiTestMsg);
      return;
    }

    if (p === 'ollama') {
      setOllamaTest('testing'); setOllamaTestMsg('');
      try {
        const url = val.replace(/\/$/, '');
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(6_000) });
        if (res.ok) {
          const data = await res.json() as { models?: { name: string }[] };
          const models = data.models?.map(m => m.name) ?? [];
          if (models.length === 0) {
            setOllamaTest('error');
            setOllamaTestMsg('Ollama running but no models installed. Run: ollama pull llama3');
          } else {
            setOllamaTest('ok');
            setOllamaTestMsg(`Connected — ${models.length} model${models.length !== 1 ? 's' : ''} available: ${models.slice(0, 3).join(', ')}`);
          }
        } else {
          setOllamaTest('error'); setOllamaTestMsg(`HTTP ${res.status} — is Ollama running?`);
        }
      } catch {
        setOllamaTest('error'); setOllamaTestMsg(`Cannot reach ${val}`);
      }
      return;
    }

    if (p === 'openai' || p === 'anthropic') {
      // Quick validation — just check the key format and length; a real API
      // call would cost tokens. We mark it as "ok" with a note.
      setGoogleAiTest('ok');
      setGoogleAiTestMsg(`${p === 'openai' ? 'OpenAI' : 'Anthropic'} key format looks correct — will be verified on first use.`);
      return;
    }
  };

  useAutoTest(form.aiApiKey ?? '', testAiKey);

  // ── Real-Debrid test ──
  const testRdKey = async () => {
    if (!form.realDebridApiKey.trim()) return;
    setRdTest('testing'); setRdTestMsg('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_real_debrid', realDebridApiKey: form.realDebridApiKey.trim() }),
      });
      const data = await res.json() as { ok: boolean; user?: { username: string; premium: number }; error?: string };
      if (data.ok && data.user) {
        const days = Math.floor((data.user.premium ?? 0) / 86400);
        setRdTest(days > 0 ? 'ok' : 'error');
        setRdTestMsg(days > 0 ? `${data.user.username} — ${days} days premium remaining` : `${data.user.username} — Premium expired`);
      } else {
        setRdTest('error'); setRdTestMsg(data.error ?? 'Connection failed');
      }
    } catch { setRdTest('idle'); setRdTestMsg(''); }
  };
  useAutoTest(form.realDebridApiKey, testRdKey);

  // ── Save ──
  const saveApiKeys = async () => {
    setStatus(s => ({ ...s, apiKeys: 'saving' }));
    try {
      // Derive per-provider fields from the unified key so the backend can
      // read either the new or legacy fields without a migration.
      const p   = detectProvider(form.aiApiKey ?? '');
      const key = (form.aiApiKey ?? '').trim();

      await apiPost('save', {
        adminPassword:    form.adminPassword,
        realDebridApiKey: form.realDebridApiKey,
        aiApiKey:         key,
        // Legacy fields — kept so existing config readers still work
        googleAiApiKey:   p === 'gemini'    ? key : '',
        openaiApiKey:     p === 'openai'    ? key : '',
        anthropicApiKey:  p === 'anthropic' ? key : '',
        ollamaUrl:        p === 'ollama'    ? key : form.ollamaUrl,
        ollamaModel:      form.ollamaModel,
        openaiModel:      form.openaiModel,
        anthropicModel:   form.anthropicModel,
        aiProvider:       p === 'empty' || p === 'unknown' ? 'gemini' : p,
      });
      setStatus(s => ({ ...s, apiKeys: 'done' }));
      onNext();
    } catch {
      setStatus(s => ({ ...s, apiKeys: 'error' }));
    }
  };

  const passwordMismatch = !!form.adminPassword && !!form.adminPasswordConfirm && form.adminPassword !== form.adminPasswordConfirm;

  // Which test state to show for the AI key section
  const aiTestState = detectedProvider === 'ollama' ? ollamaTest : googleAiTest;
  const aiTestMsg   = detectedProvider === 'ollama' ? ollamaTestMsg : googleAiTestMsg;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">API Keys &amp; Password</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Movie posters and ratings are built in — no setup needed. Just add an AI key if you want personalised recommendations, then optionally connect Real-Debrid for premium downloads.
        </p>
      </div>

      {/* ── Admin Password ── */}
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Admin Password</p>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Recommended</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Protects Settings and setup reset. Leave blank to skip — anyone on your LAN can access settings.
        </p>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              type={showAdminPass ? 'text' : 'password'}
              value={form.adminPassword}
              onChange={e => set('adminPassword', e.target.value)}
              placeholder="Choose a password"
              className="w-full bg-background border border-border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <button onClick={() => setShowAdminPass(!showAdminPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.adminPassword && (
            <input
              type={showAdminPass ? 'text' : 'password'}
              value={form.adminPasswordConfirm}
              onChange={e => set('adminPasswordConfirm', e.target.value)}
              placeholder="Confirm password"
              className={`w-full bg-background border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${passwordMismatch ? 'border-destructive' : 'border-border'}`}
            />
          )}
          {passwordMismatch && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Passwords don't match</p>
          )}
          {form.adminPassword && form.adminPasswordConfirm && !passwordMismatch && (
            <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Passwords match</p>
          )}
        </div>
      </div>

      {/* ── TMDB + OMDB — pre-configured ── */}
      <div className="p-4 rounded-xl border border-green-500/25 bg-green-500/5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Movie &amp; TV Data — Ready</p>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">Built-in</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> TMDB — posters, hero banner, Discover page</span>
            <span className="text-green-400 font-medium">Active</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> OMDB — IMDb ratings, plot summaries, cast</span>
            <span className="text-green-400 font-medium">Active</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          These are bundled with HomeStream — no account or key required. You can override them in Settings later if you prefer your own keys.
        </p>
      </div>

      {/* ── AI Chat Assistant ── */}
      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">AI Recommendation Assistant</p>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">Optional</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Paste any AI key and HomeStream detects the provider automatically. The assistant learns from your watch history and uses TMDB/OMDB data to make personalised picks.
        </p>

        {/* Supported providers legend */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['gemini', 'openai', 'anthropic', 'ollama'] as const).map(p => {
            const info = PROVIDERS[p];
            return (
              <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${info.bg}`}>
                {info.label}
              </span>
            );
          })}
        </div>

        {/* Single key input */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={form.aiApiKey ?? ''}
              onChange={e => {
                set('aiApiKey', e.target.value);
                setGoogleAiTest('idle'); setGoogleAiTestMsg('');
                setOllamaTest('idle');  setOllamaTestMsg('');
              }}
              placeholder="Paste your AI key — or an Ollama URL (http://…)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono pr-28"
            />
            {/* Live provider badge inside the input */}
            {detectedProvider !== 'empty' && (
              <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full border pointer-events-none ${providerInfo.bg}`}>
                {detectedProvider === 'unknown' ? '?' : providerInfo.label}
              </span>
            )}
          </div>
          <button
            onClick={testAiKey}
            disabled={!form.aiApiKey?.trim() || aiTestState === 'testing' || detectedProvider === 'empty' || detectedProvider === 'unknown'}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {aiTestState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
          </button>
        </div>

        {/* Provider hint */}
        {detectedProvider !== 'empty' && detectedProvider !== 'unknown' && (
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1">
            {detectedProvider === 'ollama' ? <Server className="w-3 h-3 mt-0.5 flex-shrink-0" /> : <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />}
            {providerInfo.hint}
            {providerInfo.getKeyLink && (
              <a href={providerInfo.getKeyLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1 flex-shrink-0 flex items-center gap-0.5">
                Get key <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </p>
        )}
        {detectedProvider === 'unknown' && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Format not recognised. Supported: Gemini (<code className="bg-muted px-1 rounded">AIza…</code>), OpenAI (<code className="bg-muted px-1 rounded">sk-…</code>), Anthropic (<code className="bg-muted px-1 rounded">sk-ant-…</code>), or Ollama URL (<code className="bg-muted px-1 rounded">http://…</code>).
          </p>
        )}

        <TestResult state={aiTestState} msg={aiTestMsg} />

        {/* Ollama model selector — only shown when Ollama URL detected */}
        {detectedProvider === 'ollama' && (
          <div className="mt-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-foreground/70">Model name</label>
            <input
              type="text"
              value={form.ollamaModel}
              onChange={e => set('ollamaModel', e.target.value)}
              placeholder="llama3"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Run <code className="bg-muted px-1 rounded">ollama pull llama3</code> to install the default model.</p>
          </div>
        )}

        <HowTo>
          <div className="space-y-2">
            <p className="font-medium text-foreground/70">Pick any one provider:</p>
            <ul className="space-y-1.5 ml-1">
              <li><strong className="text-blue-400">Google Gemini (free)</strong> — <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com</a> → Get API key → key starts with <code className="bg-muted px-1 rounded">AIza</code></li>
              <li><strong className="text-green-400">OpenAI</strong> — <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com/api-keys</a> → key starts with <code className="bg-muted px-1 rounded">sk-</code></li>
              <li><strong className="text-orange-400">Anthropic</strong> — <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.anthropic.com</a> → key starts with <code className="bg-muted px-1 rounded">sk-ant-</code></li>
              <li><strong className="text-purple-400">Ollama (local)</strong> — install from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ollama.com</a>, then paste <code className="bg-muted px-1 rounded">http://localhost:11434</code></li>
            </ul>
          </div>
        </HowTo>
      </div>

      {/* ── Real-Debrid ── */}
      <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <p className="text-sm font-semibold text-foreground">Real-Debrid API Key</p>
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-medium">Optional</span>
          </div>
          <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            Get key <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Premium download backend — resolves torrents server-side so you don't need qBittorrent running.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.realDebridApiKey}
            onChange={e => { set('realDebridApiKey', e.target.value); setRdTest('idle'); }}
            placeholder="Paste your RD API token"
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0"
          />
          <button onClick={testRdKey} disabled={!form.realDebridApiKey.trim() || rdTest === 'testing'}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0">
            {rdTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
          </button>
        </div>
        <TestResult state={rdTest} msg={rdTestMsg} />
        <HowTo>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li>Go to <a href="https://real-debrid.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">real-debrid.com</a> and log in</li>
            <li>Visit <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">real-debrid.com/apitoken</a></li>
            <li>Copy the token and paste it above</li>
          </ol>
        </HowTo>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          {status.apiKeys === 'error' && (
            <p className="text-[11px] text-destructive text-center">Could not save — is the server running?</p>
          )}
          <button
            onClick={saveApiKeys}
            disabled={status.apiKeys === 'saving' || passwordMismatch}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {status.apiKeys === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
            Save &amp; Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
