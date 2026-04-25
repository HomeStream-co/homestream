/**
 * GET /api/tmdb/streaming?id=<tmdbId>&type=movie|tv
 *
 * Returns the streaming providers (flatrate/subscription) available for a
 * specific title in the US, using TMDB's /watch/providers endpoint.
 *
 * Response: { providers: { id, name, logo }[] }
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_LOGO = 'https://image.tmdb.org/t/p/w92';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const tmdbId = parseInt(req.query.id as string, 10);
  const type = (req.query.type as string) === 'tv' ? 'tv' : 'movie';

  if (!tmdbId || isNaN(tmdbId)) {
    res.status(400).json({ error: 'id query param required' });
    return;
  }

  const cfg = readConfig();
  const apiKey = cfg.tmdbApiKey || process.env.TMDB_API_KEY || '';
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB API key not configured' });
    return;
  }

  try {
    const url = new URL(`${TMDB_BASE}/${type}/${tmdbId}/watch/providers`);
    url.searchParams.set('api_key', apiKey);

    const tmdbRes = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!tmdbRes.ok) throw new Error(`TMDB ${tmdbRes.status}`);

    const data = await tmdbRes.json() as {
      results?: {
        US?: {
          flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
          free?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
        };
      };
    };

    const us = data.results?.US ?? {};
    const flatrate = [...(us.flatrate ?? []), ...(us.free ?? [])];

    const providers = flatrate.map(p => ({
      id: p.provider_id,
      name: p.provider_name,
      logo: `${TMDB_LOGO}${p.logo_path}`,
    }));

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
