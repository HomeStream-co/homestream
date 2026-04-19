/**
 * tmdbCache — file-backed 30-day cache for TMDB data.
 *
 * Design goals:
 *  - Zero background polling. Data is fetched ONCE on first request, then
 *    served from disk until 30 days have elapsed or a manual refresh is triggered.
 *  - Fully offline-safe: if TMDB is unreachable the last cached payload is
 *    returned as-is, with a `stale: true` flag so the UI can show a notice.
 *  - No timers, no intervals, no cron. The only work that happens is when a
 *    request actually comes in and the cache is expired.
 */

import fs from 'fs';
import path from 'path';
import { getSecret } from '#airo/secrets';

const CACHE_DIR = path.resolve('./tmdb-cache');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  genres?: string[];
  popularity: number;
  posterUrl: string;
  backdropUrl: string;
}

export interface TMDBCacheEntry {
  fetchedAt: number;        // Unix ms
  upcoming: TMDBMovie[];
  trending: TMDBMovie[];
  trendingShows: TMDBMovie[];
  stale?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cacheFile(key: string): string {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${key}.json`);
}

function readCache(key: string): TMDBCacheEntry | null {
  const file = cacheFile(key);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as TMDBCacheEntry;
  } catch { return null; }
}

function writeCache(key: string, data: TMDBCacheEntry): void {
  try {
    fs.writeFileSync(cacheFile(key), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[tmdbCache] Failed to write cache:', err);
  }
}

function isFresh(entry: TMDBCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < THIRTY_DAYS_MS;
}

function normaliseMovie(m: Record<string, unknown>): TMDBMovie {
  return {
    id: m.id as number,
    title: (m.title ?? m.name ?? '') as string,
    overview: (m.overview ?? '') as string,
    poster_path: (m.poster_path ?? null) as string | null,
    backdrop_path: (m.backdrop_path ?? null) as string | null,
    release_date: (m.release_date ?? m.first_air_date ?? '') as string,
    vote_average: (m.vote_average ?? 0) as number,
    vote_count: (m.vote_count ?? 0) as number,
    genre_ids: (m.genre_ids ?? []) as number[],
    popularity: (m.popularity ?? 0) as number,
    posterUrl: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : '',
    backdropUrl: m.backdrop_path ? `${TMDB_IMG_ORIGINAL}${m.backdrop_path}` : '',
  };
}

async function tmdbGet(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = getSecret('TMDB_API_KEY') as string;
  if (!apiKey) throw new Error('TMDB_API_KEY not configured');
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'en-US');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${String(res.statusText)}`);
  return res.json() as Promise<unknown>;
}

// ── Genre map (static — TMDB genre IDs don't change) ─────────────────────────

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

function attachGenres(movies: TMDBMovie[]): TMDBMovie[] {
  return movies.map(m => ({
    ...m,
    genres: m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean),
  }));
}

// ── Main fetch ────────────────────────────────────────────────────────────────

async function fetchFresh(): Promise<TMDBCacheEntry> {
  // Get current month window for "upcoming" (in theatres / releasing this month)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

  const [upcomingRaw, trendingRaw, trendingShowsRaw] = await Promise.all([
    tmdbGet('/discover/movie', {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': firstDay,
      'primary_release_date.lte': lastDay,
      'vote_count.gte': '10',
    }),
    tmdbGet('/trending/movie/week'),
    tmdbGet('/trending/tv/week'),
  ]);

  const upcoming = attachGenres(
    ((upcomingRaw as { results: Record<string, unknown>[] }).results ?? [])
      .slice(0, 30)
      .map(normaliseMovie)
  );
  const trending = attachGenres(
    ((trendingRaw as { results: Record<string, unknown>[] }).results ?? [])
      .slice(0, 30)
      .map(normaliseMovie)
  );
  const trendingShows = attachGenres(
    ((trendingShowsRaw as { results: Record<string, unknown>[] }).results ?? [])
      .slice(0, 30)
      .map(normaliseMovie)
  );

  return { fetchedAt: Date.now(), upcoming, trending, trendingShows };
}

// ── Recommendations based on library genres/actors ────────────────────────────

export async function getRecommendations(
  genreIds: number[],
  excludeTmdbIds: number[] = [],
): Promise<TMDBMovie[]> {
  if (genreIds.length === 0) return [];
  try {
    const raw = await tmdbGet('/discover/movie', {
      sort_by: 'vote_average.desc',
      with_genres: genreIds.slice(0, 3).join('|'),
      'vote_count.gte': '200',
      'vote_average.gte': '6.5',
    });
    const results = ((raw as { results: Record<string, unknown>[] }).results ?? [])
      .map(normaliseMovie)
      .filter(m => !excludeTmdbIds.includes(m.id));
    return attachGenres(results.slice(0, 30));
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const CACHE_KEY = 'main';

/**
 * Get cached TMDB data. Fetches fresh if cache is missing or expired.
 * Never throws — returns stale data or empty arrays on network failure.
 */
export async function getTMDBData(forceRefresh = false): Promise<TMDBCacheEntry & { stale?: boolean }> {
  const cached = readCache(CACHE_KEY);

  // Serve fresh cache immediately — no network call
  if (!forceRefresh && cached && isFresh(cached)) {
    return cached;
  }

  // Try to fetch fresh data
  try {
    const fresh = await fetchFresh();
    writeCache(CACHE_KEY, fresh);
    return fresh;
  } catch (err) {
    console.warn('[tmdbCache] Network fetch failed, serving stale cache:', err);
    // Return stale cache if available, otherwise empty
    if (cached) return { ...cached, stale: true };
    return { fetchedAt: 0, upcoming: [], trending: [], trendingShows: [], stale: true };
  }
}

/**
 * Returns the timestamp of the last successful cache write, or null.
 */
export function getCacheAge(): { fetchedAt: number | null; stale: boolean } {
  const cached = readCache(CACHE_KEY);
  if (!cached) return { fetchedAt: null, stale: true };
  return { fetchedAt: cached.fetchedAt, stale: !isFresh(cached) };
}
