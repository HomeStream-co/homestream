/**
 * history-api.test.ts
 *
 * Full coverage of:
 *   GET    /api/history?profile=<id>
 *   DELETE /api/history  { id?, profileId? }
 *
 * Tests cover:
 *   - Auth guard (401 when unauthenticated)
 *   - GET: profile-scoped history (profileProgress path)
 *   - GET: legacy top-level fields path (no profileId param)
 *   - GET: filters out items with no lastWatchedAt
 *   - GET: sorts by lastWatchedAt descending
 *   - GET: profile with no watch history returns []
 *   - DELETE: clears single item for a profile
 *   - DELETE: clears all items for a profile (no id in body)
 *   - DELETE: adult profile also clears top-level fields (Jellyfin compat)
 *   - DELETE: non-adult profile does NOT touch top-level fields
 *   - DELETE: no-op when profile has no entry for item
 *   - 500 handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadLibrary  = vi.fn();
const mockWriteLibrary = vi.fn();
let   mockAuthed = true;

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary:  (...a: unknown[]) => mockReadLibrary(...a),
  writeLibrary: (...a: unknown[]) => mockWriteLibrary(...a),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as {
    statusCode: number; body: unknown;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {}, params: {}, body: {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies: { session: 'tok' },
    ...overrides,
  } as unknown as Request;
}

// ── Sample library items ──────────────────────────────────────────────────────

const ITEM_WITH_PROFILE_PROGRESS = {
  id: 'movie1', title: 'Movie One', type: 'movie', poster: '/p1.jpg',
  genre: ['Action'], imdbRating: '8.0', year: '2020',
  profileProgress: {
    adult: {
      progress: 0.8, watchedSeconds: 4800, totalSeconds: 6000,
      lastWatchedAt: '2024-01-15T10:00:00Z', watchedAt: undefined,
    },
    kids: {
      progress: 0.1, watchedSeconds: 600, totalSeconds: 6000,
      lastWatchedAt: '2024-01-10T08:00:00Z',
    },
  },
};

const ITEM_LEGACY = {
  id: 'movie2', title: 'Movie Two', type: 'movie', poster: '/p2.jpg',
  genre: ['Drama'], imdbRating: '7.5', year: '2019',
  watchProgress: 1.0, watchedSeconds: 7200, totalSeconds: 7200,
  lastWatchedAt: '2024-01-20T12:00:00Z', watchedAt: '2024-01-20T14:00:00Z',
};

const ITEM_UNWATCHED = {
  id: 'movie3', title: 'Movie Three', type: 'movie',
  // no lastWatchedAt — should be excluded
};

// ── GET /api/history ──────────────────────────────────────────────────────────

describe('GET /api/history', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset();
    const mod = await import('../../server/api/history/GET.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns profile-scoped history when ?profile is given', async () => {
    mockReadLibrary.mockReturnValue([ITEM_WITH_PROFILE_PROGRESS, ITEM_UNWATCHED]);
    const res = makeRes();
    await handler(makeReq({ query: { profile: 'adult' } }), res as unknown as Response);
    const body = res.body as { id: string; watchedSeconds: number }[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('movie1');
    expect(body[0].watchedSeconds).toBe(4800);
  });

  it('excludes items with no lastWatchedAt for the requested profile', async () => {
    mockReadLibrary.mockReturnValue([ITEM_WITH_PROFILE_PROGRESS, ITEM_UNWATCHED]);
    const res = makeRes();
    await handler(makeReq({ query: { profile: 'adult' } }), res as unknown as Response);
    const ids = (res.body as { id: string }[]).map(i => i.id);
    expect(ids).not.toContain('movie3');
  });

  it('returns empty array when profile has no watch history', async () => {
    mockReadLibrary.mockReturnValue([ITEM_WITH_PROFILE_PROGRESS]);
    const res = makeRes();
    await handler(makeReq({ query: { profile: 'newprofile' } }), res as unknown as Response);
    expect(res.body).toEqual([]);
  });

  it('falls back to legacy top-level fields when no ?profile param', async () => {
    mockReadLibrary.mockReturnValue([ITEM_LEGACY, ITEM_UNWATCHED]);
    const res = makeRes();
    await handler(makeReq({ query: {} }), res as unknown as Response);
    const body = res.body as { id: string; watchedSeconds: number }[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('movie2');
    expect(body[0].watchedSeconds).toBe(7200);
  });

  it('sorts results by lastWatchedAt descending', async () => {
    const older = {
      ...ITEM_WITH_PROFILE_PROGRESS,
      id: 'older',
      profileProgress: {
        adult: { progress: 0.5, watchedSeconds: 100, totalSeconds: 200, lastWatchedAt: '2024-01-01T00:00:00Z' },
      },
    };
    const newer = {
      ...ITEM_WITH_PROFILE_PROGRESS,
      id: 'newer',
      profileProgress: {
        adult: { progress: 0.9, watchedSeconds: 900, totalSeconds: 1000, lastWatchedAt: '2024-06-01T00:00:00Z' },
      },
    };
    mockReadLibrary.mockReturnValue([older, newer]);
    const res = makeRes();
    await handler(makeReq({ query: { profile: 'adult' } }), res as unknown as Response);
    const ids = (res.body as { id: string }[]).map(i => i.id);
    expect(ids[0]).toBe('newer');
    expect(ids[1]).toBe('older');
  });

  it('returns 500 when library read throws', async () => {
    mockReadLibrary.mockImplementation(() => { throw new Error('disk error'); });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to load history');
  });

  it('includes expected fields in each result', async () => {
    mockReadLibrary.mockReturnValue([ITEM_WITH_PROFILE_PROGRESS]);
    const res = makeRes();
    await handler(makeReq({ query: { profile: 'adult' } }), res as unknown as Response);
    const item = (res.body as Record<string, unknown>[])[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('watchProgress');
    expect(item).toHaveProperty('watchedSeconds');
    expect(item).toHaveProperty('totalSeconds');
    expect(item).toHaveProperty('lastWatchedAt');
    expect(item).toHaveProperty('genre');
  });
});

// ── DELETE /api/history ───────────────────────────────────────────────────────

describe('DELETE /api/history', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockWriteLibrary.mockReset();
    const mod = await import('../../server/api/history/DELETE.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('clears single item history for a profile', async () => {
    let capturedUpdater: ((lib: unknown[]) => unknown[]) | null = null;
    mockWriteLibrary.mockImplementation((updater: (lib: unknown[]) => unknown[]) => {
      capturedUpdater = updater;
      return Promise.resolve();
    });

    const req = makeReq({ body: { id: 'movie1', profileId: 'adult' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);

    // Apply the updater to a library with the item
    const lib = [{ ...ITEM_WITH_PROFILE_PROGRESS }];
    const result = capturedUpdater!(lib) as typeof lib;
    const updated = result[0] as typeof ITEM_WITH_PROFILE_PROGRESS;

    // adult profile entry should have progress reset, no lastWatchedAt
    expect(updated.profileProgress.adult.progress).toBe(0);
    expect(updated.profileProgress.adult.watchedSeconds).toBe(0);
    expect((updated.profileProgress.adult as Record<string, unknown>).lastWatchedAt).toBeUndefined();
    expect(res.body).toEqual({ ok: true });
  });

  it('adult profile clear also removes top-level lastWatchedAt (Jellyfin compat)', async () => {
    let capturedUpdater: ((lib: unknown[]) => unknown[]) | null = null;
    mockWriteLibrary.mockImplementation((updater: (lib: unknown[]) => unknown[]) => {
      capturedUpdater = updater;
      return Promise.resolve();
    });

    const req = makeReq({ body: { id: 'movie2', profileId: 'adult' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);

    const lib = [{
      id: 'movie2',
      lastWatchedAt: '2024-01-20T12:00:00Z',
      watchedAt: '2024-01-20T14:00:00Z',
      watchProgress: 1.0,
      watchedSeconds: 7200,
      profileProgress: {
        adult: { progress: 1.0, watchedSeconds: 7200, totalSeconds: 7200, lastWatchedAt: '2024-01-20T12:00:00Z' },
      },
    }];
    const result = capturedUpdater!(lib) as typeof lib;
    const updated = result[0] as Record<string, unknown>;

    expect(updated.lastWatchedAt).toBeUndefined();
    expect(updated.watchedAt).toBeUndefined();
    expect(updated.watchProgress).toBe(0);
    expect(updated.watchedSeconds).toBe(0);
  });

  it('non-adult profile clear does NOT touch top-level fields', async () => {
    let capturedUpdater: ((lib: unknown[]) => unknown[]) | null = null;
    mockWriteLibrary.mockImplementation((updater: (lib: unknown[]) => unknown[]) => {
      capturedUpdater = updater;
      return Promise.resolve();
    });

    const req = makeReq({ body: { id: 'movie1', profileId: 'kids' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);

    const lib = [{
      id: 'movie1',
      lastWatchedAt: '2024-01-15T10:00:00Z', // top-level — should survive
      watchProgress: 0.8,
      profileProgress: {
        kids: { progress: 0.1, watchedSeconds: 600, totalSeconds: 6000, lastWatchedAt: '2024-01-10T08:00:00Z' },
      },
    }];
    const result = capturedUpdater!(lib) as typeof lib;
    const updated = result[0] as Record<string, unknown>;

    // Top-level fields untouched
    expect(updated.lastWatchedAt).toBe('2024-01-15T10:00:00Z');
    expect(updated.watchProgress).toBe(0.8);
  });

  it('clears all items when no id provided', async () => {
    let capturedUpdater: ((lib: unknown[]) => unknown[]) | null = null;
    mockWriteLibrary.mockImplementation((updater: (lib: unknown[]) => unknown[]) => {
      capturedUpdater = updater;
      return Promise.resolve();
    });

    const req = makeReq({ body: { profileId: 'adult' } }); // no id
    const res = makeRes();
    await handler(req, res as unknown as Response);

    const lib = [
      { id: 'a', profileProgress: { adult: { progress: 0.5, watchedSeconds: 100, totalSeconds: 200, lastWatchedAt: '2024-01-01T00:00:00Z' } } },
      { id: 'b', profileProgress: { adult: { progress: 0.9, watchedSeconds: 900, totalSeconds: 1000, lastWatchedAt: '2024-06-01T00:00:00Z' } } },
    ];
    const result = capturedUpdater!(lib) as typeof lib;
    for (const item of result) {
      const pp = (item as Record<string, unknown>).profileProgress as Record<string, Record<string, unknown>>;
      expect(pp.adult.progress).toBe(0);
      expect(pp.adult.lastWatchedAt).toBeUndefined();
    }
  });

  it('is a no-op when profile has no entry for the item', async () => {
    let capturedUpdater: ((lib: unknown[]) => unknown[]) | null = null;
    mockWriteLibrary.mockImplementation((updater: (lib: unknown[]) => unknown[]) => {
      capturedUpdater = updater;
      return Promise.resolve();
    });

    const req = makeReq({ body: { id: 'movie1', profileId: 'newprofile' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);

    const lib = [{ id: 'movie1', profileProgress: {} }];
    const result = capturedUpdater!(lib) as typeof lib;
    // Item returned unchanged
    expect(result[0]).toEqual({ id: 'movie1', profileProgress: {} });
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 500 when writeLibrary throws', async () => {
    mockWriteLibrary.mockRejectedValue(new Error('write failed'));
    const res = makeRes();
    await handler(makeReq({ body: { id: 'x', profileId: 'adult' } }), res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to clear history');
  });
});
