/**
 * tmdb-api-v135.test.ts
 *
 * Tests for v1.3.5 additions to GET /api/tmdb:
 *   - Response includes topRatedShows and popularShows arrays
 *   - Both fields are arrays (never undefined)
 *   - Existing fields (upcoming, trending, trendingShows) still present
 *   - Error fallback also includes topRatedShows + popularShows
 *   - Auth guard still enforced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

const mockGetTMDBData      = vi.fn();
const mockGetRecommendations = vi.fn();
const mockGetCacheAge      = vi.fn();
let   mockAuthed           = true;

vi.mock('../../server/tmdbCache.js', () => ({
  getTMDBData:        (...a: unknown[]) => mockGetTMDBData(...a),
  getRecommendations: (...a: unknown[]) => mockGetRecommendations(...a),
  getCacheAge:        (...a: unknown[]) => mockGetCacheAge(...a),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
  };
  return res;
}

function makeReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function makeCacheData(overrides: Record<string, unknown> = {}) {
  return {
    upcoming:      [{ id: 1, title: 'Movie A' }],
    trending:      [{ id: 2, title: 'Movie B' }],
    trendingShows: [{ id: 3, title: 'Show A' }],
    topRatedShows: [{ id: 4, title: 'Show B' }],
    popularShows:  [{ id: 5, title: 'Show C' }],
    fetchedAt:     Date.now(),
    stale:         false,
    ...overrides,
  };
}

// ── Import handler AFTER mocks ────────────────────────────────────────────────

const { default: handler } = await import('../../server/api/tmdb/GET.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/tmdb — v1.3.5 topRatedShows + popularShows', () => {
  beforeEach(() => {
    mockAuthed = true;
    mockGetCacheAge.mockReturnValue({ fetchedAt: Date.now(), stale: false });
    mockGetRecommendations.mockResolvedValue([]);
  });

  it('returns topRatedShows array in response', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData());
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(Array.isArray(body.topRatedShows)).toBe(true);
  });

  it('returns popularShows array in response', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData());
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(Array.isArray(body.popularShows)).toBe(true);
  });

  it('topRatedShows contains the data from cache', async () => {
    const topRated = [{ id: 99, title: 'Top Show' }];
    mockGetTMDBData.mockResolvedValue(makeCacheData({ topRatedShows: topRated }));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.topRatedShows).toEqual(topRated);
  });

  it('popularShows contains the data from cache', async () => {
    const popular = [{ id: 88, title: 'Popular Show' }];
    mockGetTMDBData.mockResolvedValue(makeCacheData({ popularShows: popular }));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.popularShows).toEqual(popular);
  });

  it('topRatedShows defaults to [] when cache returns undefined', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData({ topRatedShows: undefined }));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.topRatedShows).toEqual([]);
  });

  it('popularShows defaults to [] when cache returns undefined', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData({ popularShows: undefined }));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.popularShows).toEqual([]);
  });

  it('still returns upcoming, trending, trendingShows alongside new fields', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData());
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(Array.isArray(body.upcoming)).toBe(true);
    expect(Array.isArray(body.trending)).toBe(true);
    expect(Array.isArray(body.trendingShows)).toBe(true);
    expect(Array.isArray(body.topRatedShows)).toBe(true);
    expect(Array.isArray(body.popularShows)).toBe(true);
  });

  it('error fallback includes topRatedShows: [] and popularShows: []', async () => {
    mockGetTMDBData.mockRejectedValue(new Error('TMDB unreachable'));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.topRatedShows).toEqual([]);
    expect(body.popularShows).toEqual([]);
  });

  it('error fallback still returns 200 (not 500)', async () => {
    mockGetTMDBData.mockRejectedValue(new Error('network error'));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res._status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res._status).toBe(401);
  });

  it('passes forceRefresh=true when ?refresh=1', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData());
    const res = makeRes();
    await handler(makeReq({ refresh: '1' }), res as unknown as Response);
    expect(mockGetTMDBData).toHaveBeenCalledWith(true);
  });

  it('passes forceRefresh=false when no ?refresh param', async () => {
    mockGetTMDBData.mockResolvedValue(makeCacheData());
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(mockGetTMDBData).toHaveBeenCalledWith(false);
  });

  it('response includes fetchedAt and stale fields', async () => {
    const fetchedAt = Date.now();
    mockGetTMDBData.mockResolvedValue(makeCacheData({ fetchedAt, stale: false }));
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res._body as Record<string, unknown>;
    expect(body.fetchedAt).toBe(fetchedAt);
    expect(body.stale).toBe(false);
  });
});
