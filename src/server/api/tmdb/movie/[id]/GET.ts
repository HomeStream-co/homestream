/**
 * GET /api/tmdb/movie/:id
 *
 * Fetches TMDB movie details including external_ids (for IMDb ID).
 * Proxied server-side so the TMDB API key is never exposed to the browser.
 */
import type { Request, Response } from 'express';
import { readConfig } from '../../../../configStore.js';

export default async function handler(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'id required' });

  const config = readConfig();
  const apiKey = config.tmdbApiKey;
  if (!apiKey) return res.status(503).json({ error: 'TMDB API key not configured' });

  try {
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&append_to_response=external_ids`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`TMDB responded ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'TMDB fetch failed', message: String(err) });
  }
}
