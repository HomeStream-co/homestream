import type { Request, Response } from 'express';

/**
 * POST /api/stremio/search
 * Body: { query: string, type?: 'movie' | 'series' }
 *
 * Searches the Stremio Cinemeta catalog (public, no auth required) for
 * movies or series matching the query. Returns a list of results with
 * title, year, poster, imdbId, and type so the UI can display them.
 *
 * Cinemeta is the official Stremio metadata addon — it's a public HTTP
 * endpoint that requires no API key.
 */

interface CinemetaItem {
  id: string;          // tt1234567
  name: string;
  year?: number;
  poster?: string;
  description?: string;
  imdbRating?: string;
  genres?: string[];
  type: 'movie' | 'series';
}

interface CinemetaSearchResponse {
  metas?: CinemetaItem[];
}

const CINEMETA = 'https://v3-cinemeta.strem.io';
const TIMEOUT_MS = 10_000;

async function cinemetaSearch(query: string, type: 'movie' | 'series'): Promise<CinemetaItem[]> {
  const url = `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as CinemetaSearchResponse;
    return (data.metas ?? []).map(m => ({ ...m, type }));
  } catch {
    clearTimeout(t);
    return [];
  }
}

export default async function handler(req: Request, res: Response) {
  const { query, type } = req.body as { query?: string; type?: string };

  if (!query?.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    // Search both types in parallel unless a specific type is requested
    const types: Array<'movie' | 'series'> =
      type === 'movie' ? ['movie'] :
      type === 'series' ? ['series'] :
      ['movie', 'series'];

    const results = await Promise.all(types.map(t => cinemetaSearch(query.trim(), t)));
    const merged = results.flat();

    // Deduplicate by imdb id
    const seen = new Set<string>();
    const unique = merged.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    res.json({ results: unique.slice(0, 30) });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: String(err) });
  }
}
