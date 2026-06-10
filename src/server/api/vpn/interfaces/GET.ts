/**
 * GET /api/vpn/interfaces
 *
 * Returns all active network interfaces on the host machine.
 * On Windows, Norton VPN creates a virtual adapter (usually named
 * "Norton Secure VPN" or "NordVPN" etc.) — the client picks the right one.
 *
 * Intentionally open (no auth) — needed by the setup wizard (step 4: VPN
 * binding) before a password is configured. Returns only adapter names and
 * IP addresses — no secrets.
 *
 * no-try/catch: intentional — os.networkInterfaces() is a synchronous Node
 * built-in that never throws.
 *
 * Response: { interfaces: Array<{ name, address, family, internal }> }
 */
import type { Request, Response } from 'express';
import os from 'os';
import { execSync } from 'child_process';

interface NetworkInterface {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  /** Heuristic: does this look like a VPN adapter? */
  likelyVpn: boolean;
  /** Friendly name extracted from OS (e.g. ProtonVPN TAP-Windows Adapter V9) */
  displayName?: string;
}

// Keywords commonly found in VPN virtual adapter names on Windows
const VPN_HINTS = [
  'vpn', 'norton', 'nord', 'express', 'proton', 'mullvad', 'surfshark',
  'wireguard', 'openvpn', 'tun', 'tap', 'wg', 'private', 'secure',
];

export default function handler(_req: Request, res: Response) {
  const raw = os.networkInterfaces();
  const result: NetworkInterface[] = [];

  // On Windows, the OS adapter names are often generic (e.g., "Ethernet 2").
  // We can fetch the actual device descriptions using PowerShell to get the real VPN name.
  const winDescriptions: Record<string, string> = {};
  if (process.platform === 'win32') {
    try {
      // Execute synchronously - usually takes ~50ms
      const stdout = execSync('powershell.exe -NoProfile -Command "Get-NetAdapter | Select-Object Name, InterfaceDescription | ConvertTo-Json -Compress"', { encoding: 'utf-8', timeout: 3000 });
      const parsed = JSON.parse(stdout);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        if (item.Name && item.InterfaceDescription) {
          winDescriptions[item.Name] = item.InterfaceDescription;
        }
      }
    } catch (err) {
      // Fallback silently if PowerShell fails
    }
  }

  for (const [name, addrs] of Object.entries(raw)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' && addr.family !== 'IPv6') continue;
      
      const desc = winDescriptions[name];
      const displayName = (desc && desc !== name) ? `${name} — ${desc}` : name;
      
      const searchStr = `${name} ${desc || ''}`.toLowerCase();
      const likelyVpn = VPN_HINTS.some(hint => searchStr.includes(hint));

      result.push({
        name,
        displayName,
        address: addr.address,
        family: addr.family as 'IPv4' | 'IPv6',
        internal: addr.internal,
        likelyVpn,
      });
    }
  }

  // Sort: VPN-likely first, then non-internal, then internal (loopback last)
  result.sort((a, b) => {
    if (a.likelyVpn !== b.likelyVpn) return a.likelyVpn ? -1 : 1;
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  res.json({ interfaces: result });
}
