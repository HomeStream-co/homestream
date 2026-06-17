import type { Request, Response } from 'express';
import { readConfig } from '../../../configStore.js';
import { readLibrary } from '../../../libraryStore.js';
import { requireAuth } from '../../../authMiddleware.js';

interface CacheEntry {
  data: any;
  timestamp: number;
}
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const recommendationsCache = new Map<string, CacheEntry>();

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { mediaId } = req.params;
  if (!mediaId) return res.status(400).json({ error: 'mediaId required' });

  const config = readConfig();
  const apiKey = config.tmdbApiKey;
  
  // Await is fine here because readLibrary resolves immediately from memory cache in production,
  // but we can ensure it's not a heavy blocking call.
  const library = await readLibrary();
  const currentItem = library.find(i => i.id === mediaId);
  
  if (!currentItem) return res.status(404).json({ error: 'Media not found in library' });
  if (!apiKey) return res.status(503).json({ error: 'TMDB API key not configured' });

  const cacheKey = `rec_${mediaId}`;
  const cached = recommendationsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    let tmdbId = currentItem.tmdbId;
    const type = currentItem.type === 'series' ? 'tv' : 'movie';

    // If we only have imdbId, look up tmdbId first
    if (!tmdbId && currentItem.imdbId) {
      const findUrl = `https://api.themoviedb.org/3/find/${currentItem.imdbId}?api_key=${apiKey}&external_source=imdb_id`;
      const findRes = await fetch(findUrl);
      if (findRes.ok) {
        const findData = await findRes.json();
        const results = type === 'tv' ? findData.tv_results : findData.movie_results;
        if (results && results.length > 0) {
          tmdbId = results[0].id.toString();
        }
      }
    }

    if (!tmdbId) {
      return res.status(404).json({ error: 'Could not resolve TMDB ID for this media' });
    }

    // Fetch similar
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/similar?api_key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`TMDB responded ${r.status}`);
    const data = await r.json();

    const similarResults = data.results || [];
    
    // Separate into In Library and Online
    const inLibrary = [];
    const online = [];

    for (const item of similarResults) {
      // Find in local library by tmdbId
      const localMatch = library.find((l: any) => l.tmdbId === item.id.toString());
      if (localMatch) {
        if (inLibrary.length < 3) inLibrary.push(localMatch);
      } else {
        if (online.length < 3) {
          online.push({
            id: `tmdb-${item.id}`,
            tmdbId: item.id.toString(),
            title: item.title || item.name,
            year: item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : ''),
            type: currentItem.type,
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            overview: item.overview
          });
        }
      }
      if (inLibrary.length === 3 && online.length === 3) break;
    }

    const resultData = {
      inLibrary,
      online
    };

    recommendationsCache.set(cacheKey, {
      data: resultData,
      timestamp: Date.now()
    });

    res.json(resultData);
  } catch (error) {
    console.error('[recommendations] Error fetching similar:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
}
