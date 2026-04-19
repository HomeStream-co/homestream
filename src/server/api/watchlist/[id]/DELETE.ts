/**
 * DELETE /api/watchlist/:id
 * Removes a media item from the watchlist.
 * Idempotent — safe to call even if item isn't in the list.
 */
import type { Request, Response } from 'express';
import { removeFromWatchlist } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { id } = req.params;
    const watchlist = await removeFromWatchlist(id);
    res.json({ watchlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from watchlist', message: String(err) });
  }
}
