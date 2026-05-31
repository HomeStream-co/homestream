/**
 * VPN Service — Download-Only VPN Protection
 *
 * KEY DESIGN PRINCIPLE:
 *   VPN is used ONLY during torrent downloads to protect against ISP
 *   throttling and DMCA notices. Streaming playback always uses the
 *   direct connection for maximum speed — no VPN overhead on video.
 *
 * Flow:
 *   1. User triggers a download
 *   2. connectForDownload() brings up the VPN tunnel
 *   3. qBittorrent / WebTorrent download runs through the tunnel
 *   4. disconnectAfterDownload() tears down the tunnel when done
 *      (or keeps it up if another download is still active)
 *
 * Supported protocols:
 *   - WireGuard  (preferred — fast, low overhead, ~5% speed penalty)
 *   - OpenVPN    (wider provider support)
 *
 * Supported provider types:
 *   - Config-file providers: Mullvad, ProtonVPN, IVPN, AirVPN, Custom
 *     → User uploads a .conf / .ovpn file
 *   - Credential providers: NordVPN, ExpressVPN, Norton VPN, Surfshark,
 *     Private Internet Access, IPVanish, CyberGhost
 *     → User enters username + password; we use their CLI or OpenVPN creds
 *
 * NOTE: WireGuard / OpenVPN must be installed on the host.
 *       Docker: --cap-add=NET_ADMIN --device /dev/net/tun
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execAsync } from './execHelper.js';
import { pickFastestServer, patchOvpnRemote } from './vpnServerRanker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VPNProtocol = 'wireguard' | 'openvpn' | 'none';

export type VPNProviderType =
  | 'mullvad'
  | 'protonvpn'
  | 'nordvpn'
  | 'expressvpn'
  | 'norton'
  | 'surfshark'
  | 'pia'
  | 'ipvanish'
  | 'cyberghost'
  | 'ivpn'
  | 'airvpn'
  | 'custom';

export interface VPNProviderMeta {
  id: VPNProviderType;
  name: string;
  authType: 'config_file' | 'credentials' | 'cli';
  protocol: VPNProtocol;
  configUrl?: string;    // where to download config files
  cliCommand?: string;   // CLI tool name if authType === 'cli'
  ovpnServer?: string;   // OpenVPN server for credential-based providers
}

export const VPN_PROVIDERS: VPNProviderMeta[] = [
  {
    id: 'mullvad',
    name: 'Mullvad',
    authType: 'config_file',
    protocol: 'wireguard',
    configUrl: 'https://mullvad.net/en/account/wireguard-config',
  },
  {
    id: 'protonvpn',
    name: 'ProtonVPN',
    authType: 'config_file',
    protocol: 'wireguard',
    configUrl: 'https://account.proton.me/u/0/vpn/WireGuard',
  },
  {
    id: 'nordvpn',
    name: 'NordVPN',
    authType: 'credentials',
    protocol: 'openvpn',
    ovpnServer: 'us5847.nordvpn.com.udp.ovpn',
    configUrl: 'https://downloads.nordcdn.com/configs/archives/servers/ovpn_udp.zip',
  },
  {
    id: 'expressvpn',
    name: 'ExpressVPN',
    authType: 'credentials',
    protocol: 'openvpn',
    configUrl: 'https://www.expressvpn.com/setup#manual',
  },
  {
    id: 'norton',
    name: 'Norton VPN',
    authType: 'credentials',
    protocol: 'openvpn',
    configUrl: 'https://support.norton.com/sp/en/us/home/current/solutions/v134005887',
  },
  {
    id: 'surfshark',
    name: 'Surfshark',
    authType: 'config_file',
    protocol: 'wireguard',
    configUrl: 'https://my.surfshark.com/vpn/manual-setup/main/wireguard',
  },
  {
    id: 'pia',
    name: 'Private Internet Access',
    authType: 'config_file',
    protocol: 'openvpn',
    configUrl: 'https://www.privateinternetaccess.com/openvpn/openvpn.zip',
  },
  {
    id: 'ipvanish',
    name: 'IPVanish',
    authType: 'credentials',
    protocol: 'openvpn',
    configUrl: 'https://www.ipvanish.com/software/configs/',
  },
  {
    id: 'cyberghost',
    name: 'CyberGhost',
    authType: 'credentials',
    protocol: 'openvpn',
    configUrl: 'https://support.cyberghostvpn.com/hc/en-us/articles/213811885',
  },
  {
    id: 'ivpn',
    name: 'IVPN',
    authType: 'config_file',
    protocol: 'wireguard',
    configUrl: 'https://www.ivpn.net/account/wireguard',
  },
  {
    id: 'airvpn',
    name: 'AirVPN',
    authType: 'config_file',
    protocol: 'openvpn',
    configUrl: 'https://airvpn.org/generator/',
  },
  {
    id: 'custom',
    name: 'Custom / Other',
    authType: 'config_file',
    protocol: 'wireguard',
  },
];

export type VPNServerType = 'p2p' | 'standard' | 'obfuscated' | 'double' | 'tor';

export interface VPNConfig {
  enabled: boolean;
  downloadOnly: true;          // ALWAYS true — VPN only used for downloads, never streaming
  protocol: VPNProtocol;
  provider: VPNProviderType;
  configContent: string;       // raw .conf / .ovpn file content
  username?: string;           // for credential-based providers
  password?: string;           // for credential-based providers
  autoConnect: boolean;        // connect automatically when a download starts
  /** When true, HomeStream picks the fastest available server before connecting */
  autoFastest: boolean;
  /**
   * Preferred server type for providers that support multiple categories.
   * - p2p        → optimised for torrenting (most providers have dedicated P2P nodes)
   * - standard   → general-purpose server, no special routing
   * - obfuscated → traffic disguised as HTTPS — useful in restrictive networks
   * - double     → traffic routed through two VPN hops (slower, more private)
   * - tor        → exit through the Tor network (very slow — not recommended for downloads)
   * Defaults to 'p2p'. Falls back to 'standard' if the provider doesn't support the type.
   */
  serverType: VPNServerType;
  /** For OpenVPN credential providers: list of server hostnames to ping-rank */
  knownServers?: string[];
}

