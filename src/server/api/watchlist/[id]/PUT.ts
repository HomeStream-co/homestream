/**
 * PUT /api/watchlist/:id?profile=<profileId>
 *
 * Adds a media item to the watchlist for the given profile.
 * Idempotent — safe to call multiple times.
 * Defaults to 'adult' if no profile param is supplied.
 */
import type { Request, Response } from 'express';
import { addToWatchlist } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const id = req.params.id as string;
    const rawProfile = Array.isArray(req.query.profile) ? req.query.profile[0] : req.query.profile;
    const profileId = (typeof rawProfile === 'string' ? rawProfile.trim() : '') || 'adult';
    const watchlist = await addToWatchlist(id, profileId);
    res.json({ watchlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to watchlist', message: String(err) });
  }
}
