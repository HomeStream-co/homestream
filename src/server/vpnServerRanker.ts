/**
 * vpnServerRanker — picks the fastest VPN server before connecting.
 *
 * Strategy per provider type:
 *
 *   CLI providers (NordVPN, ExpressVPN, Surfshark CLI)
 *     → delegate to the provider's own --fastest / best-server flag.
 *       The CLI rewrites the active connection, so we just call it and
 *       return the server it chose.
 *
 *   Mullvad (WireGuard, config-file)
 *     → Mullvad exposes a public relay list API. We fetch it, filter to
 *       WireGuard relays, TCP-ping each on port 51820, and return the
 *       hostname of the winner. Caller is responsible for fetching the
 *       matching .conf from Mullvad's API (requires account token).
 *       For now we return the hostname so the UI can surface it.
 *
 *   ProtonVPN (WireGuard, config-file)
 *     → ProtonVPN's public API returns servers with a "Score" field
 *       (lower = better). We pick the server with the lowest Score
 *       that supports P2P (feature flag 4).
 *
 *   OpenVPN credential providers (NordVPN-ovpn, IPVanish, CyberGhost, etc.)
 *     → We TCP-ping port 1194 (UDP fallback: 443) on each server in
 *       config.knownServers and pick the lowest-latency one.
 *       The caller then patches the "remote" line in the .ovpn config.
 *
 *   Config-file providers with a single uploaded file (AirVPN, IVPN, PIA, custom)
 *     → Nothing we can do automatically — the file encodes one server.
 *       We return { strategy: 'manual', reason } so the UI can tell the
 *       user to download a new config for a different server.
 *
 * All network calls have tight timeouts so a slow/unreachable server
 * never blocks the download for more than MAX_PING_MS * attempts.
 */

import net from 'net';
import { execAsync } from './execHelper.js';
import type { VPNConfig, VPNProviderType, VPNServerType } from './vpnService.js';

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_PING_MS = 2_000;   // per-server TCP connect timeout
const MAX_SERVERS = 20;      // cap how many servers we probe (avoid long waits)

// ── Types ─────────────────────────────────────────────────────────────────────

export type RankResult =
  | { strategy: 'cli';    server: string; latencyMs?: number }
  | { strategy: 'api';    server: string; latencyMs?: number; score?: number }
  | { strategy: 'ping';   server: string; latencyMs: number }
  | { strategy: 'manual'; reason: string }
  | { strategy: 'error';  reason: string };

// ── TCP ping helper ───────────────────────────────────────────────────────────

function tcpPing(host: string, port: number, timeoutMs = MAX_PING_MS): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sock = new net.Socket();
    const cleanup = () => { try { sock.destroy(); } catch { /* ignore */ } };

    sock.setTimeout(timeoutMs);
    sock.once('connect', () => { cleanup(); resolve(Date.now() - start); });
    sock.once('timeout', () => { cleanup(); reject(new Error('timeout')); });
    sock.once('error',   (e) => { cleanup(); reject(e); });
    sock.connect(port, host);
  });
}

async function pingAll(
  servers: string[],
  port: number,
): Promise<Array<{ host: string; latencyMs: number }>> {
  const capped = servers.slice(0, MAX_SERVERS);
  const results = await Promise.allSettled(
    capped.map(async host => ({
      host,
      latencyMs: await tcpPing(host, port),
    }))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ host: string; latencyMs: number }> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value)
    .sort((a, b) => a.latencyMs - b.latencyMs);
}

// ── CLI providers ─────────────────────────────────────────────────────────────

/**
 * Map our serverType to NordVPN group names.
 * NordVPN CLI: `nordvpn connect --group <group>`
 */
function nordvpnGroup(serverType: VPNServerType): string {
  switch (serverType) {
    case 'p2p':        return 'P2P';
    case 'obfuscated': return 'Obfuscated_Servers';
    case 'double':     return 'Double_VPN';
    case 'tor':        return 'Onion_Over_VPN';
    default:           return 'P2P'; // standard falls back to P2P for downloads
  }
}

