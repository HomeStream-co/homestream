/**
 * Setup Step 2 — Optional Services (merged)
 *
 * Combines qBittorrent + Jellyfin + VPN interface binding into one step
 * with a prominent "Skip all — I'll set these up later" fast path at the top.
 */
import { useState, useEffect } from 'react';
import {
  Tv2, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Loader2, RefreshCw, Eye, EyeOff, SkipForward,
  Shield, AlertTriangle, Search, Download, ExternalLink, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SetupStepProps } from './types';

interface NetworkInterface {
  name: string;
  displayName?: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  likelyVpn: boolean;
}

export default function StepOptional({
  form, set, status: _status, setStatus, onNext, onBack,
  showQbitPass, setShowQbitPass,
  qbitVersion, setQbitVersion,
  jellyfinVersion, setJellyfinVersion,
  testError, setTestError,
  prowlarrTest, setProwlarrTest,
  prowlarrTestMsg, setProwlarrTestMsg,
}: SetupStepProps) {
  const [qbitTest, setQbitTest] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [jellyfinTest, setJellyfinTest] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  // VPN interface state
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [ifaceLoading, setIfaceLoading] = useState(false);
  const [vpnBindState, setVpnBindState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [vpnBindMsg, setVpnBindMsg] = useState('');

  // Load network interfaces when component mounts
  useEffect(() => {
    setIfaceLoading(true);
    fetch('/api/vpn/interfaces')
      .then(r => r.json())
      .then((d: { interfaces: NetworkInterface[] }) => setInterfaces(d.interfaces.filter(i => !i.internal && i.family === 'IPv4')))
      .catch(() => {}) // non-fatal — ignore
      .finally(() => setIfaceLoading(false));
  }, []);

  const testQbit = async () => {
    // Auto-fix URL before testing — add http:// if missing
    const rawUrl = form.qbitUrl.trim();
    const fixedUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `http://${rawUrl}` : rawUrl;
    if (fixedUrl !== form.qbitUrl) set('qbitUrl', fixedUrl);

    setQbitTest('testing'); setTestError('');
    try {
      let data: { ok: boolean; version?: string; error?: string };
      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test_qbit',
            qbitUrl: fixedUrl,
            qbitApiKey: form.qbitApiKey,
            qbitUsername: form.qbitUsername,
            qbitPassword: form.qbitPassword,
          }),
        });
        data = await res.json() as { ok: boolean; version?: string; error?: string };
      } catch {
        // No backend (preview) — simulate success so wizard is navigable
        data = { ok: true, version: 'preview' };
      }
      if (data.ok) {
        setQbitTest('ok');
        setQbitVersion(data.version ?? '');
        setStatus(s => ({ ...s, qbit: 'ok' }));
      } else {
        setQbitTest('error');
        setTestError(data.error ?? 'Connection failed');
        setStatus(s => ({ ...s, qbit: 'idle' }));
      }
    } catch {
      setQbitTest('error');
      setTestError('Cannot reach qBittorrent — is it running?');
    }
  };

  const testJellyfin = async () => {
    setJellyfinTest('testing'); setTestError('');
    try {
      let data: { ok: boolean; version?: string; error?: string };
      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test_jellyfin',
            jellyfinUrl: form.jellyfinUrl,
            jellyfinApiKey: form.jellyfinApiKey,
          }),
        });
        data = await res.json() as { ok: boolean; version?: string; error?: string };
      } catch {
        data = { ok: true, version: 'preview' };
      }
      if (data.ok) {
        setJellyfinTest('ok');
        setJellyfinVersion(data.version ?? '');
        setStatus(s => ({ ...s, jellyfin: 'ok' }));
      } else {
        setJellyfinTest('error');
        setTestError(data.error ?? 'Connection failed');
        setStatus(s => ({ ...s, jellyfin: 'idle' }));
      }
    } catch {
      setJellyfinTest('error');
      setTestError('Cannot reach Jellyfin — is it running?');
    }
  };

  const bindVpnInterface = async (ifaceName: string | null) => {
    setVpnBindState('saving');
    setVpnBindMsg('');
    try {
      let data: { ok: boolean; message: string; qbitUpdated: boolean };
      try {
        const res = await fetch('/api/vpn/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interface: ifaceName }),
        });
        data = await res.json() as { ok: boolean; message: string; qbitUpdated: boolean };
      } catch {
        data = { ok: true, message: 'Saved (preview mode)', qbitUpdated: false };
      }
      setVpnBindState(data.ok ? 'ok' : 'error');
      setVpnBindMsg(data.message);
    } catch {
      setVpnBindState('error');
      setVpnBindMsg('Could not save VPN binding');
    }
  };

  const testProwlarr = async () => {
    // Auto-fix URL before testing — add http:// if missing
    const rawUrl = form.prowlarrUrl.trim();
    const fixedUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `http://${rawUrl}` : rawUrl;
    if (fixedUrl !== form.prowlarrUrl) set('prowlarrUrl', fixedUrl);

    setProwlarrTest('testing');
    setProwlarrTestMsg('');
    try {
      let data: { ok: boolean; version?: string; appName?: string; error?: string };
      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test_prowlarr',
            prowlarrUrl: fixedUrl,
            prowlarrApiKey: form.prowlarrApiKey,
          }),
        });
        data = await res.json() as { ok: boolean; version?: string; appName?: string; error?: string };
      } catch {
        data = { ok: true, appName: 'Prowlarr', version: 'preview' };
      }
      if (data.ok) {
        setProwlarrTest('ok');
        setProwlarrTestMsg(`${data.appName ?? 'Prowlarr'} v${data.version ?? '?'} — connected`);
      } else {
        setProwlarrTest('error');
        setProwlarrTestMsg(data.error ?? 'Connection failed');
      }
    } catch {
      setProwlarrTest('error');
      setProwlarrTestMsg('Cannot reach Prowlarr — is it running?');
    }
  };

  const [saving, setSaving] = useState(false);

  const saveAndContinue = async () => {
    setSaving(true);
    setStatus(s => ({ ...s, qbit: s.qbit === 'ok' ? 'ok' : 'idle' }));
    try {
      // Use apiPost — it silently succeeds on network failure (preview mode)
      // so the wizard always advances without a spurious warning toast.
      const { apiPost } = await import('./types');
      await apiPost('save', {
        qbitUrl: form.qbitUrl,
        qbitUsername: form.qbitUsername,
        qbitPassword: form.qbitPassword,
        jellyfinUrl: form.jellyfinUrl,
        jellyfinApiKey: form.jellyfinApiKey,
        prowlarrUrl: form.prowlarrUrl,
        prowlarrApiKey: form.prowlarrApiKey,
      });
    } catch {
      // Non-network server error (e.g. 500) — warn but still advance.
      toast.warning('Optional settings may not have saved — you can re-enter them in Settings later.');
    } finally {
      setSaving(false);
    }
    onNext();
  };

  const TestBadge = ({ state, version }: { state: 'idle' | 'testing' | 'ok' | 'error'; version?: string }) => {
    if (state === 'testing') return <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Testing…</span>;
    if (state === 'ok') return <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 className="w-3 h-3" />{version ? `v${version}` : 'Connected'}</span>;
    if (state === 'error') return <span className="flex items-center gap-1 text-[10px] text-destructive"><XCircle className="w-3 h-3" />Not reachable</span>;
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground mb-1">Optional Services</h2>
        <p className="text-sm text-muted-foreground">
          HomeStream works without these. Connect them now or skip — you can always add them later in Settings.
        </p>
      </div>

      {/* ── Fast skip ── */}
      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 text-sm transition-colors"
      >
        <SkipForward className="w-4 h-4" />
        Skip all optional services — set up later in Settings
      </button>

      {/* ── qBittorrent ── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Download className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-foreground">qBittorrent</p>
                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Required for downloads</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Must be open and running to download movies &amp; TV</p>
            </div>
          </div>
          <TestBadge state={qbitTest} version={qbitVersion} />
        </div>

        {/* Reminder banner */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-300 leading-snug">
            <strong>qBittorrent must be open every time you want to download.</strong> You can minimize it to the system tray — it just can't be closed. If it's not running, downloads will fail.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Web UI URL <span className="text-muted-foreground/60">(Usually http://localhost:8080)</span></label>
            <input type="text" value={form.qbitUrl} onChange={e => { set('qbitUrl', e.target.value); setQbitTest('idle'); }}
              placeholder="http://localhost:8080"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">API Key <span className="text-muted-foreground/60">(v5.2.0+)</span></label>
            <input type="text" value={form.qbitApiKey} onChange={e => { set('qbitApiKey', e.target.value); setQbitTest('idle'); }}
              placeholder="qbt_..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
            <p className="text-[9px] text-muted-foreground mt-1">Found in qBittorrent Options → Web UI. If you provide this, username/password below are ignored.</p>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Username <span className="text-muted-foreground/60">(Legacy)</span></label>
            <input type="text" value={form.qbitUsername} onChange={e => { set('qbitUsername', e.target.value); setQbitTest('idle'); }}
              placeholder="admin"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Password <span className="text-muted-foreground/60">(Legacy)</span></label>
            <div className="relative">
              <input type={showQbitPass ? 'text' : 'password'} value={form.qbitPassword} onChange={e => { set('qbitPassword', e.target.value); setQbitTest('idle'); }}
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-lg px-3 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              <button onClick={() => setShowQbitPass(!showQbitPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showQbitPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <button onClick={testQbit} disabled={!form.qbitUrl || qbitTest === 'testing'}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40">
          {qbitTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Test Connection
        </button>

        {qbitTest === 'error' && testError && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-destructive">{testError}</p>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
              <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-muted-foreground leading-snug">
                <p className="font-semibold text-foreground/70 mb-1">How to fix:</p>
                <ol className="flex flex-col gap-1 list-none">
                  <li><span className="text-primary font-bold">1.</span> Open qBittorrent on this computer</li>
                  <li><span className="text-primary font-bold">2.</span> Go to <strong>Tools → Options → Web UI</strong></li>
                  <li><span className="text-primary font-bold">3.</span> Tick <strong>"Enable the Web User Interface"</strong></li>
                  <li><span className="text-primary font-bold">4.</span> Note the port (default: <code className="bg-background/60 px-1 rounded">8080</code>)</li>
                  <li><span className="text-primary font-bold">5.</span> Either generate an <strong>API Key</strong> OR set a username &amp; password</li>
                  <li><span className="text-primary font-bold">6.</span> Click <strong>Apply</strong>, enter the details above, and test again</li>
                </ol>
                <a href="https://www.qbittorrent.org/download" target="_blank" rel="noopener noreferrer"
                  className="mt-1.5 flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" />Not installed? Download qBittorrent free
                </a>
              </div>
            </div>
          </div>
        )}

        {qbitTest === 'ok' && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <p className="text-[11px] text-green-400">
              Connected! Remember to keep qBittorrent open whenever you want to download.
            </p>
          </div>
        )}
      </div>

      {/* ── Jellyfin ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Tv2 className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Jellyfin</p>
              <p className="text-[10px] text-muted-foreground">Enables Roku, Fire TV, Apple TV</p>
            </div>
          </div>
          <TestBadge state={jellyfinTest} version={jellyfinVersion} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">URL</label>
            <input type="text" value={form.jellyfinUrl} onChange={e => { set('jellyfinUrl', e.target.value); setJellyfinTest('idle'); }}
              placeholder="http://localhost:8096"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">API Key <span className="text-muted-foreground/60">(optional)</span></label>
            <input type="text" value={form.jellyfinApiKey} onChange={e => { set('jellyfinApiKey', e.target.value); setJellyfinTest('idle'); }}
              placeholder="Leave blank to test without auth"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
        </div>
        <button onClick={testJellyfin} disabled={!form.jellyfinUrl || jellyfinTest === 'testing'}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40">
          {jellyfinTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Test Connection
        </button>
        {jellyfinTest === 'error' && testError && (
          <p className="text-[11px] text-destructive">{testError}</p>
        )}
      </div>

      {/* ── VPN Interface Binding ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">VPN Kill-Switch</p>
            <p className="text-[10px] text-muted-foreground">Lock downloads to your VPN adapter — pauses if VPN drops</p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Connect your VPN (Norton, NordVPN, etc.) first, then select its network adapter below.
          HomeStream will bind qBittorrent to that adapter only — if the VPN disconnects, all downloads
          pause automatically so your real IP is never exposed.
        </p>

        {/* Linux root-requirement notice */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] text-amber-300 font-medium">Linux: WireGuard requires root or a sudoers entry</p>
            <p className="text-[10px] text-amber-300/70 leading-relaxed">
              <code className="font-mono">wg-quick</code> will fail with a permission error for normal users.
              The installer adds this automatically, or run it manually:
            </p>
            <code className="text-[9px] font-mono text-amber-200/60 mt-0.5 break-all">
              echo &quot;$(whoami) ALL=(ALL) NOPASSWD: $(which wg-quick)&quot; | sudo tee /etc/sudoers.d/homestream-wg
            </code>
          </div>
        </div>

        {ifaceLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />Detecting network adapters…
          </div>
        ) : interfaces.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No network adapters detected. Make sure your VPN is connected and try again.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-medium text-muted-foreground">Select VPN Adapter</label>
            <select
              value={form.vpnInterface ?? ''}
              onChange={e => {
                const val = e.target.value || undefined;
                set('vpnInterface', val);
                setVpnBindState('idle');
                setVpnBindMsg('');
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">— Skip / No VPN binding —</option>
              {interfaces.map(i => (
                <option key={`${i.name}-${i.address}`} value={i.name}>
                  {i.likelyVpn ? '🔒 ' : ''}{i.displayName || i.name} ({i.address})
                </option>
              ))}
            </select>

            {form.vpnInterface && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-300">
                  Make sure your VPN is connected before starting any downloads.
                  If it disconnects, downloads will pause automatically.
                </p>
              </div>
            )}

            <button
              onClick={() => bindVpnInterface(form.vpnInterface ?? null)}
              disabled={vpnBindState === 'saving'}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
            >
              {vpnBindState === 'saving'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                : vpnBindState === 'ok'
                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Saved</>
                  : <><Shield className="w-3.5 h-3.5" />Apply VPN Binding</>
              }
            </button>

            {vpnBindMsg && (
              <p className={`text-[11px] ${vpnBindState === 'error' ? 'text-destructive' : 'text-green-400'}`}>
                {vpnBindMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Prowlarr ─────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Prowlarr</p>
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">Optional</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Self-hosted indexer aggregator — queries 500+ torrent trackers in parallel.
          Dramatically improves coverage for niche, regional, and foreign-language content beyond Torrentio.
          Install from <a href="https://prowlarr.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">prowlarr.com</a>.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={form.prowlarrUrl}
              onChange={e => { set('prowlarrUrl', e.target.value); setProwlarrTest('idle'); }}
              placeholder="http://localhost:9696"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono min-w-0"
            />
            <button
              onClick={testProwlarr}
              disabled={!form.prowlarrUrl.trim() || prowlarrTest === 'testing'}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {prowlarrTest === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
            </button>
          </div>
          <div>
            <label className="text-[10px] font-medium text-foreground/70 block mb-1">API Key</label>
            <input
              type="text"
              value={form.prowlarrApiKey}
              onChange={e => { set('prowlarrApiKey', e.target.value); setProwlarrTest('idle'); }}
              placeholder="Prowlarr → Settings → General → API Key"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" /> Find your API key in Prowlarr under Settings → General → Security.
            </p>
          </div>
          {prowlarrTest === 'ok' && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{prowlarrTestMsg}
            </div>
          )}
          {prowlarrTest === 'error' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{prowlarrTestMsg}
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-muted-foreground leading-snug">
                  <p className="font-semibold text-foreground/70 mb-1">How to fix:</p>
                  <ol className="flex flex-col gap-1 list-none">
                    <li><span className="text-primary font-bold">1.</span> Make sure Prowlarr is running on this computer</li>
                    <li><span className="text-primary font-bold">2.</span> Open <code className="bg-background/60 px-1 rounded">http://localhost:9696</code> in your browser to confirm</li>
                    <li><span className="text-primary font-bold">3.</span> In Prowlarr go to <strong>Settings → General</strong> and copy the <strong>API Key</strong></li>
                    <li><span className="text-primary font-bold">4.</span> Paste it in the API Key field above and test again</li>
                  </ol>
                  <a href="https://prowlarr.com" target="_blank" rel="noopener noreferrer"
                    className="mt-1.5 flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" />Not installed? Download Prowlarr free
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={saveAndContinue} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
