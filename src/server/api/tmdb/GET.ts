/**
 * GET /api/tmdb
 *
 * Returns cached TMDB data (upcoming releases + trending this week).
 * Cache is 30 days. Pass ?refresh=1 to force a fresh fetch (used by the
 * manual "Refresh" button in Settings).
 *
 * Also accepts ?genres=28,18&exclude=12345,67890 to get personalised
 * recommendations based on the user's library genres.
 *
 * Response shape:
 * {
 *   upcoming: TMDBMovie[],
 *   trending: TMDBMovie[],
 *   recommended: TMDBMovie[],   // only when ?genres= provided
 *   fetchedAt: number,          // Unix ms of last successful fetch
 *   stale: boolean,             // true = serving cached data (network was down)
 *   cacheAge: { fetchedAt, stale }
 * }
 */
import type { Request, Response } from 'express';
import { getTMDBData, getRecommendations, getCacheAge } from '../../tmdbCache.js';
import { requireAuth } from '../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const forceRefresh = req.query.refresh === '1';
  const genreParam = (req.query.genres as string) ?? '';
  const excludeParam = (req.query.exclude as string) ?? '';

  const genreIds = genreParam
    ? genreParam.split(',').map(Number).filter(n => !isNaN(n))
    : [];
  const excludeIds = excludeParam
    ? excludeParam.split(',').map(Number).filter(n => !isNaN(n))
    : [];

  try {
    const [data, recommended] = await Promise.all([
      getTMDBData(forceRefresh),
      genreIds.length > 0 ? getRecommendations(genreIds, excludeIds) : Promise.resolve([]),
    ]);

    res.json({
      upcoming: data.upcoming,
      trending: data.trending,
      trendingShows: data.trendingShows ?? [],
      recommended,
      fetchedAt: data.fetchedAt,
      stale: data.stale ?? false,
      cacheAge: getCacheAge(),
    });
  } catch (err) {
    // Absolute last resort — return empty but don't crash
    res.status(200).json({
      upcoming: [],
      trending: [],
      trendingShows: [],
      recommended: [],
      fetchedAt: 0,
      stale: true,
      error: String(err),
      cacheAge: getCacheAge(),
    });
  }
}
