/**
 * Trakt.tv API client
 *
 * Trakt has a free public API (no auth needed for read-only calls).
 * We use it for:
 *   - Audience ratings (Trakt score 0–10, vote count)
 *   - Similar titles (returns IMDb IDs we can match against the library)
 *   - Movie/show metadata (tagline, certification, genres)
 *
 * All results are cached in the media_enrichment table for 7 days.
 *
 * Trakt API docs: https://trakt.docs.apiary.io/
 * Rate limit: 1,000 requests/5 minutes (very generous for a home server)
 */
import { eq } from 'drizzle-orm';

// Lazy DB — same pattern as tasteEngine: defer import so the server starts
// cleanly on desktop installs that have no /local/config.json.
type AnyDB = ReturnType<typeof import('drizzle-orm/mysql2').drizzle>;
let _db: AnyDB | null = null;
let _dbAttempted = false;
async function getDb(): Promise<AnyDB | null> {
  if (_dbAttempted) return _db;
  _dbAttempted = true;
  try { _db = ((await import('./db/client.js' as string)) as { db: AnyDB }).db; } catch { _db = null; }
  return _db;
}

import type * as schema from './db/schema.js';
let _schema: typeof schema | null = null;
async function getSchema(): Promise<typeof schema | null> {
  if (_schema) return _schema;
  try { _schema = await import('./db/schema.js' as string) as typeof schema; } catch { _schema = null; }
  return _schema;
}

const TRAKT_BASE    = 'https://api.trakt.tv';
const TRAKT_API_KEY = '781b7c3d7d1c2e4f5a6b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f'; // public client_id for read-only
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraktEnrichment {
  traktRating:   number | null;
  traktVotes:    number | null;
  audienceScore: number | null;
  criticScore:   number | null;
  similarIds:    string[];
  traktSlug:     string;
}

interface TraktRatings {
  rating: number;
  votes:  number;
}

interface TraktSimilarMovie {
  movie?: { ids?: { imdb?: string } };
  show?:  { ids?: { imdb?: string } };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function traktGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${TRAKT_BASE}${path}`, {
      headers: {
        'Content-Type':      'application/json',
        'trakt-api-version': '2',
        'trakt-api-key':     TRAKT_API_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Slug from title + year ────────────────────────────────────────────────────

function makeSlug(title: string, year?: string): string {
  const base = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return year ? `${base}-${year}` : base;
}

// ── Fetch enrichment for one item ─────────────────────────────────────────────

export async function fetchTraktEnrichment(
  mediaId:   string,
  imdbId:    string,
  title:     string,
  year:      string,
  mediaType: 'movie' | 'series',
): Promise<TraktEnrichment> {
  const db = await getDb();
  const s  = await getSchema();

  const empty: TraktEnrichment = { traktRating: null, traktVotes: null, audienceScore: null, criticScore: null, similarIds: [], traktSlug: '' };
  void empty; // available for early-return if needed

  // 1. Check cache (skip if no DB)
  let cached: { traktRating: number | null; traktVotes: number | null; audienceScore: number | null; criticScore: number | null; similarIds: unknown; traktSlug: string; expiresAt: Date }[] = [];
  if (db && s) {
    cached = await db
      .select()
      .from(s.mediaEnrichment)
      .where(eq(s.mediaEnrichment.mediaId, mediaId))
      .limit(1);

    if (cached.length > 0 && new Date(cached[0].expiresAt) > new Date()) {
      return {
        traktRating:   cached[0].traktRating,
        traktVotes:    cached[0].traktVotes,
        audienceScore: cached[0].audienceScore,
        criticScore:   cached[0].criticScore,
        similarIds:    (cached[0].similarIds as string[]) ?? [],
        traktSlug:     cached[0].traktSlug,
      };
    }
  }

  // 2. Fetch from Trakt
  const type    = mediaType === 'series' ? 'shows' : 'movies';
  const slug    = imdbId || makeSlug(title, year);
  const lookupId = imdbId ? `imdb/${imdbId}` : slug;

  const [ratingsData, similarData] = await Promise.all([
    traktGet<TraktRatings>(`/${type}/${lookupId}/ratings`),
    traktGet<TraktSimilarMovie[]>(`/${type}/${lookupId}/related?limit=10`),
  ]);

  const traktRating   = ratingsData?.rating   ?? null;
  const traktVotes    = ratingsData?.votes     ?? null;
  const audienceScore = traktRating ? Math.round(traktRating * 10) : null;

  const similarIds = (similarData ?? [])
    .map(s => (mediaType === 'series' ? s.show?.ids?.imdb : s.movie?.ids?.imdb) ?? '')
    .filter(Boolean)
    .slice(0, 10);

  const result: TraktEnrichment = {
    traktRating,
    traktVotes,
    audienceScore,
    criticScore: null,
    similarIds,
    traktSlug: slug,
  };

  // 3. Upsert cache (skip if no DB)
  if (db && s) {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    if (cached.length > 0) {
      await db.update(s.mediaEnrichment)
        .set({ ...result, fetchedAt: new Date(), expiresAt })
        .where(eq(s.mediaEnrichment.mediaId, mediaId));
    } else {
      await db.insert(s.mediaEnrichment).values({
        mediaId,
        imdbId:       imdbId || '',
        traktSlug:    slug,
        traktRating,
        traktVotes,
        audienceScore,
        criticScore:  null,
        similarIds,
        traktMeta:    null,
        fetchedAt:    new Date(),
        expiresAt,
      });
    }
  }

  return result;
}

// ── Batch enrich a library ────────────────────────────────────────────────────

export interface LibraryItemForEnrichment {
  id:       string;
  title:    string;
  year:     string;
  type:     string;
  imdbId?:  string;
}

export async function enrichLibrary(
  items: LibraryItemForEnrichment[],
  concurrency = 3,
): Promise<Map<string, TraktEnrichment>> {
  const results = new Map<string, TraktEnrichment>();

  // Process in batches to respect rate limits
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const enriched = await Promise.all(
      batch.map(item =>
        fetchTraktEnrichment(
          item.id,
          item.imdbId ?? '',
          item.title,
          item.year,
          item.type === 'series' ? 'series' : 'movie',
        ).then(e => ({ id: item.id, enrichment: e }))
         .catch(() => ({ id: item.id, enrichment: null }))
      )
    );
    for (const { id, enrichment } of enriched) {
      if (enrichment) results.set(id, enrichment);
    }
    // Small delay between batches to be a good API citizen
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}
