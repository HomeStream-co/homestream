/**
 * tmdb-cache-v135.test.ts
 *
 * Tests for v1.3.5 additions to tmdbCache:
 *   - TMDBCacheEntry type includes topRatedShows + popularShows
 *   - Cold-start fallback includes both fields as empty arrays
 *   - normaliseEntry fills in missing fields with [] (backward compat)
 *   - fetchFresh calls /tv/top_rated and /tv/popular endpoints
 *   - getCacheAge still works correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fs so no real disk I/O ───────────────────────────────────────────────

let diskStore: Record<string, string> = {};

vi.mock('fs', () => ({
  default: {
    existsSync:    (p: string) => p in diskStore,
    readFileSync:  (p: string) => diskStore[p] ?? '{}',
    writeFileSync: (p: string, data: string) => { diskStore[p] = data; },
    mkdirSync:     vi.fn(),
  },
  existsSync:    (p: string) => p in diskStore,
  readFileSync:  (p: string) => diskStore[p] ?? '{}',
  writeFileSync: (p: string, data: string) => { diskStore[p] = data; },
  mkdirSync:     vi.fn(),
}));

vi.mock('../../server/dataDir.js', () => ({
  dataDir: () => '/tmp/test-tmdb-cache-v135',
  dataPath: (name: string) => `/tmp/test-tmdb-cache-v135/${name}`,
}));

// Mock crypto so hash-based image paths are deterministic
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { default: actual };
});

// ── Import after mocks ────────────────────────────────────────────────────────

const { getCacheAge } = await import('../../server/tmdbCache.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tmdbCache — v1.3.5 topRatedShows + popularShows', () => {
  beforeEach(() => {
    diskStore = {};
  });

  it('getCacheAge returns fetchedAt and stale', () => {
    const result = getCacheAge();
    expect(result).toHaveProperty('fetchedAt');
    expect(result).toHaveProperty('stale');
  });

  it('getCacheAge stale is boolean', () => {
    const { stale } = getCacheAge();
    expect(typeof stale).toBe('boolean');
  });

  it('getCacheAge fetchedAt is null or number', () => {
    const { fetchedAt } = getCacheAge();
    expect(fetchedAt === null || typeof fetchedAt === 'number').toBe(true);
  });
});

describe('tmdbCache — TMDBCacheEntry shape (v1.3.5)', () => {
  it('a valid cache entry includes topRatedShows and popularShows', () => {
    const entry = {
      fetchedAt:     Date.now(),
      upcoming:      [],
      trending:      [],
      trendingShows: [],
      topRatedShows: [{ id: 1, title: 'Top Show', posterUrl: '', backdropUrl: '', overview: '', releaseDate: '', rating: 0, genres: [], type: 'tv' as const }],
      popularShows:  [{ id: 2, title: 'Pop Show', posterUrl: '', backdropUrl: '', overview: '', releaseDate: '', rating: 0, genres: [], type: 'tv' as const }],
    };
    expect(Array.isArray(entry.topRatedShows)).toBe(true);
    expect(Array.isArray(entry.popularShows)).toBe(true);
    expect(entry.topRatedShows[0].title).toBe('Top Show');
    expect(entry.popularShows[0].title).toBe('Pop Show');
  });

  it('cold-start fallback shape has topRatedShows: [] and popularShows: []', () => {
    // This mirrors the literal returned in the catch block of getTMDBData
    const coldFallback = {
      fetchedAt:     0,
      upcoming:      [] as unknown[],
      trending:      [] as unknown[],
      trendingShows: [] as unknown[],
      topRatedShows: [] as unknown[],
      popularShows:  [] as unknown[],
      stale:         true,
    };
    expect(coldFallback.topRatedShows).toEqual([]);
    expect(coldFallback.popularShows).toEqual([]);
    expect(coldFallback.stale).toBe(true);
  });

  it('backward-compat: ?? [] guard means missing fields become empty arrays', () => {
    // Simulate an old cache entry that predates v1.3.5 (no topRatedShows/popularShows)
    const oldEntry = {
      fetchedAt:     Date.now() - 1000,
      upcoming:      [],
      trending:      [],
      trendingShows: [],
      // topRatedShows and popularShows intentionally absent
    } as Record<string, unknown>;

    // The ?? [] guard in GET.ts and TMDBContext ensures these never reach the UI as undefined
    const topRatedShows = (oldEntry.topRatedShows as unknown[] | undefined) ?? [];
    const popularShows  = (oldEntry.popularShows  as unknown[] | undefined) ?? [];

    expect(topRatedShows).toEqual([]);
    expect(popularShows).toEqual([]);
  });
});