export interface VPNStatus {
  connected: boolean;
  protocol: VPNProtocol;
  provider: string;
  publicIp?: string;
  downloadOnly: true;
  activeDownloads: number;
  error?: string;
}

// ── Internal state ────────────────────────────────────────────────────────────

/** Count of active downloads currently using the VPN tunnel */
let activeDownloadCount = 0;

const WG_IFACE = 'homestream-vpn';
const WG_CONF_PATH = `/etc/wireguard/${WG_IFACE}.conf`;
const OVPN_CONF_PATH = path.join(os.tmpdir(), 'homestream-vpn.ovpn');
const OVPN_PID_PATH  = path.join(os.tmpdir(), 'homestream-openvpn.pid');

// ── WireGuard ─────────────────────────────────────────────────────────────────

async function wgConnect(config: VPNConfig): Promise<void> {
  await fs.mkdir(path.dirname(WG_CONF_PATH), { recursive: true });
  await fs.writeFile(WG_CONF_PATH, config.configContent, { mode: 0o600 });
  await execAsync(`wg-quick up ${WG_IFACE}`);
}

async function wgDisconnect(): Promise<void> {
  try { await execAsync(`wg-quick down ${WG_IFACE}`); } catch { /* already down */ }
}

async function wgIsUp(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`wg show ${WG_IFACE} 2>/dev/null`);
    return stdout.trim().length > 0;
  } catch { return false; }
}

// ── OpenVPN ───────────────────────────────────────────────────────────────────

