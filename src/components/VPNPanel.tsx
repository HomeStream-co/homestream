/**
 * VPNPanel — Post-setup VPN management panel
 *
 * Shows VPN status, allows connecting/disconnecting, and editing config.
 * Embeddable in Settings page or Downloads page.
 *
 * Key UX principle: always shows the "downloads only" badge so users
 * understand the VPN never affects their streaming speed.
 *
 * New in this version:
 *   - Auto-Fastest Server toggle
 *   - Server Type selector (P2P / Standard / Obfuscated / Double-hop / Tor)
 *   - Known-servers field for credential OpenVPN providers
 *   - "Find Fastest Now" probe button with live result display
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Globe, Wifi, WifiOff, Loader2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Upload, Zap, RefreshCw, Lock, ExternalLink,
  Gauge, Server, ToggleLeft, ToggleRight, Info,
} from 'lucide-react';

// ── Types (mirrors vpnService.ts) ─────────────────────────────────────────────

type VPNProtocol   = 'wireguard' | 'openvpn' | 'none';
type VPNProviderType = 'mullvad' | 'protonvpn' | 'nordvpn' | 'expressvpn' | 'norton' |
  'surfshark' | 'pia' | 'ipvanish' | 'cyberghost' | 'ivpn' | 'airvpn' | 'custom';
type VPNServerType = 'p2p' | 'standard' | 'obfuscated' | 'double' | 'tor';

interface VPNStatus {
  connected: boolean;
  protocol: VPNProtocol;
  provider: string;
  publicIp?: string;
  downloadOnly: true;
  activeDownloads: number;
  error?: string;
}

interface SafeVPNConfig {
  enabled: boolean;
  downloadOnly: true;
  protocol: VPNProtocol;
  provider: VPNProviderType;
  autoConnect: boolean;
  autoFastest: boolean;
  serverType: VPNServerType;
  knownServers: string[];
  hasConfig: boolean;
  hasCredentials: boolean;
}

interface ProviderMeta {
  id: string;
  name: string;
  authType: 'config_file' | 'credentials';
  protocol: VPNProtocol;
  configUrl?: string;
}

type RankResult =
  | { strategy: 'cli';    server: string; latencyMs?: number }
  | { strategy: 'api';    server: string; latencyMs?: number; score?: number }
  | { strategy: 'ping';   server: string; latencyMs: number }
  | { strategy: 'manual'; reason: string }
  | { strategy: 'error';  reason: string };

// ── Server type metadata ──────────────────────────────────────────────────────

interface ServerTypeMeta {
  id: VPNServerType;
  label: string;
  description: string;
  /** Providers that support this type with auto-selection */
  supportedBy: string[];
  /** Warning shown when selected */
  warning?: string;
}

