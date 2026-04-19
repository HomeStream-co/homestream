/**
 * GET /api/watchlist
 * Returns the current watchlist as an array of media IDs.
 */
import type { Request, Response } from 'express';
import { readWatchlist } from '../../watchlistStore.js';
import { requireAuth } from '../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  res.json(readWatchlist());
}
