/**
 * GET /api/remote/qr
 *
 * Returns a QR code encoding the /remote URL.
 *
 * URL preference order:
 *   1. http://hs.local:<port>/remote  — mDNS hostname, works on all modern
 *      devices (iOS, Android, macOS, Windows 10+) without typing an IP.
 *   2. http://<LAN IP>:<port>/remote  — fallback for devices without mDNS
 *      support (older Android, some smart TVs).
 *
 * Open endpoint — no auth required. /remote itself is public, and the QR
 * widget needs to render on the TV home screen before the user logs in.
 *
 * Query params:
 *   ?format=svg  (default) — returns { url, qr: svgString, lanIP, mdnsUrl, ipUrl }
 *   ?format=png            — returns { url, qr: base64DataUrl, lanIP, mdnsUrl, ipUrl }
 */
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import os from 'os';
import { MDNS_LOCAL } from '../../../mdnsService.js';

function getLanIP(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    // Skip virtual/Docker/Hyper-V/VPN adapters by name on Windows
    const nameLower = name.toLowerCase();
    const isVirtual =
      nameLower.includes('vethernet') ||
      nameLower.includes('docker') ||
      nameLower.includes('vmware') ||
      nameLower.includes('virtualbox') ||
      nameLower.includes('wsl') ||
      nameLower.includes('loopback');
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push(isVirtual ? `__virtual__${addr.address}` : addr.address);
      }
    }
  }

  const real = candidates.filter(ip => !ip.startsWith('__virtual__'));
  const virtual = candidates
    .filter(ip => ip.startsWith('__virtual__'))
    .map(ip => ip.replace('__virtual__', ''));

  // Prefer real physical adapters, then fall back to virtual ones
  const pool = real.length > 0 ? real : virtual;

  // Within the pool, prefer private LAN ranges in order of likelihood.
  // 172.16–31.x.x is RFC-1918 private; 172.17.x.x is Docker bridge — skip it.
  const is172Private = (ip: string) => {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    return ip.startsWith('172.') && second >= 16 && second <= 31 && second !== 17;
  };

  return (
    pool.find(ip => ip.startsWith('192.168.')) ||
    pool.find(ip => ip.startsWith('10.'))      ||
    pool.find(ip => is172Private(ip))          ||
    pool[0]                                    ||
    'localhost'
  );
}

export default async function handler(req: Request, res: Response) {
  try {
    const port = process.env.PORT ?? '3000';
    const lanIP = getLanIP();

    // Always encode the raw LAN IP in the QR code.
    //
    // Why NOT hs.local:
    //   • Android Chrome blocks mDNS .local resolution entirely (security policy).
    //   • iOS Safari works, but if the browser has ever seen an HSTS header it
    //     forces HTTPS → SSL error on our plain-HTTP server → grey screen.
    //   • The IP address works on every device, every OS, every browser.
    //
    // hs.local is still shown in the UI as a "type it manually" hint for
    // users who prefer it (macOS/iOS where it reliably works).
    const mdnsUrl   = `http://${MDNS_LOCAL}:${port}/remote`;
    const ipUrl     = `http://${lanIP}:${port}/remote`;
    const remoteUrl = ipUrl;   // ← QR always uses the IP

    const format = (req.query.format as string) ?? 'svg';

    if (format === 'png') {
      const dataUrl = await QRCode.toDataURL(remoteUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      res.json({ url: remoteUrl, qr: dataUrl, lanIP, mdnsUrl, ipUrl, port });
    } else {
      const svg = await QRCode.toString(remoteUrl, {
        type: 'svg',
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      res.json({ url: remoteUrl, qr: svg, lanIP, mdnsUrl, ipUrl, port });
    }
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed', message: String(err) });
  }
}
