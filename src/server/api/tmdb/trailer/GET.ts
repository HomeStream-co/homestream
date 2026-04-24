/**
 * GET /api/tmdb/trailer?title=...&year=...&type=movie|series
 *
 * Looks up the YouTube trailer key for a title via TMDB.
 * Returns { trailerKey: string | null }
 */
import type { Request, Response } from 'express';
// No #airo/secrets — reads from process.env directly for full portability
import { readConfig } from '../../../configStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { title, year, type = 'movie' } = req.query as Record<string, string>;
  if (!title) return res.status(400).json({ error: 'title required' });

  const cfg = readConfig();
  const apiKey = cfg.tmdbApiKey || process.env.TMDB_API_KEY || '';
  if (!apiKey) return res.json({ trailerKey: null });

  try {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const key = String(apiKey);

    // Use api_key query param (TMDB v3 — same as the rest of the app)
    const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}&page=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json() as { results?: { id: number }[] };
    const tmdbId = searchData.results?.[0]?.id;
    if (!tmdbId) return res.json({ trailerKey: null });

    const videosUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${encodeURIComponent(key)}`;
    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json() as {
      results?: { key: string; site: string; type: string; official: boolean }[]
    };

    // Prefer official YouTube trailers, then teasers
    const videos = videosData.results ?? [];
    const trailer =
      videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
      videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
      videos.find(v => v.site === 'YouTube' && v.type === 'Teaser') ||
      videos.find(v => v.site === 'YouTube');

    res.json({ trailerKey: trailer?.key ?? null });
  } catch {
    res.json({ trailerKey: null });
  }
}
