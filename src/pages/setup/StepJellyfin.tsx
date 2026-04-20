/**
 * Setup Step 4 — Jellyfin
 * Optional: connect to Jellyfin for TV app compatibility.
 */
import {
  Tv2, CheckCircle2, ChevronLeft, ChevronRight, Loader2,
  AlertCircle, RefreshCw, ExternalLink,
} from 'lucide-react';
import type { SetupStepProps } from './types';
import { apiPost } from './types';

export default function StepJellyfin({
  form, set, status, setStatus, onNext, onBack,
  jellyfinVersion, setJellyfinVersion,
  testError, setTestError,
}: SetupStepProps) {
  const testJellyfin = async () => {
    setStatus(s => ({ ...s, jellyfin: 'testing' }));
    setTestError('');
    try {
      await apiPost('save', { jellyfinUrl: form.jellyfinUrl, jellyfinApiKey: form.jellyfinApiKey });
      const result = await apiPost('test_jellyfin', { jellyfinUrl: form.jellyfinUrl, jellyfinApiKey: form.jellyfinApiKey }) as { ok: boolean; version?: string; error?: string };
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
    await apiPost('save', { jellyfinUrl: form.jellyfinUrl, jellyfinApiKey: form.jellyfinApiKey });
    setStatus(s => ({ ...s, jellyfin: 'skip' }));
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Tv2 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">Jellyfin</h2>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">OPTIONAL</span>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">FREE</span>
        </div>
        <p className="text-sm text-muted-foreground">Adds Jellyfin API compatibility so TV apps like Infuse, Swiftfin, and Kodi can connect to HomeStream.</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-start gap-2.5 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">HomeStream works fully without Jellyfin</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The HomeStream browser UI, phone remote, Chromecast, and DLNA casting all work without Jellyfin. You only need it if you want to use <strong className="text-foreground/70">Jellyfin client apps</strong> (Infuse, Swiftfin, Kodi, Emby Theater, etc.) on your TV or phone.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 p-3 bg-muted/30 border border-border rounded-xl">
          <Tv2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">Want to use a TV app?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Install Jellyfin (free, open-source) on the same machine as HomeStream. Then connect your TV app to HomeStream&apos;s address — it speaks Jellyfin&apos;s API natively.
              <br />
              <span className="text-[10px] mt-1 block">Recommended TV apps: <a href="https://infuse.video" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Infuse</a> (Apple TV/iOS) · <a href="https://github.com/jellyfin/Swiftfin" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Swiftfin</a> (iOS) · <a href="https://jellyfin.org/clients" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">All Jellyfin clients</a></span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-blue-400">Using Docker Compose?</strong> Jellyfin is at <code className="bg-muted px-1 rounded">http://jellyfin:8096</code>. Complete Jellyfin&apos;s first-run setup first, then get your API key from <strong>Dashboard → API Keys</strong>.
      </div>

      <div className="p-3 rounded-xl border border-border bg-muted/20 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-semibold text-foreground/80 mb-1.5">Don&apos;t have Jellyfin yet?</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>Download from <a href="https://jellyfin.org/downloads" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">jellyfin.org/downloads</a> and install</li>
          <li>Open <code className="bg-muted px-1 rounded">http://localhost:8096</code> and complete the first-run wizard</li>
          <li>Go to <strong>Dashboard → Advanced → API Keys</strong></li>
          <li>Click <strong>+</strong>, give it a name (e.g. &quot;HomeStream&quot;), copy the key</li>
          <li>Paste it in the API Key field above</li>
        </ol>
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
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={testJellyfin} disabled={status.jellyfin === 'testing'}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors disabled:opacity-60">
          {status.jellyfin === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Test
        </button>
        {status.jellyfin === 'ok' ? (
          <button onClick={onNext}
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
  );
}
