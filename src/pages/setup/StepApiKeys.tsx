/**
 * Setup Step 6 — API Keys
 * Optional: TMDB, OMDB, Google AI / Ollama, and admin password.
 */
import {
  KeyRound, Shield, Film, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, ExternalLink, AlertCircle, Eye, EyeOff, RefreshCw,
  XCircle, Zap, ScanSearch,
} from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

export default function StepApiKeys({
  form, set, status, setStatus, onNext, onBack,
  showAdminPass, setShowAdminPass,
  tmdbTest, setTmdbTest, tmdbTestMsg, setTmdbTestMsg,
  omdbTest, setOmdbTest, omdbTestMsg, setOmdbTestMsg,
  googleAiTest, setGoogleAiTest, googleAiTestMsg, setGoogleAiTestMsg,
  ollamaTest, setOllamaTest, ollamaTestMsg, setOllamaTestMsg,
}: SetupStepProps) {
  const testTmdbKey = async () => {
    if (!form.tmdbApiKey.trim()) return;
    setTmdbTest('testing'); setTmdbTestMsg('');
    try {
      const res = await fetch('https://api.themoviedb.org/3/configuration', { headers: { Authorization: `Bearer ${form.tmdbApiKey.trim()}` } });
      if (res.ok) { setTmdbTest('ok'); setTmdbTestMsg('Key is valid — TMDB connected!'); }
      else { const b = await res.json() as { status_message?: string }; setTmdbTest('error'); setTmdbTestMsg(b.status_message ?? `HTTP ${res.status}`); }
    } catch { setTmdbTest('error'); setTmdbTestMsg('Network error — check your connection'); }
  };

  const testOmdbKey = async () => {
    if (!form.omdbApiKey.trim()) return;
    setOmdbTest('testing'); setOmdbTestMsg('');
    try {
      const res = await fetch(`https://www.omdbapi.com/?apikey=${form.omdbApiKey.trim()}&t=inception`);
      const b = await res.json() as { Response: string; Error?: string; Title?: string };
      if (b.Response === 'True') { setOmdbTest('ok'); setOmdbTestMsg(`Key is valid — fetched "${b.Title}" successfully`); }
      else { setOmdbTest('error'); setOmdbTestMsg(b.Error ?? 'Invalid key'); }
    } catch { setOmdbTest('error'); setOmdbTestMsg('Network error — check your connection'); }
  };

  const testGoogleAiKey = async () => {
    if (!form.googleAiApiKey.trim()) return;
    setGoogleAiTest('testing'); setGoogleAiTestMsg('');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${form.googleAiApiKey.trim()}`);
      if (res.ok) { setGoogleAiTest('ok'); setGoogleAiTestMsg('Key is valid — Gemini API connected!'); }
      else { const b = await res.json() as { error?: { message?: string } }; setGoogleAiTest('error'); setGoogleAiTestMsg(b.error?.message ?? `HTTP ${res.status}`); }
    } catch { setGoogleAiTest('error'); setGoogleAiTestMsg('Network error — check your connection'); }
  };

  const testOllamaConnection = async () => {
    if (!form.ollamaUrl.trim()) return;
    setOllamaTest('testing'); setOllamaTestMsg('');
    try {
      const res = await fetch(`${form.ollamaUrl.trim()}/api/tags`, { signal: AbortSignal.timeout(6_000) });
      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        const models = data.models?.map(m => m.name) ?? [];
        const installed = models.some(n => n.startsWith(form.ollamaModel.trim()));
        if (models.length === 0) { setOllamaTest('error'); setOllamaTestMsg('Ollama is running but no models are installed. Run: ollama pull ' + (form.ollamaModel || 'llama3')); }
        else if (!installed) { setOllamaTest('error'); setOllamaTestMsg(`Connected! But "${form.ollamaModel}" not found. Available: ${models.slice(0, 3).join(', ')}`); }
        else { setOllamaTest('ok'); setOllamaTestMsg(`Connected! "${form.ollamaModel}" is ready.`); }
      } else { setOllamaTest('error'); setOllamaTestMsg(`HTTP ${res.status} — is Ollama running?`); }
    } catch { setOllamaTest('error'); setOllamaTestMsg(`Cannot reach ${form.ollamaUrl} — make sure Ollama is running`); }
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
    onNext();
  };

  const passwordMismatch = !!form.adminPassword && !!form.adminPasswordConfirm && form.adminPassword !== form.adminPasswordConfirm;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">API Keys</h2>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">ALL OPTIONAL</span>
        </div>
        <p className="text-sm text-muted-foreground">All optional — HomeStream works without them, but they unlock richer features.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <p className="font-semibold text-green-400 mb-1">✓ Always works</p>
          <ul className="text-muted-foreground space-y-0.5">
            <li>Video playback</li><li>Subtitles &amp; audio tracks</li>
            <li>Watch progress &amp; history</li><li>Phone remote &amp; Chromecast</li>
            <li>HLS transcoding</li>
          </ul>
        </div>
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
          <p className="font-semibold text-foreground/70 mb-1">+ Unlocked by keys</p>
          <ul className="text-muted-foreground space-y-0.5">
            <li>Movie posters &amp; backdrops</li><li>IMDb ratings &amp; plot</li>
            <li>Trending &amp; upcoming</li><li>AI recommendations</li>
            <li>Auto-enrichment</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Admin password */}
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Admin Password</p>
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Recommended</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Protects the Settings panel and setup reset. Leave blank to skip (anyone on your LAN can access settings).</p>
          <div className="flex flex-col gap-2">
            <div className="relative">
              <input type={showAdminPass ? 'text' : 'password'} value={form.adminPassword}
                onChange={e => set('adminPassword', e.target.value)} placeholder="Enter a password"
                className="w-full bg-background border border-border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              <button onClick={() => setShowAdminPass(!showAdminPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.adminPassword && (
              <div className="relative">
                <input type={showAdminPass ? 'text' : 'password'} value={form.adminPasswordConfirm}
                  onChange={e => set('adminPasswordConfirm', e.target.value)} placeholder="Confirm password"
                  className={`w-full bg-background border rounded-lg px-3 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary ${passwordMismatch ? 'border-destructive' : 'border-border'}`} />
              </div>
            )}
            {passwordMismatch && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Passwords don&apos;t match</p>}
            {form.adminPassword && form.adminPasswordConfirm && !passwordMismatch && (
              <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Passwords match</p>
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
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">Get free key <ExternalLink className="w-2.5 h-2.5" /></a>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Powers the hero banner, Discover page, and personalised recommendations. Free — just create a TMDB account.</p>
          <div className="flex gap-2">
            <input type="text" value={form.tmdbApiKey} onChange={e => { set('tmdbApiKey', e.target.value); setTmdbTest('idle'); }}
              placeholder="eyJhbGciOiJSUzI1NiJ9…  (v4 read access token)"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
            <button onClick={testTmdbKey} disabled={!form.tmdbApiKey.trim() || tmdbTest === 'testing'}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0">
              {tmdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
            </button>
          </div>
          {tmdbTest === 'ok' && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5"><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{tmdbTestMsg}</div>}
          {tmdbTest === 'error' && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5"><XCircle className="w-3.5 h-3.5 flex-shrink-0" />{tmdbTestMsg}</div>}
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
            <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">Get free key <ExternalLink className="w-2.5 h-2.5" /></a>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Movie posters, plot summaries, IMDb ratings</p>
          <div className="flex gap-2">
            <input type="text" value={form.omdbApiKey} onChange={e => { set('omdbApiKey', e.target.value); setOmdbTest('idle'); }}
              placeholder="xxxxxxxx"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
            <button onClick={testOmdbKey} disabled={!form.omdbApiKey.trim() || omdbTest === 'testing'}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0">
              {omdbTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
            </button>
          </div>
          {omdbTest === 'ok' && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5"><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{omdbTestMsg}</div>}
          {omdbTest === 'error' && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5"><XCircle className="w-3.5 h-3.5 flex-shrink-0" />{omdbTestMsg}</div>}
          <div className="mt-2 flex flex-col gap-1 text-[10px] text-muted-foreground">
            <p className="font-medium text-foreground/70">How to get your key:</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Go to <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">omdbapi.com/apikey.aspx</a></li>
              <li>Select <strong>FREE! (1,000 daily limit)</strong> and enter your email</li>
              <li>Check your email for the activation link and click it</li>
              <li>Your 8-character key will be shown — paste it above</li>
            </ol>
          </div>
        </div>

        {/* AI Chat */}
        <div className="p-4 rounded-xl border border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">AI Chat Assistant</p>
            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">100% Free</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Powers the &quot;Ask AI&quot; chat — movie recommendations, mood matching, and watch suggestions.</p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['gemini', 'ollama'] as const).map(provider => (
              <button key={provider} onClick={() => { set('aiProvider', provider); setGoogleAiTest('idle'); setOllamaTest('idle'); }}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${form.aiProvider === provider ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-muted-foreground'}`}>
                <div className="flex items-center gap-1.5 w-full">
                  {provider === 'gemini' ? <Film className="w-3.5 h-3.5 flex-shrink-0" /> : <ScanSearch className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="text-xs font-semibold">{provider === 'gemini' ? 'Google Gemini' : 'Ollama (Local)'}</span>
                  {form.aiProvider === provider && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
                </div>
                <span className="text-[10px] leading-tight">{provider === 'gemini' ? 'Cloud API — free tier, no install needed' : 'Runs on your machine — fully private, no API key'}</span>
              </button>
            ))}
          </div>

          {form.aiProvider === 'gemini' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground/80">Google AI API Key</p>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">Get free key <ExternalLink className="w-2.5 h-2.5" /></a>
              </div>
              <div className="flex gap-2">
                <input type="text" value={form.googleAiApiKey} onChange={e => { set('googleAiApiKey', e.target.value); setGoogleAiTest('idle'); }}
                  placeholder="AIzaSy…"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0" />
                <button onClick={testGoogleAiKey} disabled={!form.googleAiApiKey.trim() || googleAiTest === 'testing'}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0">
                  {googleAiTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
                </button>
              </div>
              {googleAiTest === 'ok' && <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5"><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{googleAiTestMsg}</div>}
              {googleAiTest === 'error' && <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5"><XCircle className="w-3.5 h-3.5 flex-shrink-0" />{googleAiTestMsg}</div>}
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
              <button onClick={testOllamaConnection} disabled={!form.ollamaUrl.trim() || ollamaTest === 'testing'}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40">
                {ollamaTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test Ollama Connection
              </button>
              {ollamaTest === 'ok' && <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5"><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{ollamaTestMsg}</div>}
              {ollamaTest === 'error' && <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5"><XCircle className="w-3.5 h-3.5 flex-shrink-0" />{ollamaTestMsg}</div>}
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
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={saveApiKeys} disabled={status.apiKeys === 'saving' || passwordMismatch}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          {status.apiKeys === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          Save &amp; Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