async function buildOvpnConfig(config: VPNConfig): Promise<string> {
  let content = config.configContent;

  // For credential-based providers, inject auth inline
  if (config.username && config.password) {
    // Write auth file
    const authPath = path.join(os.tmpdir(), 'homestream-vpn-auth.txt');
    await fs.writeFile(authPath, `${config.username}\n${config.password}`, { mode: 0o600 });

    // Replace or add auth-user-pass directive
    if (content.includes('auth-user-pass')) {
      content = content.replace(/auth-user-pass.*$/m, `auth-user-pass ${authPath}`);
    } else {
      content += `\nauth-user-pass ${authPath}\n`;
    }
  }

  return content;
}

async function ovpnConnect(config: VPNConfig): Promise<void> {
  const content = await buildOvpnConfig(config);
  await fs.writeFile(OVPN_CONF_PATH, content, { mode: 0o600 });

  const proc = spawn('openvpn', [
    '--config', OVPN_CONF_PATH,
    '--daemon',
    '--writepid', OVPN_PID_PATH,
    '--log', path.join(os.tmpdir(), 'homestream-openvpn.log'),
    '--script-security', '2',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  // Wait up to 15s for tun0 to appear
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await ovpnIsUp()) return;
  }
  throw new Error('OpenVPN did not connect within 15 seconds — check /tmp/homestream-openvpn.log');
}

async function ovpnDisconnect(): Promise<void> {
  try {
    const pid = (await fs.readFile(OVPN_PID_PATH, 'utf8')).trim();
    await execAsync(`kill ${pid}`);
    await fs.unlink(OVPN_PID_PATH).catch(() => {});
  } catch { /* already stopped */ }
}

async function ovpnIsUp(): Promise<boolean> {
  try {
    // Check for any tun interface (tun0, tun1, etc.) — the index varies
    // depending on what other VPN software is running on the host.
    const { stdout } = await execAsync('ip link show type tun 2>/dev/null');
    return stdout.includes('tun');
  } catch { return false; }
}

// ── Public IP (for status display) ───────────────────────────────────────────

