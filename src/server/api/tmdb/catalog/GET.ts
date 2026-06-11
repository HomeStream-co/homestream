/**
 * GET /api/tmdb/catalog?provider=<id>&type=movie|tv&page=1
 *
 * Returns movies or shows currently available on a streaming service.
 * Uses TMDB's /discover endpoint filtered by watch_provider.
 *
 * Provider IDs (US):
 *   8   = Netflix
 *   9   = Amazon Prime Video
 *   337 = Disney+
 *   1899 = Max (HBO Max)
 *   15  = Hulu
 *   386 = Peacock
 *
 * Response: { results: TMDBMovie[], totalPages: number, page: number }
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';
import { tmdbGet } from '../../../tmdbCache.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMDB_BASE = 'https://api.themoviedb.org/3';

function resolveClientPath(...segments: string[]): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (process.env.ELECTRON === '1' && resourcesPath) {
    return path.join(resourcesPath, 'client', ...segments);
  }
  return path.join(__dirname, '..', '..', '..', '..', ...segments);
}

const LOCAL_IMG_DIR = resolveClientPath('tmdb-images');

function toLocalImgUrl(tmdbPath: string | null, size: 'w500' | 'original'): string {
  if (!tmdbPath) return '';
  const hash = crypto.createHash('md5').update(tmdbPath + size).digest('hex').slice(0, 12);
  const localFile = path.join(LOCAL_IMG_DIR, `${hash}.jpg`);
  if (fs.existsSync(localFile)) return `/tmdb-images/${hash}.jpg`;
  const base = size === 'original' ? 'https://image.tmdb.org/t/p/original' : 'https://image.tmdb.org/t/p/w500';
  return `${base}${tmdbPath}`;
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const providerId = parseInt(req.query.provider as string, 10);
  const type = (req.query.type as string) === 'tv' ? 'tv' : 'movie';
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const sortBy = (req.query.sort as string) || 'popularity.desc';

  if (!providerId || isNaN(providerId)) {
    res.status(400).json({ error: 'provider query param required (e.g. ?provider=8)' });
    return;
  }

  const cfg = readConfig();
  const apiKey = cfg.tmdbApiKey || process.env.TMDB_API_KEY || '';
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB API key not configured' });
    return;
  }

  try {
    const data: any = await tmdbGet(`/discover/${type}`, {
      sort_by: sortBy,
      watch_region: 'US',
      with_watch_providers: String(providerId),
      page: String(page),
      'vote_count.gte': '20',
    });

    const results = (data.results ?? []).map((m: any) => {
      const posterPath = (m.poster_path as string | null) ?? null;
      const backdropPath = (m.backdrop_path as string | null) ?? null;
      const genreIds = (m.genre_ids as number[]) ?? [];
      return {
        id: m.id as number,
        title: (m.title ?? m.name ?? '') as string,
        overview: (m.overview ?? '') as string,
        poster_path: posterPath,
        backdrop_path: backdropPath,
        release_date: ((m.release_date ?? m.first_air_date ?? '') as string),
        vote_average: (m.vote_average ?? 0) as number,
        vote_count: (m.vote_count ?? 0) as number,
        genre_ids: genreIds,
        genres: genreIds.map(id => GENRE_MAP[id]).filter(Boolean),
        popularity: (m.popularity ?? 0) as number,
        posterUrl: toLocalImgUrl(posterPath, 'w500'),
        backdropUrl: toLocalImgUrl(backdropPath, 'original'),
        mediaType: type,
      };
    });

    res.json({
      results,
      totalPages: Math.min(data.total_pages ?? 1, 20), // cap at 20 pages
      page: data.page ?? 1,
    });
  } catch (err) {
    console.warn('[TMDB Catalog] fetch failed:', err);
    res.json({
      results: [],
      totalPages: 1,
      page: 1
    });
  }
}
