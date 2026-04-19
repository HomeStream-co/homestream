/**
 * PUT /api/watchlist/:id
 * Adds a media item to the watchlist.
 * Idempotent — safe to call multiple times.
 */
import type { Request, Response } from 'express';
import { addToWatchlist } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { id } = req.params;
    const watchlist = await addToWatchlist(id);
    res.json({ watchlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to watchlist', message: String(err) });
  }
}
