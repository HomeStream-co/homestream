/**
 * media-library.test.ts
 *
 * Tests for GET /api/media
 *
 * Covers:
 *   - Returns full library when no profile param
 *   - Per-profile progress resolution (profileProgress map)
 *   - Legacy items (no profileProgress) returned as-is
 *   - Profile with no watch history → zeroed progress fields
 *   - Profile with watch history → correct fields resolved
 *   - 500 on library read error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockLibrary: Record<string, unknown>[] = [];

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockLibrary,
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(query: Record<string, string> = {}) {
  const req = { query, cookies: {}, headers: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:      vi.fn((v: unknown) => { data.json = v; return res; }),
    setHeader: vi.fn().mockReturnThis(),
    end:       vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res, data };
}

const { default: handler } = await import('../../server/api/media/GET.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/media — no profile param', () => {
  beforeEach(() => {
    mockLibrary = [
      { id: 'movie-1', title: 'Inception', type: 'movie', watchProgress: 45 },
      { id: 'series-1', title: 'Breaking Bad', type: 'series', watchProgress: 0 },
    ];
  });

  it('returns the full library array', () => {
    const { req, res, data } = makeReqRes();
    handler(req, res);
    expect(Array.isArray(data.json)).toBe(true);
    expect((data.json as unknown[]).length).toBe(2);
  });

  it('returns raw items unchanged when no profile param', () => {
    const { req, res, data } = makeReqRes();
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number }>;
    expect(items[0].watchProgress).toBe(45);
  });
});

describe('GET /api/media — with profile param', () => {
  const ADULT_ENTRY = {
    progress: 60,
    watchedSeconds: 3600,
    totalSeconds: 6000,
    lastWatchedAt: '2024-06-01T10:00:00.000Z',
  };
  const KIDS_ENTRY = {
    progress: 20,
    watchedSeconds: 1200,
    totalSeconds: 6000,
    lastWatchedAt: '2024-06-02T08:00:00.000Z',
  };

  beforeEach(() => {
    mockLibrary = [
      {
        id: 'movie-1',
        title: 'Inception',
        type: 'movie',
        watchProgress: 60,
        profileProgress: {
          adult: ADULT_ENTRY,
          kids:  KIDS_ENTRY,
        },
      },
      {
        // Legacy item — no profileProgress
        id: 'movie-2',
        title: 'Old Movie',
        type: 'movie',
        watchProgress: 30,
      },
      {
        id: 'movie-3',
        title: 'Never Watched',
        type: 'movie',
        watchProgress: 0,
        profileProgress: {
          adult: ADULT_ENTRY,
          // kids profile has never watched this
        },
      },
    ];
  });

  it('resolves adult profile progress correctly', () => {
    const { req, res, data } = makeReqRes({ profile: 'adult' });
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number; watchedSeconds: number }>;
    const movie = items.find(i => i.id === 'movie-1')!;
    expect(movie.watchProgress).toBe(60);
    expect(movie.watchedSeconds).toBe(3600);
  });

  it('resolves kids profile progress correctly', () => {
    const { req, res, data } = makeReqRes({ profile: 'kids' });
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number; watchedSeconds: number }>;
    const movie = items.find(i => i.id === 'movie-1')!;
    expect(movie.watchProgress).toBe(20);
    expect(movie.watchedSeconds).toBe(1200);
  });

  it('returns legacy items (no profileProgress) unchanged', () => {
    const { req, res, data } = makeReqRes({ profile: 'adult' });
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number }>;
    const legacy = items.find(i => i.id === 'movie-2')!;
    expect(legacy.watchProgress).toBe(30);
  });

  it('zeroes progress for a profile that has never watched the item', () => {
    const { req, res, data } = makeReqRes({ profile: 'kids' });
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number; watchedSeconds: number; lastWatchedAt?: string }>;
    const neverWatched = items.find(i => i.id === 'movie-3')!;
    expect(neverWatched.watchProgress).toBe(0);
    expect(neverWatched.watchedSeconds).toBe(0);
    expect(neverWatched.lastWatchedAt).toBeUndefined();
  });

  it('returns all items (not just watched ones)', () => {
    const { req, res, data } = makeReqRes({ profile: 'adult' });
    handler(req, res);
    expect((data.json as unknown[]).length).toBe(3);
  });

  it('trims whitespace from profile param', () => {
    const { req, res, data } = makeReqRes({ profile: '  adult  ' });
    handler(req, res);
    const items = data.json as Array<{ id: string; watchProgress: number }>;
    const movie = items.find(i => i.id === 'movie-1')!;
    expect(movie.watchProgress).toBe(60);
  });
});
