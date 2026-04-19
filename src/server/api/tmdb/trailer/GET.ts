/**
 * GET /api/tmdb/trailer?title=...&year=...&type=movie|series
 *
 * Looks up the YouTube trailer key for a title via TMDB.
 * Returns { trailerKey: string | null }
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { readConfig } from '../../../configStore.js';

export default async function handler(req: Request, res: Response) {
  const { title, year, type = 'movie' } = req.query as Record<string, string>;
  if (!title) return res.status(400).json({ error: 'title required' });

  const cfg = readConfig();
  const apiKey = cfg.tmdbApiKey || getSecret('TMDB_API_KEY') || '';
  if (!apiKey) return res.json({ trailerKey: null });

  try {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}&page=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    const searchData = await searchRes.json() as { results?: { id: number }[] };
    const tmdbId = searchData.results?.[0]?.id;
    if (!tmdbId) return res.json({ trailerKey: null });

    const videosUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos`;
    const videosRes = await fetch(videosUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
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
