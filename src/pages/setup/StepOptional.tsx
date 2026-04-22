/**
 * Setup Step 2 — Optional Services (merged)
 *
 * Combines qBittorrent + Jellyfin + VPN interface binding into one step
 * with a prominent "Skip all — I'll set these up later" fast path at the top.
 */
import { useState, useEffect } from 'react';
import {
  Wifi, Tv2, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Loader2, RefreshCw, Eye, EyeOff, SkipForward,
  Shield, AlertTriangle,
} from 'lucide-react';
import type { SetupStepProps } from './types';

interface NetworkInterface {
  name: string;
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
      .catch(() => {})
      .finally(() => setIfaceLoading(false));
  }, []);

  const testQbit = async () => {
    setQbitTest('testing'); setTestError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_qbit',
          qbitUrl: form.qbitUrl,
          qbitUsername: form.qbitUsername,
          qbitPassword: form.qbitPassword,
        }),
      });
      const data = await res.json() as { ok: boolean; version?: string; error?: string };
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
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_jellyfin',
          jellyfinUrl: form.jellyfinUrl,
          jellyfinApiKey: form.jellyfinApiKey,
        }),
      });
      const data = await res.json() as { ok: boolean; version?: string; error?: string };
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
      const res = await fetch('/api/vpn/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: ifaceName }),
      });
      const data = await res.json() as { ok: boolean; message: string; qbitUpdated: boolean };
      setVpnBindState(data.ok ? 'ok' : 'error');
      setVpnBindMsg(data.message);
    } catch {
      setVpnBindState('error');
      setVpnBindMsg('Could not save VPN binding');
    }
  };

  const saveAndContinue = async () => {
    setStatus(s => ({ ...s, qbit: s.qbit === 'ok' ? 'ok' : 'idle' }));
    // Save whatever was entered (even if not tested — user can skip)
    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        qbitUrl: form.qbitUrl,
        qbitUsername: form.qbitUsername,
        qbitPassword: form.qbitPassword,
        jellyfinUrl: form.jellyfinUrl,
        jellyfinApiKey: form.jellyfinApiKey,
      }),
    }).catch(() => {/* non-fatal */});
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
      <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Wifi className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">qBittorrent</p>
              <p className="text-[10px] text-muted-foreground">Enables in-app downloading</p>
            </div>
          </div>
          <TestBadge state={qbitTest} version={qbitVersion} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">URL</label>
            <input type="text" value={form.qbitUrl} onChange={e => { set('qbitUrl', e.target.value); setQbitTest('idle'); }}
              placeholder="http://localhost:8080"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Username</label>
            <input type="text" value={form.qbitUsername} onChange={e => { set('qbitUsername', e.target.value); setQbitTest('idle'); }}
              placeholder="admin"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Password</label>
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
          <p className="text-[11px] text-destructive">{testError}</p>
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
                  {i.likelyVpn ? '🔒 ' : ''}{i.name} ({i.address})
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

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={saveAndContinue}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors">
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