const CLI_FASTEST: Partial<Record<VPNProviderType, (serverType: VPNServerType) => Promise<string>>> = {
  nordvpn: async (serverType) => {
    const group = nordvpnGroup(serverType);
    const { stdout } = await execAsync(`nordvpn connect --group ${group} 2>&1`, { timeout: 30_000 });
    // Output: "Connecting to United States #5847 (us5847.nordvpn.com) ..."
    const match = stdout.match(/\(([^)]+)\)/);
    return match?.[1] ?? `nordvpn-${group.toLowerCase()}`;
  },
  expressvpn: async (serverType) => {
    // ExpressVPN CLI: `expressvpn connect smart` always picks the recommended server.
    // There's no server-type flag in the CLI — type is handled by the config file chosen.
    const _ = serverType; // acknowledged — not used
    const { stdout } = await execAsync('expressvpn connect smart 2>&1', { timeout: 30_000 });
    const match = stdout.match(/Connected to (.+)/i);
    return match?.[1]?.trim() ?? 'expressvpn-smart';
  },
  surfshark: async (serverType) => {
    // Surfshark CLI (Linux): `surfshark-vpn attack` = fastest server.
    // Obfuscated mode requires a different command.
    const _ = serverType;
    const { stdout } = await execAsync('surfshark-vpn attack 2>&1', { timeout: 30_000 });
    const match = stdout.match(/Connected to (.+)/i);
    return match?.[1]?.trim() ?? 'surfshark-fastest';
  },
};

// ── Mullvad API ───────────────────────────────────────────────────────────────

interface MullvadRelay {
  hostname: string;
  ipv4_addr_in: string;
  active: boolean;
  type: string;   // 'wireguard' | 'openvpn' | 'bridge'
  /** Mullvad doesn't expose a P2P flag — all relays allow P2P */
}

async function mullvadFastest(
  protocol: 'wireguard' | 'openvpn',
  _serverType: VPNServerType,
): Promise<RankResult> {
  // Mullvad: all relays support P2P. Obfuscated/double/tor not available via config-file flow.
  try {
    const res = await fetch('https://api.mullvad.net/www/relays/all/', {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'HomeStream/1.0' },
    });
    if (!res.ok) throw new Error(`Mullvad API ${res.status}`);
    const relays = await res.json() as MullvadRelay[];

    const candidates = relays
      .filter(r => r.active && r.type === protocol)
      .map(r => r.ipv4_addr_in)
      .slice(0, MAX_SERVERS);

    if (candidates.length === 0) {
      return { strategy: 'manual', reason: 'No active Mullvad relays found for this protocol' };
    }

    const port = protocol === 'wireguard' ? 51820 : 1194;
    const ranked = await pingAll(candidates, port);

    if (ranked.length === 0) {
      return { strategy: 'manual', reason: 'All Mullvad servers unreachable from this host' };
    }

    const winner = relays.find(r => r.ipv4_addr_in === ranked[0].host);
    return {
      strategy: 'api',
      server: winner?.hostname ?? ranked[0].host,
      latencyMs: ranked[0].latencyMs,
    };
  } catch (err) {
    return { strategy: 'error', reason: String(err) };
  }
}

// ── ProtonVPN API ─────────────────────────────────────────────────────────────

interface ProtonServer {
  Name: string;
  Domain: string;
  Score: number;
  Features: number;  // bitmask: 4 = P2P, 2 = Secure Core (double-hop), 1 = Tor, 8 = Streaming
  Status: number;    // 1 = online
}

const PROTON_FEATURE: Record<VPNServerType, number> = {
  p2p:        4,
  standard:   0,   // no special feature — just online servers
  obfuscated: 0,   // ProtonVPN doesn't expose obfuscation as a server feature flag
  double:     2,   // Secure Core = double-hop
  tor:        1,
};

