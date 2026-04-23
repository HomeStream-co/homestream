/**
 * GET /api/watchlist?profile=<profileId>
 *
 * Returns the watchlist for the given profile as an array of media IDs.
 * Defaults to 'adult' if no profile param is supplied (backwards compat).
 */
import type { Request, Response } from 'express';
import { readWatchlist } from '../../watchlistStore.js';
import { requireAuth } from '../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const profileId = (req.query.profile as string | undefined)?.trim() || 'adult';
  try {
    res.json(readWatchlist(profileId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read watchlist', message: String(err) });
  }
}
