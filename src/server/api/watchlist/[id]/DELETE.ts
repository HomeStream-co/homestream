/**
 * DELETE /api/watchlist/:id?profile=<profileId>
 *
 * Removes a media item from the watchlist for the given profile.
 * Idempotent — safe to call even if item isn't in the list.
 * Defaults to 'adult' if no profile param is supplied.
 */
import type { Request, Response } from 'express';
import { removeFromWatchlist } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const id = req.params.id as string;
    const profileId = (req.query.profile as string | undefined)?.trim() || 'adult';
    const watchlist = await removeFromWatchlist(id, profileId);
    res.json({ watchlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from watchlist', message: String(err) });
  }
}