async function protonFastest(serverType: VPNServerType): Promise<RankResult> {
  try {
    const res = await fetch('https://api.protonvpn.ch/vpn/logicals', {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'HomeStream/1.0', 'x-pm-appversion': 'Other' },
    });
    if (!res.ok) throw new Error(`ProtonVPN API ${res.status}`);
    const data = await res.json() as { LogicalServers: ProtonServer[] };

    const featureFlag = PROTON_FEATURE[serverType];
    const candidates = (data.LogicalServers ?? [])
      .filter(s => {
        if (s.Status !== 1) return false;
        if (featureFlag === 0) return true; // standard — any online server
        return (s.Features & featureFlag) !== 0;
      })
      .sort((a, b) => a.Score - b.Score)
      .slice(0, MAX_SERVERS);

    if (candidates.length === 0) {
      // Fall back to any online server if the requested type has none
      return {
        strategy: 'manual',
        reason: `No online ProtonVPN ${serverType} servers found — try 'standard' or 'p2p'`,
      };
    }

    // TCP-ping the top candidates on port 51820 (WireGuard)
    const ranked = await pingAll(candidates.map(s => s.Domain), 51820);

    if (ranked.length === 0) {
      // Fall back to API score if ping fails (e.g. ICMP blocked)
      return {
        strategy: 'api',
        server: candidates[0].Name,
        score: candidates[0].Score,
      };
    }

    const winner = candidates.find(s => s.Domain === ranked[0].host);
    return {
      strategy: 'api',
      server: winner?.Name ?? ranked[0].host,
      latencyMs: ranked[0].latencyMs,
      score: winner?.Score,
    };
  } catch (err) {
    return { strategy: 'error', reason: String(err) };
  }
}

// ── OpenVPN credential providers (ping-based) ─────────────────────────────────

async function pingBasedFastest(servers: string[]): Promise<RankResult> {
  if (servers.length === 0) {
    return { strategy: 'manual', reason: 'No servers configured — add server hostnames in VPN settings' };
  }
  const ranked = await pingAll(servers, 1194);
  if (ranked.length === 0) {
    // Try port 443 (some providers support TCP 443 as fallback)
    const ranked443 = await pingAll(servers, 443);
    if (ranked443.length === 0) {
      return { strategy: 'manual', reason: 'All configured servers unreachable on port 1194/443' };
    }
    return { strategy: 'ping', server: ranked443[0].host, latencyMs: ranked443[0].latencyMs };
  }
  return { strategy: 'ping', server: ranked[0].host, latencyMs: ranked[0].latencyMs };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pick the fastest server for the given VPN config.
 * Returns a RankResult describing what was found and how.
 *
 * For CLI providers the connection is already made by the CLI tool.
 * For all others the caller must patch the config and reconnect.
 */
export async function pickFastestServer(config: VPNConfig): Promise<RankResult> {
  const { provider, protocol } = config;
  const serverType: VPNServerType = config.serverType ?? 'p2p';

  // ── CLI providers — let the CLI decide ──────────────────────────────────
  const cliFn = CLI_FASTEST[provider];
  if (cliFn) {
    try {
      const server = await cliFn(serverType);
      return { strategy: 'cli', server };
    } catch (err) {
      return { strategy: 'error', reason: `CLI fastest failed: ${String(err)}` };
    }
  }

  // ── Mullvad ──────────────────────────────────────────────────────────────
  if (provider === 'mullvad') {
    return mullvadFastest(protocol === 'wireguard' ? 'wireguard' : 'openvpn', serverType);
  }

  // ── ProtonVPN ────────────────────────────────────────────────────────────
  if (provider === 'protonvpn') {
    return protonFastest(serverType);
  }

  // ── OpenVPN credential providers with known server list ──────────────────
  if (config.knownServers && config.knownServers.length > 0) {
    return pingBasedFastest(config.knownServers);
  }

  // ── Single config-file providers (AirVPN, IVPN, PIA, custom) ────────────
  // The uploaded .conf encodes exactly one server — we can't auto-switch.
  const providerNames: Partial<Record<VPNProviderType, string>> = {
    airvpn:   'AirVPN',
    ivpn:     'IVPN',
    pia:      'Private Internet Access',
    custom:   'your VPN provider',
    surfshark: 'Surfshark',
  };
  const name = providerNames[provider] ?? provider;
  return {
    strategy: 'manual',
    reason: `${name} uses a single uploaded config file. To use a different server, download a new config from ${name}'s website and re-upload it in Settings → VPN.`,
  };
}

/**
 * Patch the "remote" line in an OpenVPN config to point at a new server.
 * Used after ping-ranking picks a faster host.
 */
export function patchOvpnRemote(configContent: string, newHost: string): string {
  // Replace: remote <old-host> <port>
  return configContent.replace(
    /^(remote\s+)\S+(\s+\d+.*)$/m,
    `$1${newHost}$2`,
  );
}
