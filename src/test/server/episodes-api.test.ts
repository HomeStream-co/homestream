/**
 * episodes-api.test.ts
 *
 * Full coverage of the three episode HTTP endpoints:
 *   GET   /api/media/:id/episodes
 *   POST  /api/media/:id/episodes
 *   PATCH /api/media/:id/episodes/:episodeId
 *
 * Tests cover:
 *   - Auth guard (401 when unauthenticated)
 *   - GET: 404 when media not found
 *   - GET: 400 when item is not a series
 *   - GET: returns episodes array (empty if none)
 *   - POST: 404 when media not found
 *   - POST: 400 when item is not a series
 *   - POST: adds single episode, deduplicates by season+episode
 *   - POST: bulk episode import, merges with existing, sorts
 *   - PATCH: marks episode watched/unwatched
 *   - PATCH: 404 when series not found
 *   - PATCH: 404 when episode not found
 *   - 500 handling for all three endpoints
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

const SERIES_ITEM = {
  id: 'show1', title: 'Test Show', type: 'series',
  episodes: [
    { id: 'ep-aaa', season: 1, episode: 1, title: 'Pilot', watched: false },
    { id: 'ep-bbb', season: 1, episode: 2, title: 'Episode 2', watched: true, watchedAt: '2024-01-10T00:00:00Z' },
  ],
};

const MOVIE_ITEM = { id: 'movie1', title: 'A Movie', type: 'movie' };

// ── GET /api/media/:id/episodes ───────────────────────────────────────────────

describe('GET /api/media/:id/episodes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: Request, res: Response) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset();
    const mod = await import('../../server/api/media/[id]/episodes/GET.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show1' } }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when media item not found', async () => {
    mockReadLibrary.mockReturnValue([]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'missing' } }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe('Media item not found');
  });

  it('returns 400 when item is not a series', async () => {
    mockReadLibrary.mockReturnValue([MOVIE_ITEM]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'movie1' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('Item is not a TV series');
  });

  it('returns episodes array for a valid series', async () => {
    mockReadLibrary.mockReturnValue([SERIES_ITEM]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show1' } }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect((res.body as { id: string }[])[0].id).toBe('ep-aaa');
  });

  it('returns empty array when series has no episodes yet', async () => {
    mockReadLibrary.mockReturnValue([{ id: 'show2', type: 'series' }]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show2' } }), res as unknown as Response);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when library read throws', async () => {
    mockReadLibrary.mockImplementation(() => { throw new Error('io error'); });
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show1' } }), res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to fetch episodes');
  });
});

// ── POST /api/media/:id/episodes ──────────────────────────────────────────────

describe('POST /api/media/:id/episodes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: Request, res: Response) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset();
    mockWriteLibrary.mockReset();
    const mod = await import('../../server/api/media/[id]/episodes/POST.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show1' } }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when media item not found', async () => {
    mockReadLibrary.mockReturnValue([]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'missing' }, body: { season: 1, episode: 3 } }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when item is not a series', async () => {
    mockReadLibrary.mockReturnValue([MOVIE_ITEM]);
    const res = makeRes();
    await handler(makeReq({ params: { id: 'movie1' }, body: { season: 1, episode: 1 } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('adds a single new episode and returns merged sorted list', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    let savedEpisodes: unknown[] = [];
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [{ ...SERIES_ITEM }];
      const result = updater(lib) as typeof lib;
      savedEpisodes = (result[0] as { episodes: unknown[] }).episodes;
    });

    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1' }, body: { season: 1, episode: 3, title: 'Episode 3' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    const episodes = res.body as { season: number; episode: number }[];
    expect(episodes).toHaveLength(3);
    // Sorted: S1E1, S1E2, S1E3
    expect(episodes[2].episode).toBe(3);
    expect(savedEpisodes).toHaveLength(3);
  });

  it('deduplicates by season+episode — does not add duplicate', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [{ ...SERIES_ITEM }];
      updater(lib);
    });

    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1' }, body: { season: 1, episode: 1, title: 'Pilot Again' } }),
      res as unknown as Response,
    );

    const episodes = res.body as unknown[];
    expect(episodes).toHaveLength(2); // no duplicate added
  });

  it('accepts bulk array of episodes', async () => {
    mockReadLibrary.mockReturnValue([{ id: 'show2', type: 'series', episodes: [] }]);
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [{ id: 'show2', type: 'series', episodes: [] }];
      updater(lib);
    });

    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'show2' },
        body: [
          { season: 1, episode: 1, title: 'Ep1' },
          { season: 1, episode: 2, title: 'Ep2' },
          { season: 2, episode: 1, title: 'S2E1' },
        ],
      }),
      res as unknown as Response,
    );

    const episodes = res.body as { season: number; episode: number }[];
    expect(episodes).toHaveLength(3);
    // Sorted: S1E1, S1E2, S2E1
    expect(episodes[0]).toMatchObject({ season: 1, episode: 1 });
    expect(episodes[2]).toMatchObject({ season: 2, episode: 1 });
  });

  it('generates unique ids for new episodes', async () => {
    mockReadLibrary.mockReturnValue([{ id: 'show2', type: 'series', episodes: [] }]);
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [{ id: 'show2', type: 'series', episodes: [] }];
      updater(lib);
    });

    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show2' }, body: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] }),
      res as unknown as Response,
    );

    const episodes = res.body as { id: string }[];
    expect(episodes[0].id).not.toBe(episodes[1].id);
    expect(episodes[0].id).toMatch(/^ep-/);
  });

  it('returns 500 when writeLibrary throws', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    mockWriteLibrary.mockRejectedValue(new Error('write error'));
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1' }, body: { season: 2, episode: 1 } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to save episodes');
  });
});

// ── PATCH /api/media/:id/episodes/:episodeId ──────────────────────────────────

describe('PATCH /api/media/:id/episodes/:episodeId', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: Request, res: Response) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset();
    mockWriteLibrary.mockReset();
    const mod = await import('../../server/api/media/[id]/episodes/[episodeId]/PATCH.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq({ params: { id: 'show1', episodeId: 'ep-aaa' } }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when series not found', async () => {
    mockReadLibrary.mockReturnValue([]);
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'missing', episodeId: 'ep-aaa' }, body: { watched: true } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when episode not found in series', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [{ ...SERIES_ITEM }];
      updater(lib);
    });
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1', episodeId: 'ep-ghost' }, body: { watched: true } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(404);
  });

  it('marks episode as watched and sets watchedAt', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    let updatedEp: unknown = null;
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [JSON.parse(JSON.stringify(SERIES_ITEM))];
      const result = updater(lib) as typeof lib;
      const eps = (result[0] as { episodes: { id: string; watched: boolean; watchedAt?: string }[] }).episodes;
      updatedEp = eps.find(e => e.id === 'ep-aaa');
    });

    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1', episodeId: 'ep-aaa' }, body: { watched: true } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    const ep = updatedEp as { watched: boolean; watchedAt?: string };
    expect(ep.watched).toBe(true);
    expect(ep.watchedAt).toBeTruthy();
  });

  it('marks episode as unwatched and clears watchedAt', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    let updatedEp: unknown = null;
    mockWriteLibrary.mockImplementation(async (updater: (lib: unknown[]) => unknown[]) => {
      const lib = [JSON.parse(JSON.stringify(SERIES_ITEM))];
      const result = updater(lib) as typeof lib;
      const eps = (result[0] as { episodes: { id: string; watched: boolean; watchedAt?: string }[] }).episodes;
      updatedEp = eps.find(e => e.id === 'ep-bbb');
    });

    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1', episodeId: 'ep-bbb' }, body: { watched: false } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    const ep = updatedEp as { watched: boolean; watchedAt?: string };
    expect(ep.watched).toBe(false);
    expect(ep.watchedAt).toBeUndefined();
  });

  it('returns 500 when writeLibrary throws', async () => {
    mockReadLibrary.mockReturnValue([{ ...SERIES_ITEM }]);
    mockWriteLibrary.mockRejectedValue(new Error('disk error'));
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'show1', episodeId: 'ep-aaa' }, body: { watched: true } }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(500);
  });
});