async function getPublicIp(): Promise<string | undefined> {
  try {
    // Use Node's built-in fetch — avoids a curl dependency that may not be
    // present on minimal Linux installs (Alpine, base Arch, etc.).
    const res = await fetch('https://api.ipify.org?format=text', {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return undefined;
    const ip = (await res.text()).trim();
    return ip || undefined;
  } catch { return undefined; }
}

// ── Core connect / disconnect ─────────────────────────────────────────────────

async function bringUp(config: VPNConfig): Promise<void> {
  if (config.protocol === 'wireguard') await wgConnect(config);
  else if (config.protocol === 'openvpn') await ovpnConnect(config);
}

/**
 * Like bringUp but runs fastest-server selection first when autoFastest is on.
 * For CLI providers the CLI itself handles the connection, so we skip bringUp.
 * For ping/API providers we patch the config before connecting.
 */
async function bringUpFastest(config: VPNConfig): Promise<{ server?: string }> {
  const result = await pickFastestServer(config);
  console.log(`[vpn] Fastest server result:`, result);

  if (result.strategy === 'cli') {
    // CLI already connected — nothing more to do
    return { server: result.server };
  }

  if (result.strategy === 'error' || result.strategy === 'manual') {
    // Fall back to normal connect with whatever config we have
    console.warn(`[vpn] Fastest-server selection unavailable: ${result.reason} — using current config`);
    await bringUp(config);
    return {};
  }

  // For ping/api strategies: patch the OpenVPN remote if applicable, then connect
  let patchedConfig = config;
  if (config.protocol === 'openvpn' && result.strategy === 'ping') {
    patchedConfig = {
      ...config,
      configContent: patchOvpnRemote(config.configContent, result.server),
    };
    console.log(`[vpn] Patched OpenVPN remote → ${result.server} (${result.latencyMs}ms)`);
  } else if (result.strategy === 'api') {
    console.log(`[vpn] API-selected server: ${result.server}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`);
    // For WireGuard config-file providers (Mullvad/ProtonVPN), we can't auto-patch
    // the config without the user's account token. Log the recommendation and
    // connect with whatever config is uploaded.
  }

  await bringUp(patchedConfig);
  return { server: result.server };
}

async function bringDown(protocol: VPNProtocol): Promise<void> {
  if (protocol === 'wireguard') await wgDisconnect();
  else if (protocol === 'openvpn') await ovpnDisconnect();
}

async function isUp(protocol: VPNProtocol): Promise<boolean> {
  if (protocol === 'wireguard') return wgIsUp();
  if (protocol === 'openvpn') return ovpnIsUp();
  return false;
}

// ── Download-scoped VPN lifecycle ─────────────────────────────────────────────

/**
 * Call this BEFORE starting a torrent download.
 * Brings up the VPN if not already connected.
 * Returns true if VPN is ready (or was already up), false if VPN is disabled.
 */
export async function connectForDownload(
  config: VPNConfig
): Promise<{ ok: boolean; alreadyConnected?: boolean; server?: string; error?: string }> {
  if (!config.enabled) return { ok: true }; // VPN disabled — proceed without it

  try {
    const already = await isUp(config.protocol);
    if (!already) {
      if (config.autoFastest) {
        const { server } = await bringUpFastest(config);
        activeDownloadCount++;
        return { ok: true, alreadyConnected: false, server };
      } else {
        await bringUp(config);
      }
    }
    activeDownloadCount++;
    return { ok: true, alreadyConnected: already };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Call this AFTER a torrent download completes or errors.
 * Tears down the VPN only when no other downloads are active.
 */
export async function disconnectAfterDownload(
  config: VPNConfig
): Promise<void> {
  if (!config.enabled) return;

  activeDownloadCount = Math.max(0, activeDownloadCount - 1);

  // Keep tunnel up if other downloads are still running
  if (activeDownloadCount > 0) return;

  await bringDown(config.protocol).catch(() => {});
}

// ── Manual connect / disconnect (for Settings panel) ─────────────────────────

export async function connectVPN(
  config: VPNConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    await bringUp(config);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function disconnectVPN(config: VPNConfig): Promise<void> {
  activeDownloadCount = 0;
  await bringDown(config.protocol).catch(() => {});
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getVPNStatus(config?: VPNConfig): Promise<VPNStatus> {
  const protocol = config?.protocol ?? 'none';
  const connected = config?.enabled ? await isUp(protocol) : false;
  const publicIp = connected ? await getPublicIp() : undefined;

  return {
    connected,
    protocol,
    provider: config ? VPN_PROVIDERS.find(p => p.id === config.provider)?.name ?? config.provider : 'None',
    publicIp,
    downloadOnly: true,
    activeDownloads: activeDownloadCount,
  };
}

// ── Config validation ─────────────────────────────────────────────────────────

export async function testVPNConfig(
  protocol: VPNProtocol,
  configContent: string,
  username?: string,
  password?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (protocol === 'wireguard') {
      if (!configContent.includes('[Interface]') || !configContent.includes('[Peer]')) {
        return { ok: false, error: 'Missing [Interface] or [Peer] section' };
      }
      if (!configContent.includes('PrivateKey')) {
        return { ok: false, error: 'Missing PrivateKey in [Interface]' };
      }
      if (!configContent.match(/Endpoint\s*=/)) {
        return { ok: false, error: 'Missing Endpoint in [Peer]' };
      }
    } else if (protocol === 'openvpn') {
      const needsCreds = configContent.includes('auth-user-pass') && !configContent.match(/auth-user-pass\s+\S/);
      if (needsCreds && (!username || !password)) {
        return { ok: false, error: 'This config requires a username and password' };
      }
      if (!configContent.includes('remote ') && !configContent.includes('<connection>')) {
        return { ok: false, error: 'Missing remote server in config' };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
