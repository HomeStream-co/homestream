/**
 * GET /api/tmdb/genres?genreId=28
 *
 * Returns two curated lists for a single TMDB genre:
 *   mustSee   — all-time classics (vote_average ≥ 7.5, vote_count ≥ 1000)
 *   topRated  — currently popular (sorted by popularity, vote_count ≥ 100)
 *
 * Results are NOT cached server-side (the client caches per-genre in
 * sessionStorage for the duration of the session).
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { getGenreMustSee, getGenreTopRated } from '../../../tmdbCache.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const genreIdParam = req.query.genreId as string;
  const genreId = parseInt(genreIdParam, 10);

  if (!genreIdParam || isNaN(genreId)) {
    return res.status(400).json({ error: 'genreId query param required (numeric TMDB genre ID)' });
  }

  try {
    const [mustSee, topRated] = await Promise.all([
      getGenreMustSee(genreId),
      getGenreTopRated(genreId),
    ]);

    res.json({ genreId, mustSee, topRated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch genre data', message: String(err) });
  }
}
