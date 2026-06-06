/**
 * GET /api/tmdb/genres?genreId=28&mediaType=movie|tv
 *
 * Returns two curated lists for a single TMDB genre:
 *   mustSee   — all-time classics (high vote_average + vote_count)
 *   topRated  — currently popular titles
 *
 * mediaType defaults to "movie" for backwards compatibility.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { getGenreMustSee, getGenreTopRated, getGenreMustSeeTv, getGenreTopRatedTv } from '../../../tmdbCache.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const genreIdParam = req.query.genreId as string;
  const genreId = parseInt(genreIdParam, 10);
  const mediaType = (req.query.mediaType as string | undefined) ?? 'movie';

  if (!genreIdParam || isNaN(genreId)) {
    return res.status(400).json({ error: 'genreId query param required (numeric TMDB genre ID)' });
  }

  try {
    if (mediaType === 'tv') {
      const [mustSee, topRated] = await Promise.all([
        getGenreMustSeeTv(genreId),
        getGenreTopRatedTv(genreId),
      ]);
      return res.json({ genreId, mediaType: 'tv', mustSee, topRated });
    }

    const [mustSee, topRated] = await Promise.all([
      getGenreMustSee(genreId),
      getGenreTopRated(genreId),
    ]);
    res.json({ genreId, mediaType: 'movie', mustSee, topRated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch genre data', message: String(err) });
  }
}