const SERVER_TYPES: ServerTypeMeta[] = [
  {
    id: 'p2p',
    label: 'P2P',
    description: 'Dedicated torrent-optimised nodes. Best for downloads — no speed caps.',
    supportedBy: ['nordvpn', 'protonvpn', 'mullvad', 'expressvpn', 'surfshark', 'pia', 'ipvanish', 'cyberghost'],
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'General-purpose server. Use if your provider has no dedicated P2P nodes.',
    supportedBy: ['nordvpn', 'protonvpn', 'mullvad', 'expressvpn', 'surfshark', 'pia', 'ipvanish', 'cyberghost', 'ivpn', 'airvpn', 'norton', 'custom'],
  },
  {
    id: 'obfuscated',
    label: 'Obfuscated',
    description: 'Traffic disguised as HTTPS. Useful in restrictive networks or if your ISP blocks VPN protocols.',
    supportedBy: ['nordvpn', 'expressvpn', 'surfshark'],
    warning: 'Obfuscated servers are slower than standard. Only use if your ISP blocks VPN traffic.',
  },
  {
    id: 'double',
    label: 'Double-hop',
    description: 'Traffic routed through two VPN servers. More private, but noticeably slower.',
    supportedBy: ['nordvpn', 'protonvpn'],
    warning: 'Double-hop roughly halves your download speed. Not recommended for large files.',
  },
  {
    id: 'tor',
    label: 'Tor',
    description: 'Exit through the Tor network. Maximum anonymity, very slow — not suitable for large downloads.',
    supportedBy: ['nordvpn', 'protonvpn'],
    warning: 'Tor exit nodes are extremely slow (often < 1 Mbps). Avoid for torrents.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function VPNPanel() {
  const [status, setStatus]     = useState<VPNStatus | null>(null);
  const [config, setConfig]     = useState<SafeVPNConfig | null>(null);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Edit form state
  const [editProvider,     setEditProvider]     = useState<string>('custom');
  const [editProtocol,     setEditProtocol]     = useState<VPNProtocol>('wireguard');
  const [editConfig,       setEditConfig]       = useState('');
  const [editUsername,     setEditUsername]     = useState('');
  const [editPassword,     setEditPassword]     = useState('');
  const [editAutoConnect,  setEditAutoConnect]  = useState(false);
  const [editAutoFastest,  setEditAutoFastest]  = useState(true);
  const [editServerType,   setEditServerType]   = useState<VPNServerType>('p2p');
  const [editKnownServers, setEditKnownServers] = useState('');
  const [showEditForm,     setShowEditForm]     = useState(false);

  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMsg,   setTestMsg]   = useState('');
  const [saveMsg,   setSaveMsg]   = useState('');

  // Fastest-server probe state
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult,  setProbeResult]  = useState<RankResult | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/vpn', { credentials: 'include' });
      const data = await res.json() as { status: VPNStatus; config: SafeVPNConfig | null; providers: ProviderMeta[] };
      setStatus(data.status);
      setConfig(data.config);
      setProviders(data.providers ?? []);
    } catch { /* non-fatal */ }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res  = await fetch('/api/vpn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect' }) });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) setSaveMsg(`Failed: ${data.error}`);
      await fetchStatus();
    } finally { setActionLoading(false); }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/vpn', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
      await fetchStatus();
    } finally { setActionLoading(false); }
  };

  const handleSave = async () => {
    setSaveMsg('');
    setActionLoading(true);
    try {
      const res  = await fetch('/api/vpn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
          enabled:      true,
          protocol:     editProtocol,
          provider:     editProvider,
          configContent: editConfig,
          username:     editUsername || undefined,
          password:     editPassword || undefined,
          autoConnect:  editAutoConnect,
          autoFastest:  editAutoFastest,
          serverType:   editServerType,
          knownServers: editKnownServers
            ? editKnownServers.split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
        }),
      });
      const data = await res.json() as { ok: boolean };
      if (data.ok) {
        setSaveMsg('Saved!');
        setShowEditForm(false);
        setProbeResult(null);
        await fetchStatus();
      }
    } finally { setActionLoading(false); }
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMsg('');
    try {
      const res  = await fetch('/api/vpn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', protocol: editProtocol, configContent: editConfig, username: editUsername || undefined, password: editPassword || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setTestState(data.ok ? 'ok' : 'error');
      setTestMsg(data.error ?? 'Config looks valid!');
    } catch {
      setTestState('error');
      setTestMsg('Could not reach VPN API');
    }
  };

  const handleProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const res  = await fetch('/api/vpn/fastest-server', { credentials: 'include' });
      const data = await res.json() as RankResult;
      setProbeResult(data);
    } catch {
      setProbeResult({ strategy: 'error', reason: 'Could not reach server' });
    } finally { setProbeLoading(false); }
  };

  const openEditForm = () => {
    if (config) {
      setEditProvider(config.provider);
      setEditProtocol(config.protocol);
      setEditAutoConnect(config.autoConnect);
      setEditAutoFastest(config.autoFastest ?? true);
      setEditServerType(config.serverType ?? 'p2p');
      setEditKnownServers((config.knownServers ?? []).join(', '));
    }
    setEditConfig('');
    setEditUsername('');
    setEditPassword('');
    setTestState('idle');
    setTestMsg('');
    setSaveMsg('');
    setProbeResult(null);
    setShowEditForm(true);
  };

  const selectedProviderMeta = providers.find(p => p.id === editProvider);
  const needsCredentials     = selectedProviderMeta?.authType === 'credentials';

  // Which server types make sense for the selected provider
  const supportedTypes = SERVER_TYPES.filter(t => t.supportedBy.includes(editProvider));
  const selectedTypeMeta = SERVER_TYPES.find(t => t.id === editServerType);

  // CLI providers handle server-type selection themselves
  const isCLIProvider = ['nordvpn', 'expressvpn', 'surfshark'].includes(editProvider);
  // Providers where fastest-server auto-selection is fully supported
  const fastestSupported = ['nordvpn', 'expressvpn', 'surfshark', 'mullvad', 'protonvpn'].includes(editProvider)
    || (needsCredentials && !isCLIProvider); // ping-based

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 bg-card border border-border rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading VPN status…</span>
      </div>
    );
  }

  const isConnected  = status?.connected ?? false;
  const isConfigured = config?.enabled && (config.hasConfig || config.hasCredentials);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            isConnected ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-muted-foreground/40'
          }`} />
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">VPN Protection</span>
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                Downloads only
              </span>
              {config?.autoFastest && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500">
                  Auto-fastest
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {!isConfigured
                ? 'Not configured'
                : isConnected
                  ? `Connected via ${status?.provider ?? 'VPN'} · ${status?.publicIp ?? '…'}`
                  : `${providers.find(p => p.id === config?.provider)?.name ?? config?.provider ?? 'VPN'} · ${config?.serverType?.toUpperCase() ?? 'P2P'} · Idle`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
              isConnected ? 'text-green-500 bg-green-500/10' : 'text-muted-foreground bg-muted/30'
            }`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'Active' : 'Idle'}
            </div>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border pt-4">

              {/* Download-only explanation */}
              <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/15 rounded-lg">
                <Shield className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Streaming is never routed through the VPN.</span>{' '}
                  The tunnel only activates when a torrent download starts, then disconnects automatically when finished.
                  Your video playback always uses your full-speed direct connection.
                </p>
              </div>

              {/* Status details */}
              {isConfigured && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground mb-0.5">Protocol</p>
                    <p className="font-semibold text-foreground capitalize">{config?.protocol ?? '—'}</p>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground mb-0.5">Provider</p>
                    <p className="font-semibold text-foreground">
                      {providers.find(p => p.id === config?.provider)?.name ?? config?.provider ?? '—'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground mb-0.5">Server type</p>
                    <p className="font-semibold text-foreground capitalize">{config?.serverType ?? 'p2p'}</p>
                  </div>
                  {isConnected && status?.publicIp && (
                    <div className="p-2.5 bg-muted/30 rounded-lg col-span-3">
                      <p className="text-muted-foreground mb-0.5">Public IP (via VPN)</p>
                      <p className="font-semibold text-foreground font-mono">{status.publicIp}</p>
                    </div>
                  )}
                  {(status?.activeDownloads ?? 0) > 0 && (
                    <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg col-span-3">
                      <p className="text-green-500 text-xs font-medium">
                        {status!.activeDownloads} active download{status!.activeDownloads > 1 ? 's' : ''} protected
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {isConfigured && (
                <div className="flex gap-2 flex-wrap">
                  {isConnected ? (
                    <button onClick={handleDisconnect} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground disabled:opacity-50 transition-colors">
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5" />}
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={handleConnect} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium disabled:opacity-50 transition-colors">
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      Test Connect
                    </button>
                  )}
                  <button onClick={fetchStatus}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-muted-foreground transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                  {/* Fastest-server probe */}
                  <button onClick={handleProbe} disabled={probeLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-muted-foreground disabled:opacity-50 transition-colors">
                    {probeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gauge className="w-3.5 h-3.5" />}
                    Find Fastest Now
                  </button>
                  <button onClick={openEditForm}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-muted-foreground transition-colors ml-auto">
                    <Lock className="w-3.5 h-3.5" />
                    Edit Config
                  </button>
                </div>
              )}

              {/* Probe result */}
              <AnimatePresence>
                {probeResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
                      probeResult.strategy === 'error' || probeResult.strategy === 'manual'
                        ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                        : 'bg-green-500/5 border-green-500/20 text-green-400'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      {(probeResult.strategy === 'cli' || probeResult.strategy === 'api' || probeResult.strategy === 'ping') ? (
                        <>
                          <p className="font-semibold text-foreground">Fastest server: {probeResult.server}</p>
                          {probeResult.latencyMs !== undefined && (
                            <p className="text-muted-foreground mt-0.5">{probeResult.latencyMs}ms · strategy: {probeResult.strategy}</p>
                          )}
                          {'score' in probeResult && probeResult.score !== undefined && (
                            <p className="text-muted-foreground mt-0.5">Provider score: {probeResult.score.toFixed(2)}</p>
                          )}
                          <p className="text-muted-foreground mt-0.5">This server will be used on the next download.</p>
                        </>
                      ) : (
                        <p>{probeResult.reason}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Not configured CTA */}
              {!isConfigured && !showEditForm && (
                <button onClick={openEditForm}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-primary/40 text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                  <Globe className="w-4 h-4" />
                  Configure VPN
                </button>
              )}

              {/* ── Edit form ──────────────────────────────────────────── */}
              <AnimatePresence>
                {showEditForm && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col gap-3 p-3 bg-muted/20 rounded-xl border border-border"
                  >
                    <p className="text-xs font-semibold text-foreground">Update VPN Config</p>

                    {/* Provider picker */}
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Provider</label>
                      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                        {providers.map(p => (
                          <button key={p.id}
                            onClick={() => { setEditProvider(p.id); setEditProtocol(p.protocol as VPNProtocol); }}
                            className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border text-center transition-all ${
                              editProvider === p.id
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                            }`}
                          >
                            <span className="text-[10px] font-semibold leading-tight">{p.name}</span>
                            <span className={`text-[8px] px-1 py-0.5 rounded-full font-medium ${
                              p.protocol === 'wireguard' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-400'
                            }`}>
                              {p.protocol === 'wireguard' ? 'WG' : 'OVPN'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Server Type selector ─────────────────────────── */}
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Server Type
                      </label>
                      <div className="grid grid-cols-5 gap-1">
                        {SERVER_TYPES.map(t => {
                          const supported = t.supportedBy.includes(editProvider);
                          return (
                            <button
                              key={t.id}
                              onClick={() => supported && setEditServerType(t.id)}
                              disabled={!supported}
                              title={supported ? t.description : `Not available for ${selectedProviderMeta?.name ?? editProvider}`}
                              className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border text-center transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                                editServerType === t.id && supported
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              <span className="text-[10px] font-semibold">{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Description + warning for selected type */}
                      {selectedTypeMeta && (
                        <div className={`mt-1.5 flex items-start gap-1.5 p-2 rounded-lg text-[10px] leading-relaxed ${
                          selectedTypeMeta.warning ? 'bg-amber-500/5 border border-amber-500/15 text-amber-400' : 'bg-muted/30 text-muted-foreground'
                        }`}>
                          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>
                            {selectedTypeMeta.description}
                            {selectedTypeMeta.warning && (
                              <span className="block mt-0.5 font-semibold">{selectedTypeMeta.warning}</span>
                            )}
                            {!supportedTypes.find(t => t.id === editServerType) && (
                              <span className="block mt-0.5 text-amber-400 font-semibold">
                                {selectedProviderMeta?.name ?? editProvider} doesn't support {selectedTypeMeta.label} — will fall back to Standard.
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Auto-fastest toggle ──────────────────────────── */}
                    <div
                      onClick={() => setEditAutoFastest(v => !v)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        editAutoFastest ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Gauge className={`w-3.5 h-3.5 flex-shrink-0 ${editAutoFastest ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">Auto-Select Fastest Server</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          {isCLIProvider
                            ? `Uses ${selectedProviderMeta?.name ?? editProvider}'s CLI to pick the fastest ${editServerType} server`
                            : editProvider === 'mullvad' || editProvider === 'protonvpn'
                            ? `Queries ${selectedProviderMeta?.name ?? editProvider}'s API and TCP-pings candidates`
                            : needsCredentials
                            ? 'TCP-pings your server list and connects to the fastest one'
                            : 'Not available — single config-file providers encode one server'}
                        </p>
                      </div>
                      {editAutoFastest
                        ? <ToggleRight className="w-5 h-5 text-primary flex-shrink-0" />
                        : <ToggleLeft  className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    </div>

                    {/* Known servers — only for credential OpenVPN providers without CLI */}
                    {editAutoFastest && needsCredentials && !isCLIProvider && (
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                          Server Hostnames to Ping-Rank
                        </label>
                        <input
                          type="text"
                          value={editKnownServers}
                          onChange={e => setEditKnownServers(e.target.value)}
                          placeholder="us5847.nordvpn.com, us5848.nordvpn.com, uk1234.nordvpn.com"
                          className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Comma-separated. HomeStream TCP-pings each on port 1194 and connects to the fastest.
                        </p>
                      </div>
                    )}

                    {/* Auto-fastest not available notice */}
                    {editAutoFastest && !fastestSupported && (
                      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-400">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        Auto-fastest is not available for {selectedProviderMeta?.name ?? editProvider} with a single config file.
                        Download a new config from their website to switch servers.
                      </div>
                    )}

                    {/* Credentials */}
                    {needsCredentials && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Username</label>
                          <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)}
                            placeholder="VPN username"
                            className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Password</label>
                          <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                            placeholder="VPN password"
                            className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                        </div>
                      </div>
                    )}

                    {/* Config file */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {editProtocol === 'wireguard' ? 'WireGuard Config (.conf)' : 'OpenVPN Config (.ovpn)'}
                        </label>
                        {selectedProviderMeta?.configUrl && (
                          <a href={selectedProviderMeta.configUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] text-primary hover:underline flex items-center gap-0.5">
                            Get from {selectedProviderMeta.name} <ExternalLink className="w-2 h-2" />
                          </a>
                        )}
                      </div>
                      <div className="relative">
                        <textarea
                          value={editConfig}
                          onChange={e => setEditConfig(e.target.value)}
                          placeholder={config?.hasConfig ? '(existing config — paste new to replace)' : 'Paste config here…'}
                          rows={5}
                          className="w-full px-2.5 py-2 text-xs font-mono bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                        />
                        <label className="absolute bottom-2 right-2 cursor-pointer">
                          <input type="file" accept=".conf,.ovpn,.txt" className="hidden"
                            onChange={async e => { const file = e.target.files?.[0]; if (file) setEditConfig(await file.text()); }} />
                          <span className="flex items-center gap-1 text-[9px] text-primary hover:text-primary/80 bg-card border border-border rounded px-1.5 py-0.5">
                            <Upload className="w-2.5 h-2.5" /> Upload
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Auto-connect */}
                    <div
                      onClick={() => setEditAutoConnect(v => !v)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        editAutoConnect ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Zap className={`w-3.5 h-3.5 ${editAutoConnect ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Auto-Connect on Download</p>
                        <p className="text-[10px] text-muted-foreground">Tunnel activates automatically when any download starts</p>
                      </div>
                    </div>

                    {/* Test + Save */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTest}
                        disabled={!editConfig.trim() || testState === 'testing'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground disabled:opacity-50 transition-colors"
                      >
                        {testState === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" />
                          : testState === 'ok'    ? <CheckCircle className="w-3 h-3 text-green-500" />
                          : testState === 'error' ? <XCircle     className="w-3 h-3 text-red-400" />
                          : <Shield className="w-3 h-3" />}
                        Validate
                      </button>
                      {testMsg && (
                        <span className={`text-[10px] ${testState === 'ok' ? 'text-green-500' : 'text-red-400'}`}>{testMsg}</span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setShowEditForm(false)}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleSave} disabled={actionLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-colors">
                          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Save
                        </button>
                      </div>
                    </div>
                    {saveMsg && <p className="text-xs text-green-500">{saveMsg}</p>}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
