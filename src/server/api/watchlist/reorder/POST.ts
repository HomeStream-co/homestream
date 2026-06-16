/**
 * POST /api/watchlist/reorder?profile=<profileId>
 *
 * Reorders the watchlist for the given profile with the provided array of media IDs.
 */
import type { Request, Response } from 'express';
import { reorderWatchlist } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { ids } = req.body as { ids: string[] };
    const profileId = (req.query.profile as string | undefined)?.trim() || 'adult';
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'Missing or invalid ids array' });
      return;
    }
    const watchlist = await reorderWatchlist(ids, profileId);
    res.json({ watchlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder watchlist', message: String(err) });
  }
}
