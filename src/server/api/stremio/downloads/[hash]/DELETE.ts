import type { Request, Response } from 'express';
import { deleteTorrent, isReachable } from '../../../../qbittorrentClient.js';
import { requireAuth } from '../../../../authMiddleware.js';

/**
 * DELETE /api/stremio/downloads/:hash
 *
 * Remove a torrent from qBittorrent.
 * Query param: ?deleteFiles=true  — also delete downloaded files from disk
 */
export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { hash } = req.params as { hash: string };
  const deleteFiles = req.query.deleteFiles === 'true';

  if (!hash) {
    return res.status(400).json({ error: 'hash is required' });
  }

  const online = await isReachable();
  if (!online) {
    return res.status(503).json({ error: 'qBittorrent is not reachable' });
  }

  try {
    await deleteTorrent(hash, deleteFiles);
    res.json({ ok: true, hash, deleteFiles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete torrent', message: String(err) });
  }
}
