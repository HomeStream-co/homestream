/**
 * GET /api/network/info
 *
 * Returns the server's LAN IP addresses and hostname so the HTTPS setup
 * page can pre-fill Caddyfile configs without the user having to look
 * up their own IP.
 *
 * Intentionally open (no auth) — needed by the setup wizard before a
 * password is configured. Returns only local network metadata (no secrets).
 *
 * no-try/catch: intentional — os.networkInterfaces() and os.hostname() are
 * synchronous Node built-ins that never throw.
 */
import type { Request, Response } from 'express';
import os from 'os';
import { MDNS_LOCAL } from '../../../mdnsService.js';

export default function handler(_req: Request, res: Response) {
  const hostname = os.hostname();
  const interfaces = os.networkInterfaces();

  const lanIPs: string[] = [];

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      // IPv4 only, skip loopback
      if (addr.family === 'IPv4' && !addr.internal) {
        lanIPs.push(addr.address);
      }
    }
  }

  // Best guess: prefer 192.168.x.x or 10.x.x.x
  const primary =
    lanIPs.find(ip => ip.startsWith('192.168.')) ||
    lanIPs.find(ip => ip.startsWith('10.')) ||
    lanIPs.find(ip => ip.startsWith('172.')) ||
    lanIPs[0] ||
    '127.0.0.1';

  const port = parseInt(process.env.PORT ?? '3000', 10);
  res.json({ hostname, lanIPs, primary, port, mdnsHostname: MDNS_LOCAL });
}
