/**
 * POST /api/stremio/downloads/pause
 *
 * Body: { hash: string }
 * Pauses a qBittorrent torrent by hash.
 */
import type { Request, Response } from 'express';
import { pauseTorrent, isReachable } from '../../../../qbittorrentClient.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  const { hash } = req.body as { hash?: string };
  if (!hash) return res.status(400).json({ error: 'hash is required' });

  const online = await isReachable();
  if (!online) return res.status(503).json({ error: 'qBittorrent is not reachable' });

  try {
    await pauseTorrent(hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
