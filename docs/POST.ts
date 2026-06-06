import type { Request, Response } from 'express';
import { addMagnet, isReachable } from '../../../qbittorrentClient.js';
import { readConfig } from '../../../configStore.js';
import { requireAuth } from '../../../authMiddleware.js';

/**
 * POST /api/stremio/magnet
 *
 * Accepts a raw magnet link pasted by the user and sends it directly to
 * qBittorrent. No stream-source lookup — the user already has the magnet.
 *
 * Body: { magnet: string }
 * Returns: { ok: true, hash: string } | { ok: false, error: string }
 */
export default async function handler(req: Request, res: Response) {
  const authError = requireAuth(req, res);
  if (authError) return;

  try {
    const { magnet } = req.body as { magnet?: string };

    if (!magnet || typeof magnet !== 'string') {
      res.status(400).json({ ok: false, error: 'magnet is required' });
      return;
    }

    const trimmed = magnet.trim();
    if (!trimmed.startsWith('magnet:')) {
      res.status(400).json({ ok: false, error: 'Invalid magnet link — must start with magnet:' });
      return;
    }

    const qbitOnline = await isReachable();
    if (!qbitOnline) {
      res.status(503).json({ ok: false, error: 'qBittorrent is not reachable. Make sure it is running.' });
      return;
    }

    const cfg = readConfig();
    const savepath = cfg.downloadsDir || cfg.mediaDir || undefined;
    const hash = await addMagnet(trimmed, savepath ? { savepath } : {});

    res.json({ ok: true, hash });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
