/**
 * Setup Step 5 — VPN Protection
 * Optional: configure a VPN to tunnel torrent traffic.
 */
import {
  Lock, Shield, Globe, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, ExternalLink, Upload, ToggleLeft, ToggleRight,
  CheckCircle, XCircle as XCircleIcon, Zap,
} from 'lucide-react';
import type { SetupStepProps } from './types';

type ProviderAuthType = 'config_file' | 'credentials';
interface ProviderMeta {
  id: string; name: string; authType: ProviderAuthType;
  protocol: 'wireguard' | 'openvpn'; configUrl?: string;
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'mullvad',    name: 'Mullvad',                 authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://mullvad.net/en/account/wireguard-config' },
  { id: 'protonvpn',  name: 'ProtonVPN',               authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://account.proton.me/u/0/vpn/WireGuard' },
  { id: 'surfshark',  name: 'Surfshark',               authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://my.surfshark.com/vpn/manual-setup/main/wireguard' },
  { id: 'nordvpn',    name: 'NordVPN',                 authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://downloads.nordcdn.com/configs/archives/servers/ovpn_udp.zip' },
  { id: 'expressvpn', name: 'ExpressVPN',              authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://www.expressvpn.com/setup#manual' },
  { id: 'norton',     name: 'Norton VPN',              authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://support.norton.com/sp/en/us/home/current/solutions/v134005887' },
  { id: 'pia',        name: 'Private Internet Access', authType: 'config_file',  protocol: 'openvpn',   configUrl: 'https://www.privateinternetaccess.com/openvpn/openvpn.zip' },
  { id: 'ipvanish',   name: 'IPVanish',                authType: 'credentials',  protocol: 'openvpn',   configUrl: 'https://www.ipvanish.com/software/configs/' },
  { id: 'ivpn',       name: 'IVPN',                    authType: 'config_file',  protocol: 'wireguard', configUrl: 'https://www.ivpn.net/account/wireguard' },
  { id: 'airvpn',     name: 'AirVPN',                  authType: 'config_file',  protocol: 'openvpn',   configUrl: 'https://airvpn.org/generator/' },
  { id: 'custom',     name: 'Custom / Other',          authType: 'config_file',  protocol: 'wireguard' },
];

export default function StepVPN({
  form, set, onNext, onBack,
  vpnTestState, setVpnTestState,
  vpnTestMsg, setVpnTestMsg,
}: SetupStepProps) {
  const selectedProvider = PROVIDERS.find(p => p.id === form.vpnProvider) ?? PROVIDERS[PROVIDERS.length - 1];
  const needsCredentials = selectedProvider.authType === 'credentials';

  const handleNext = async () => {
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
    onNext();
  };

  const testConfig = async () => {
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
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">VPN Protection</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">Protects your downloads from ISP throttling and DMCA notices.</p>
        <div className="mt-3 flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Downloads only — streaming is never slowed down</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">The VPN tunnel activates automatically when a torrent starts and disconnects when it finishes. Video playback always uses your direct connection for full speed.</p>
          </div>
        </div>
      </div>

      {/* Enable toggle */}
      <div
        onClick={() => set('vpnEnabled', !form.vpnEnabled)}
        className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${form.vpnEnabled ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-muted/20'}`}
      >
        <div className="flex items-center gap-3">
          <Globe className={`w-5 h-5 ${form.vpnEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className="text-sm font-semibold text-foreground">Enable VPN for Downloads</p>
            <p className="text-xs text-muted-foreground">Automatically tunnel torrent traffic</p>
          </div>
        </div>
        {form.vpnEnabled ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
      </div>

      {form.vpnEnabled && (
        <div className="flex flex-col gap-4">
          {/* Provider grid */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Your VPN Provider</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => { set('vpnProvider', p.id); set('vpnProtocol', p.protocol); }}
                  className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border text-center transition-all ${form.vpnProvider === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}>
                  <span className="text-[11px] font-semibold leading-tight">{p.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${p.protocol === 'wireguard' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-400'}`}>
                    {p.protocol === 'wireguard' ? 'WireGuard' : 'OpenVPN'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Config file */}
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
                <textarea value={form.vpnConfigContent} onChange={e => set('vpnConfigContent', e.target.value)}
                  placeholder={selectedProvider.protocol === 'wireguard'
                    ? '[Interface]\nPrivateKey = ...\nAddress = 10.x.x.x/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0'
                    : 'client\ndev tun\nproto udp\nremote vpn.example.com 1194\n...'}
                  rows={7}
                  className="w-full px-3 py-2 text-xs font-mono bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                />
                <label className="absolute bottom-2 right-2 cursor-pointer">
                  <input type="file" accept=".conf,.ovpn,.txt" className="hidden"
                    onChange={async e => { const f = e.target.files?.[0]; if (f) set('vpnConfigContent', await f.text()); }} />
                  <span className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 bg-card border border-border rounded px-2 py-1">
                    <Upload className="w-3 h-3" /> Upload file
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Credentials */}
          {needsCredentials && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">{selectedProvider.name}</span> uses username + password authentication.
                  Enter your VPN credentials below. You&apos;ll also need to{' '}
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
                  <input type="text" value={form.vpnUsername} onChange={e => set('vpnUsername', e.target.value)}
                    placeholder="VPN username"
                    className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Password</label>
                  <input type="password" value={form.vpnPassword} onChange={e => set('vpnPassword', e.target.value)}
                    placeholder="VPN password"
                    className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Server Config (.ovpn)</label>
                <div className="relative">
                  <textarea value={form.vpnConfigContent} onChange={e => set('vpnConfigContent', e.target.value)}
                    placeholder={'client\ndev tun\nproto udp\nremote vpn.example.com 1194\nauth-user-pass\n...'}
                    rows={5}
                    className="w-full px-3 py-2 text-xs font-mono bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none" />
                  <label className="absolute bottom-2 right-2 cursor-pointer">
                    <input type="file" accept=".conf,.ovpn,.txt" className="hidden"
                      onChange={async e => { const f = e.target.files?.[0]; if (f) set('vpnConfigContent', await f.text()); }} />
                    <span className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 bg-card border border-border rounded px-2 py-1">
                      <Upload className="w-3 h-3" /> Upload .ovpn
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Validate */}
          <div className="flex items-center gap-2">
            <button onClick={testConfig} disabled={!form.vpnConfigContent.trim() || vpnTestState === 'testing'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground disabled:opacity-50 transition-colors">
              {vpnTestState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : vpnTestState === 'ok' ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                : vpnTestState === 'error' ? <XCircleIcon className="w-3.5 h-3.5 text-red-400" />
                : <Shield className="w-3.5 h-3.5" />}
              Validate Config
            </button>
            {vpnTestMsg && (
              <span className={`text-xs ${vpnTestState === 'ok' ? 'text-green-500' : 'text-red-400'}`}>{vpnTestMsg}</span>
            )}
          </div>

          {/* Auto-connect */}
          <div onClick={() => set('vpnAutoConnect', !form.vpnAutoConnect)}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.vpnAutoConnect ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
            <Zap className={`w-4 h-4 ${form.vpnAutoConnect ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground">Auto-Connect on Download</p>
              <p className="text-[10px] text-muted-foreground">Tunnel activates automatically when any download starts</p>
            </div>
            {form.vpnAutoConnect ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
          </div>
        </div>
      )}

      {!form.vpnEnabled && (
        <div className="p-4 bg-muted/20 rounded-xl border border-dashed border-border">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">HomeStream works fine without a VPN</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Streaming and playback are never affected by VPN status. A VPN only matters if you use the download feature — it shields your IP from your ISP while torrenting.
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                <strong className="text-foreground/70">Free options:</strong>{' '}
                <a href="https://protonvpn.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ProtonVPN</a> has a free tier with WireGuard support.{' '}
                <a href="https://mullvad.net" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Mullvad</a> is €5/month with no account required. You can also add a VPN later in <strong>Settings → VPN</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={handleNext}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold text-sm transition-colors">
          {form.vpnEnabled ? 'Save & Continue' : 'Skip'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
