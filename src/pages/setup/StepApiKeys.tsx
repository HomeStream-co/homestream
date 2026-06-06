/**
 * Setup Step 4 — API Keys
 * Admin password + TMDB / OMDB / Google AI / Real-Debrid keys.
 * How-to instructions are collapsed by default to reduce visual noise.
 * Keys are auto-tested 800ms after the user stops typing.
 */
import { useState, useEffect, useRef } from 'react';
import {
  KeyRound, Shield, Film, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, ExternalLink, AlertCircle, Eye, EyeOff, RefreshCw,
  XCircle, Zap, ScanSearch, ChevronDown,
} from 'lucide-react';
import type { SetupStepProps, KeyTestState } from './types';
import { apiPost } from './types';

/** Debounced auto-test hook — fires `fn` 800ms after `value` stops changing */
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

/** Collapsible "How to get this key" section */
function HowTo({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        How to get this key
      </button>
      {open && (
        <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

/** Inline test result badge */
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

export default function StepApiKeys({
  form, set, status, setStatus, onNext, onBack,
  showAdminPass, setShowAdminPass,
  tmdbTest, setTmdbTest, tmdbTestMsg, setTmdbTestMsg,
  omdbTest, setOmdbTest, omdbTestMsg, setOmdbTestMsg,
  googleAiTest, setGoogleAiTest, googleAiTestMsg, setGoogleAiTestMsg,
  ollamaTest, setOllamaTest, ollamaTestMsg, setOllamaTestMsg,
  rdTest, setRdTest, rdTestMsg, setRdTestMsg,
}: SetupStepProps) {

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
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: value.trim() }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setTest(data.ok ? 'ok' : 'error');
      setMsg(data.message);
    } catch {
      setTest('idle'); setMsg('');
    }
  };

  const testTmdbKey     = () => testKeyViaServer('tmdb',     form.tmdbApiKey,     setTmdbTest,     setTmdbTestMsg);
  const testOmdbKey     = () => testKeyViaServer('omdb',     form.omdbApiKey,     setOmdbTest,     setOmdbTestMsg);
  const testGoogleAiKey = () => testKeyViaServer('googleai', form.googleAiApiKey, setGoogleAiTest, setGoogleAiTestMsg);

  // Auto-test on paste / typing
  useAutoTest(form.tmdbApiKey,     testTmdbKey);
  useAutoTest(form.omdbApiKey,     testOmdbKey);
  useAutoTest(form.googleAiApiKey, testGoogleAiKey);

  const testRdKey = async () => {
    if (!form.realDebridApiKey.trim()) return;
    setRdTest('testing'); setRdTestMsg('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const testOllamaConnection = async () => {
    if (!form.ollamaUrl.trim()) return;
    setOllamaTest('testing'); setOllamaTestMsg('');
    try {
      const res = await fetch(`${form.ollamaUrl.trim()}/api/tags`, { signal: AbortSignal.timeout(6_000) });
      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        const models = data.models?.map(m => m.name) ?? [];
        const installed = models.some(n => n.startsWith(form.ollamaModel.trim()));
        if (models.length === 0) { setOllamaTest('error'); setOllamaTestMsg('Ollama running but no models installed. Run: ollama pull ' + (form.ollamaModel || 'llama3')); }
        else if (!installed) { setOllamaTest('error'); setOllamaTestMsg(`Connected! But "${form.ollamaModel}" not found. Available: ${models.slice(0, 3).join(', ')}`); }
        else { setOllamaTest('ok'); setOllamaTestMsg(`Connected — "${form.ollamaModel}" is ready`); }
      } else { setOllamaTest('error'); setOllamaTestMsg(`HTTP ${res.status} — is Ollama running?`); }
    } catch { setOllamaTest('error'); setOllamaTestMsg(`Cannot reach ${form.ollamaUrl}`); }
  };

  const saveApiKeys = async () => {
    setStatus(s => ({ ...s, apiKeys: 'saving' }));
    try {
      await apiPost('save', {
        adminPassword: form.adminPassword,
        omdbApiKey: form.omdbApiKey,
        googleAiApiKey: form.googleAiApiKey,
        tmdbApiKey: form.tmdbApiKey,
        realDebridApiKey: form.realDebridApiKey,
        aiProvider: form.aiProvider,
        ollamaUrl: form.ollamaUrl,
        ollamaModel: form.ollamaModel,
      });
      setStatus(s => ({ ...s, apiKeys: 'done' }));
      onNext();
    } catch {
      setStatus(s => ({ ...s, apiKeys: 'error' }));
    }
  };

  const passwordMismatch = !!form.adminPassword && !!form.adminPasswordConfirm && form.adminPassword !== form.adminPasswordConfirm;

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
          All optional — HomeStream works without them. Keys unlock posters, ratings, and AI features.
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
            <div className="relative">
              <input
                type={showAdminPass ? 'text' : 'password'}
                value={form.adminPasswordConfirm}
                onChange={e => set('adminPasswordConfirm', e.target.value)}
                placeholder="Confirm password"
                className={`w-full bg-background border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${passwordMismatch ? 'border-destructive' : 'border-border'}`}
              />
            </div>
          )}
          {passwordMismatch && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Passwords don't match</p>
          )}
          {form.adminPassword && form.adminPasswordConfirm && !passwordMismatch && (
            <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Passwords match</p>
          )}
        </div>
      </div>

      {/* ── TMDB ── */}
      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">TMDB API Key</p>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">Recommended</span>
          </div>
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            Get free key <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Powers the hero banner, Discover page, and personalised recommendations. Free TMDB account required.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.tmdbApiKey}
            onChange={e => { set('tmdbApiKey', e.target.value); setTmdbTest('idle'); }}
            placeholder="eyJhbGciOiJSUzI1NiJ9… (v4 read access token)"
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0"
          />
          <button
            onClick={testTmdbKey}
            disabled={!form.tmdbApiKey.trim() || tmdbTest === 'testing'}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {tmdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
          </button>
        </div>
        <TestResult state={tmdbTest} msg={tmdbTestMsg} expiry="Valid ~365 days" />
        <HowTo>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li>Go to <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">themoviedb.org/signup</a> — free account</li>
            <li>Visit <strong>Settings → API</strong> and click <strong>Create</strong></li>
            <li>Choose <strong>Developer</strong>, fill in any app name/URL</li>
            <li>Copy the <strong>API Read Access Token (v4)</strong> — starts with <code className="bg-muted px-1 rounded">eyJ…</code></li>
          </ol>
        </HowTo>
      </div>

      {/* ── OMDB ── */}
      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">OMDB API Key</p>
          </div>
          <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            Get free key <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground mb-2">IMDb ratings, plot summaries, and movie posters for your local files.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.omdbApiKey}
            onChange={e => { set('omdbApiKey', e.target.value); setOmdbTest('idle'); }}
            placeholder="xxxxxxxx"
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0"
          />
          <button
            onClick={testOmdbKey}
            disabled={!form.omdbApiKey.trim() || omdbTest === 'testing'}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {omdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
          </button>
        </div>
        <TestResult state={omdbTest} msg={omdbTestMsg} expiry="Valid ~365 days" />
        <HowTo>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li>Go to <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">omdbapi.com/apikey.aspx</a></li>
            <li>Select <strong>FREE! (1,000 daily limit)</strong> and enter your email</li>
            <li>Check your email for the activation link and click it</li>
            <li>Your 8-character key will be shown — paste it above</li>
          </ol>
        </HowTo>
      </div>

      {/* ── AI Chat ── */}
      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">AI Chat Assistant</p>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">Free</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Movie recommendations, mood matching, and watch suggestions.</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['gemini', 'ollama'] as const).map(provider => (
            <button
              key={provider}
              onClick={() => { set('aiProvider', provider); setGoogleAiTest('idle'); setOllamaTest('idle'); }}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${form.aiProvider === provider ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-muted-foreground'}`}
            >
              <div className="flex items-center gap-1.5 w-full">
                {provider === 'gemini' ? <Film className="w-3.5 h-3.5 flex-shrink-0" /> : <ScanSearch className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="text-xs font-semibold">{provider === 'gemini' ? 'Google Gemini' : 'Ollama (Local)'}</span>
                {form.aiProvider === provider && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
              </div>
              <span className="text-[10px] leading-tight">
                {provider === 'gemini' ? 'Cloud API — free tier, no install' : 'Runs locally — fully private, no API key'}
              </span>
            </button>
          ))}
        </div>

        {form.aiProvider === 'gemini' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground/80">Google AI API Key</p>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Get free key <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.googleAiApiKey}
                onChange={e => { set('googleAiApiKey', e.target.value); setGoogleAiTest('idle'); }}
                placeholder="AIzaSy…"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0"
              />
              <button
                onClick={testGoogleAiKey}
                disabled={!form.googleAiApiKey.trim() || googleAiTest === 'testing'}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {googleAiTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
              </button>
            </div>
            <TestResult state={googleAiTest} msg={googleAiTestMsg} expiry="Valid ~90 days" />
            <HowTo>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Go to <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com</a> and sign in with Google</li>
                <li>Click <strong>Get API key</strong> → <strong>Create API key</strong></li>
                <li>Copy the key — starts with <code className="bg-muted px-1 rounded">AIzaSy…</code></li>
                <li>Free tier: 1,500 requests/day, no credit card needed</li>
              </ol>
            </HowTo>
          </div>
        )}

        {form.aiProvider === 'ollama' && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed">
              <strong>Ollama</strong> runs AI locally — free, private, no API key.
              Install from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a>, then run{' '}
              <code className="bg-black/30 px-1 rounded">ollama pull llama3</code>.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-foreground/70 block mb-1">Ollama URL</label>
                <input type="text" value={form.ollamaUrl} onChange={e => { set('ollamaUrl', e.target.value); setOllamaTest('idle'); }}
                  placeholder="http://localhost:11434"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-foreground/70 block mb-1">Model</label>
                <input type="text" value={form.ollamaModel} onChange={e => { set('ollamaModel', e.target.value); setOllamaTest('idle'); }}
                  placeholder="llama3"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
              </div>
            </div>
            <button onClick={testOllamaConnection} disabled={!form.ollamaUrl.trim() || ollamaTest === 'testing'}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40">
              {ollamaTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test Ollama
            </button>
            <TestResult state={ollamaTest} msg={ollamaTestMsg} />
          </div>
        )}
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
          <button
            onClick={testRdKey}
            disabled={!form.realDebridApiKey.trim() || rdTest === 'testing'}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
          >
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
