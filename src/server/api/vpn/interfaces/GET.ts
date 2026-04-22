/**
 * GET /api/vpn/interfaces
 *
 * Returns all active network interfaces on the host machine.
 * On Windows, Norton VPN creates a virtual adapter (usually named
 * "Norton Secure VPN" or "NordVPN" etc.) — the client picks the right one.
 *
 * Response: { interfaces: Array<{ name, address, family, internal }> }
 */
import type { Request, Response } from 'express';
import os from 'os';

interface NetworkInterface {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  /** Heuristic: does this look like a VPN adapter? */
  likelyVpn: boolean;
}

// Keywords commonly found in VPN virtual adapter names on Windows
const VPN_HINTS = [
  'vpn', 'norton', 'nord', 'express', 'proton', 'mullvad', 'surfshark',
  'wireguard', 'openvpn', 'tun', 'tap', 'wg', 'private', 'secure',
];

export default function handler(_req: Request, res: Response) {
  const raw = os.networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(raw)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' && addr.family !== 'IPv6') continue;
      const nameLower = name.toLowerCase();
      const likelyVpn = VPN_HINTS.some(hint => nameLower.includes(hint));
      result.push({
        name,
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
