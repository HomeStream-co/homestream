/**
 * Setup Step 3 — qBittorrent
 * Optional: connect to qBittorrent Web UI for in-app downloading.
 */
import {
  Wifi, CheckCircle2, ChevronLeft, ChevronRight, Loader2,
  AlertCircle, Eye, EyeOff, RefreshCw, ExternalLink,
} from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

export default function StepQBittorrent({
  form, set, status, setStatus, onNext, onBack,
  showQbitPass, setShowQbitPass,
  qbitVersion, setQbitVersion,
  testError, setTestError,
}: SetupStepProps) {
  const testQbit = async () => {
    setStatus(s => ({ ...s, qbit: 'testing' }));
    setTestError('');
    try {
      await apiPost('save', { qbitUrl: form.qbitUrl, qbitUsername: form.qbitUsername, qbitPassword: form.qbitPassword });
      const result = await apiPost('test_qbit', { qbitUrl: form.qbitUrl, qbitUsername: form.qbitUsername, qbitPassword: form.qbitPassword }) as { ok: boolean; version?: string; error?: string };
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
    await apiPost('save', { qbitUrl: form.qbitUrl, qbitUsername: form.qbitUsername, qbitPassword: form.qbitPassword });
    setStatus(s => ({ ...s, qbit: 'skip' }));
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wifi className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">qBittorrent</h2>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">OPTIONAL</span>
        </div>
        <p className="text-sm text-muted-foreground">Connect to qBittorrent for in-app downloading with full BitTorrent swarm access.</p>
      </div>

      <div className="flex items-start gap-2.5 p-3 bg-muted/30 border border-dashed border-border rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-foreground mb-0.5">Works fine without qBittorrent</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            HomeStream will still play any video files already in your media folder. You just won&apos;t have the in-app download button — you can always add qBittorrent later in <strong>Settings → Downloads</strong>.
          </p>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-blue-400">Using Docker Compose?</strong> qBittorrent is already running at <code className="bg-muted px-1 rounded">http://qbittorrent:8080</code>. Default login: <code className="bg-muted px-1 rounded">admin / homestream</code>
      </div>

      <div className="p-3 rounded-xl border border-border bg-muted/20 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-semibold text-foreground/80 mb-1.5">Don&apos;t have qBittorrent yet?</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>Download from <a href="https://www.qbittorrent.org/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">qbittorrent.org/download</a> and install</li>
          <li>Open qBittorrent → <strong>Tools → Preferences → Web UI</strong></li>
          <li>Check <strong>Enable the Web User Interface</strong>, set a port (default 8080)</li>
          <li>Set a username and password, click <strong>Apply</strong></li>
          <li>Enter that URL and credentials above</li>
        </ol>
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
              <button onClick={() => setShowQbitPass(!showQbitPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showQbitPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

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
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={testQbit} disabled={status.qbit === 'testing'}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors disabled:opacity-60">
          {status.qbit === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Test
        </button>
        {status.qbit === 'ok' ? (
          <button onClick={onNext}
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
  );
}
