/**
 * POST /api/stremio/downloads/resume
 *
 * Body: { hash: string }
 * Resumes a paused qBittorrent torrent by hash.
 */
import type { Request, Response } from 'express';
import { resumeTorrent, isReachable } from '../../../../qbittorrentClient.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  const { hash } = req.body as { hash?: string };
  if (!hash) return res.status(400).json({ error: 'hash is required' });

  const online = await isReachable();
  if (!online) return res.status(503).json({ error: 'qBittorrent is not reachable' });

  try {
    await resumeTorrent(hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
