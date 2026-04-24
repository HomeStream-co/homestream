/**
 * GET /api/tmdb/search?q=<query>&page=1
 *
 * Multi-search TMDB for movies and TV shows matching the query.
 * Proxied server-side so the TMDB API key is never exposed to the browser.
 *
 * Response: { results: TMDBSearchResult[], total_results: number, total_pages: number }
 */
import type { Request, Response } from 'express';
import { readConfig } from '../../../configStore.js';

export default async function handler(req: Request, res: Response) {
  const q = (req.query.q as string ?? '').trim();
  const page = parseInt((req.query.page as string) ?? '1', 10) || 1;

  if (!q) return res.status(400).json({ error: 'q param required' });

  const config = readConfig();
  const apiKey = config.tmdbApiKey;
  if (!apiKey) {
    return res.status(503).json({ error: 'TMDB API key not configured', results: [] });
  }

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(q)}&page=${page}&include_adult=false`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`TMDB responded ${r.status}`);
    const data = await r.json() as { results?: unknown[]; total_results?: number; total_pages?: number };
    res.json({
      results: data.results ?? [],
      total_results: data.total_results ?? 0,
      total_pages: data.total_pages ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'TMDB search failed', message: String(err), results: [] });
  }
}
