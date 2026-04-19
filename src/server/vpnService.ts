/**
 * VPN Service — WireGuard & OpenVPN management
 *
 * Manages VPN connections for HomeStream so torrent traffic is routed
 * through the VPN, preventing ISP throttling / DMCA notices.
 *
 * Supports:
 *  - WireGuard (preferred — faster, lower overhead)
 *  - OpenVPN (wider provider support)
 *  - Kill-switch: blocks all non-VPN traffic when enabled
 *  - Status polling
 *
 * Config is stored in homestream-config.json under the `vpn` key.
 * WireGuard configs are written to /etc/wireguard/homestream.conf
 * OpenVPN configs are written to /tmp/homestream.ovpn
 *
 * NOTE: Requires root/sudo or CAP_NET_ADMIN capability on the host.
 * In Docker, add --cap-add=NET_ADMIN --device /dev/net/tun
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export type VPNProtocol = 'wireguard' | 'openvpn' | 'none';

export interface VPNConfig {
  enabled: boolean;
  protocol: VPNProtocol;
  provider: string;           // e.g. "Mullvad", "ProtonVPN", "Custom"
  configContent: string;      // raw WireGuard .conf or OpenVPN .ovpn content
  killSwitch: boolean;        // block all traffic if VPN drops
  autoConnect: boolean;       // connect on HomeStream startup
}

export interface VPNStatus {
  connected: boolean;
  protocol: VPNProtocol;
  provider: string;
  publicIp?: string;
  vpnIp?: string;
  uptime?: string;
  error?: string;
}

const WG_CONF_PATH = '/etc/wireguard/homestream.conf';
const OVPN_CONF_PATH = '/tmp/homestream-vpn.ovpn';
const OVPN_PID_PATH = '/tmp/homestream-openvpn.pid';

// ── WireGuard ─────────────────────────────────────────────────────────────────

async function wgConnect(config: VPNConfig): Promise<void> {
  // Write config
  await fs.mkdir(path.dirname(WG_CONF_PATH), { recursive: true });
  await fs.writeFile(WG_CONF_PATH, config.configContent, { mode: 0o600 });

  // Bring up interface
  await execAsync('wg-quick up homestream');

  if (config.killSwitch) {
    await enableKillSwitch();
  }
}

async function wgDisconnect(): Promise<void> {
  try {
    await execAsync('wg-quick down homestream');
  } catch { /* already down */ }
  await disableKillSwitch();
}

async function wgStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('wg show homestream 2>/dev/null');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// ── OpenVPN ───────────────────────────────────────────────────────────────────

async function ovpnConnect(config: VPNConfig): Promise<void> {
  await fs.writeFile(OVPN_CONF_PATH, config.configContent, { mode: 0o600 });

  const proc = spawn('openvpn', [
    '--config', OVPN_CONF_PATH,
    '--daemon',
    '--writepid', OVPN_PID_PATH,
    '--log', '/tmp/homestream-openvpn.log',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  // Wait up to 10s for connection
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await ovpnStatus()) break;
  }

  if (config.killSwitch) {
    await enableKillSwitch();
  }
}

async function ovpnDisconnect(): Promise<void> {
  try {
    const pid = (await fs.readFile(OVPN_PID_PATH, 'utf8')).trim();
    await execAsync(`kill ${pid}`);
    await fs.unlink(OVPN_PID_PATH).catch(() => {});
  } catch { /* already stopped */ }
  await disableKillSwitch();
}

async function ovpnStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ip link show tun0 2>/dev/null');
    return stdout.includes('tun0');
  } catch {
    return false;
  }
}

// ── Kill switch (iptables) ────────────────────────────────────────────────────

async function enableKillSwitch(): Promise<void> {
  try {
    // Allow loopback and VPN interface, block everything else
    const rules = [
      'iptables -I OUTPUT -o lo -j ACCEPT',
      'iptables -I OUTPUT -o tun0 -j ACCEPT',
      'iptables -I OUTPUT -o wg0 -j ACCEPT',
      'iptables -I OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT',
      'iptables -A OUTPUT -j DROP',
    ];
    for (const rule of rules) {
      await execAsync(rule).catch(() => {});
    }
  } catch { /* iptables not available */ }
}

async function disableKillSwitch(): Promise<void> {
  try {
    await execAsync('iptables -F OUTPUT').catch(() => {});
    await execAsync('iptables -P OUTPUT ACCEPT').catch(() => {});
  } catch { /* ignore */ }
}

// ── Public IP check ───────────────────────────────────────────────────────────

async function getPublicIp(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync(
      'curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo ""'
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function connectVPN(config: VPNConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    if (config.protocol === 'wireguard') {
      await wgConnect(config);
    } else if (config.protocol === 'openvpn') {
      await ovpnConnect(config);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function disconnectVPN(protocol: VPNProtocol): Promise<void> {
  if (protocol === 'wireguard') await wgDisconnect();
  else if (protocol === 'openvpn') await ovpnDisconnect();
  await disableKillSwitch();
}

export async function getVPNStatus(config?: VPNConfig): Promise<VPNStatus> {
  const protocol = config?.protocol ?? 'none';
  let connected = false;

  if (protocol === 'wireguard') connected = await wgStatus();
  else if (protocol === 'openvpn') connected = await ovpnStatus();

  const publicIp = connected ? await getPublicIp() : undefined;

  return {
    connected,
    protocol,
    provider: config?.provider ?? 'Unknown',
    publicIp,
  };
}

export async function testVPNConfig(
  protocol: VPNProtocol,
  configContent: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (protocol === 'wireguard') {
      // Validate WireGuard config syntax
      if (!configContent.includes('[Interface]') || !configContent.includes('[Peer]')) {
        return { ok: false, error: 'Invalid WireGuard config: missing [Interface] or [Peer] section' };
      }
      if (!configContent.includes('PrivateKey')) {
        return { ok: false, error: 'Invalid WireGuard config: missing PrivateKey' };
      }
    } else if (protocol === 'openvpn') {
      if (!configContent.includes('remote ') && !configContent.includes('<connection>')) {
        return { ok: false, error: 'Invalid OpenVPN config: missing remote server' };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
