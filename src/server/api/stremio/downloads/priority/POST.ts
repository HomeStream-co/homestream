/**
 * POST /api/stremio/downloads/priority
 *
 * Moves a qBittorrent torrent up or down in the download queue.
 * Body: { hash: string; direction: 'up' | 'down' }
 *
 * Uses qBittorrent's queue management API:
 *   POST /api/v2/torrents/topPrio   — move to top
 *   POST /api/v2/torrents/increasePrio — move up one slot
 *   POST /api/v2/torrents/decreasePrio — move down one slot
 *   POST /api/v2/torrents/bottomPrio — move to bottom
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { qbitRequest } from '../../../../qbittorrentClient.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { hash, direction } = req.body as { hash?: string; direction?: 'up' | 'down' };
  if (!hash || !direction) {
    return res.status(400).json({ error: 'hash and direction are required' });
  }
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }

  try {
    const endpoint = direction === 'up'
      ? '/api/v2/torrents/increasePrio'
      : '/api/v2/torrents/decreasePrio';

    await qbitRequest(endpoint, 'POST', new URLSearchParams({ hashes: hash }));
    res.json({ ok: true, hash, direction });
  } catch (err) {
    res.status(500).json({ error: 'Priority change failed', message: String(err) });
  }
}
