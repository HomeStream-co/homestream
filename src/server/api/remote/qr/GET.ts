/**
 * GET /api/remote/qr
 *
 * Returns a QR code (SVG string) encoding the /remote URL for this server.
 * The URL is built from the request's Host header so it works on any LAN IP
 * or custom domain without configuration.
 *
 * Query params:
 *   ?format=svg  (default) — returns SVG text
 *   ?format=png            — returns PNG data URL (base64)
 */
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const host = req.headers.host ?? `localhost:${process.env.PORT ?? 3000}`;
    const protocol = req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http');
    const remoteUrl = `${protocol}://${host}/remote`;

    const format = (req.query.format as string) ?? 'svg';

    if (format === 'png') {
      const dataUrl = await QRCode.toDataURL(remoteUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#ffffff', light: '#00000000' },
      });
      res.json({ url: remoteUrl, qr: dataUrl });
    } else {
      const svg = await QRCode.toString(remoteUrl, {
        type: 'svg',
        margin: 2,
        color: { dark: '#ffffff', light: '#00000000' },
      });
      res.json({ url: remoteUrl, qr: svg });
    }
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed', message: String(err) });
  }
}
