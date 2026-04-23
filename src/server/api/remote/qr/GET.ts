/**
 * GET /api/remote/qr
 *
 * Returns a QR code encoding the /remote URL using the server's actual LAN IP
 * (from os.networkInterfaces), NOT the HTTP Host header. This means the QR
 * always points to the real local network address — e.g. http://192.168.1.50:3000/remote
 * — even when the app is accessed through a proxy, tunnel, or preview domain.
 *
 * Open endpoint — no auth required. /remote itself is public, and the QR widget
 * needs to render on the TV home screen before the user logs in.
 *
 * Query params:
 *   ?format=svg  (default) — returns { url, qr: svgString }
 *   ?format=png            — returns { url, qr: base64DataUrl }
 */
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import os from 'os';

function getLanIP(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push(addr.address);
      }
    }
  }

  // Prefer private LAN ranges in order of likelihood
  return (
    candidates.find(ip => ip.startsWith('192.168.')) ||
    candidates.find(ip => ip.startsWith('10.'))      ||
    candidates.find(ip => ip.startsWith('172.'))     ||
    candidates[0]                                    ||
    'localhost'
  );
}

export default async function handler(req: Request, res: Response) {
  try {
    const port = process.env.PORT ?? '3000';
    const lanIP = getLanIP();
    const remoteUrl = `http://${lanIP}:${port}/remote`;

    const format = (req.query.format as string) ?? 'svg';

    if (format === 'png') {
      const dataUrl = await QRCode.toDataURL(remoteUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      res.json({ url: remoteUrl, qr: dataUrl, lanIP, port });
    } else {
      const svg = await QRCode.toString(remoteUrl, {
        type: 'svg',
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      res.json({ url: remoteUrl, qr: svg, lanIP, port });
    }
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed', message: String(err) });
  }
}
