/**
 * watchlist-api.test.ts
 *
 * Full coverage of the three watchlist HTTP endpoints:
 *   GET    /api/watchlist?profile=<id>
 *   PUT    /api/watchlist/:id?profile=<id>
 *   DELETE /api/watchlist/:id?profile=<id>
 *
 * Tests cover:
 *   - Auth guard (401 when no session cookie)
 *   - Default profile fallback ('adult' when no ?profile param)
 *   - GET returns correct list per profile
 *   - PUT adds item, is idempotent, returns updated list
 *   - DELETE removes item, is idempotent, returns updated list
 *   - Profile isolation (one profile's list never bleeds into another)
 *   - 500 handling when store throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadWatchlist  = vi.fn();
const mockAddToWatchlist = vi.fn();
const mockRemoveFromWatchlist = vi.fn();
let   mockAuthed = true;

vi.mock('../../server/watchlistStore.js', () => ({
  readWatchlist:       (...a: unknown[]) => mockReadWatchlist(...a),
  addToWatchlist:      (...a: unknown[]) => mockAddToWatchlist(...a),
  removeFromWatchlist: (...a: unknown[]) => mockRemoveFromWatchlist(...a),
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
    statusCode: number;
    body: unknown;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query:  {},
    params: {},
    body:   {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies: { session: 'tok' },
    ...overrides,
  } as unknown as Request;
}

// ── GET /api/watchlist ────────────────────────────────────────────────────────

describe('GET /api/watchlist', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadWatchlist.mockReset();
    const mod = await import('../../server/api/watchlist/GET.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const req = makeReq();
    const res = makeRes();
    handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('defaults to adult profile when no ?profile param', () => {
    mockReadWatchlist.mockReturnValue(['id1', 'id2']);
    const req = makeReq({ query: {} });
    const res = makeRes();
    handler(req, res as unknown as Response);
    expect(mockReadWatchlist).toHaveBeenCalledWith('adult');
    expect(res.body).toEqual(['id1', 'id2']);
  });

  it('uses the supplied ?profile param', () => {
    mockReadWatchlist.mockReturnValue(['id3']);
    const req = makeReq({ query: { profile: 'kids' } });
    const res = makeRes();
    handler(req, res as unknown as Response);
    expect(mockReadWatchlist).toHaveBeenCalledWith('kids');
    expect(res.body).toEqual(['id3']);
  });

  it('returns empty array when profile has no watchlist', () => {
    mockReadWatchlist.mockReturnValue([]);
    const req = makeReq({ query: { profile: 'newprofile' } });
    const res = makeRes();
    handler(req, res as unknown as Response);
    expect(res.body).toEqual([]);
  });

  it('trims whitespace from profile param', () => {
    mockReadWatchlist.mockReturnValue([]);
    const req = makeReq({ query: { profile: '  kids  ' } });
    const res = makeRes();
    handler(req, res as unknown as Response);
    expect(mockReadWatchlist).toHaveBeenCalledWith('kids');
  });
});

// ── PUT /api/watchlist/:id ────────────────────────────────────────────────────

describe('PUT /api/watchlist/:id', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockAddToWatchlist.mockReset();
    const mod = await import('../../server/api/watchlist/[id]/PUT.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const req = makeReq({ params: { id: 'movie1' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('adds item to adult profile by default', async () => {
    mockAddToWatchlist.mockResolvedValue(['movie1']);
    const req = makeReq({ params: { id: 'movie1' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockAddToWatchlist).toHaveBeenCalledWith('movie1', 'adult');
    expect(res.body).toEqual({ watchlist: ['movie1'] });
  });

  it('adds item to specified profile', async () => {
    mockAddToWatchlist.mockResolvedValue(['movie1', 'movie2']);
    const req = makeReq({ params: { id: 'movie2' }, query: { profile: 'kids' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockAddToWatchlist).toHaveBeenCalledWith('movie2', 'kids');
    expect(res.body).toEqual({ watchlist: ['movie1', 'movie2'] });
  });

  it('is idempotent — returns same list if item already present', async () => {
    mockAddToWatchlist.mockResolvedValue(['movie1']); // store returns same list
    const req = makeReq({ params: { id: 'movie1' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ watchlist: ['movie1'] });
  });

  it('returns 500 when store throws', async () => {
    mockAddToWatchlist.mockRejectedValue(new Error('disk full'));
    const req = makeReq({ params: { id: 'movie1' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to add to watchlist');
  });

  it('trims whitespace from profile param', async () => {
    mockAddToWatchlist.mockResolvedValue(['x']);
    const req = makeReq({ params: { id: 'x' }, query: { profile: '  adult  ' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockAddToWatchlist).toHaveBeenCalledWith('x', 'adult');
  });
});

// ── DELETE /api/watchlist/:id ─────────────────────────────────────────────────

describe('DELETE /api/watchlist/:id', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockRemoveFromWatchlist.mockReset();
    const mod = await import('../../server/api/watchlist/[id]/DELETE.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const req = makeReq({ params: { id: 'movie1' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('removes item from adult profile by default', async () => {
    mockRemoveFromWatchlist.mockResolvedValue([]);
    const req = makeReq({ params: { id: 'movie1' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('movie1', 'adult');
    expect(res.body).toEqual({ watchlist: [] });
  });

  it('removes item from specified profile', async () => {
    mockRemoveFromWatchlist.mockResolvedValue(['movie2']);
    const req = makeReq({ params: { id: 'movie1' }, query: { profile: 'kids' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('movie1', 'kids');
    expect(res.body).toEqual({ watchlist: ['movie2'] });
  });

  it('is idempotent — returns same list if item not present', async () => {
    mockRemoveFromWatchlist.mockResolvedValue(['movie2']); // item wasn't there
    const req = makeReq({ params: { id: 'ghost' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ watchlist: ['movie2'] });
  });

  it('returns 500 when store throws', async () => {
    mockRemoveFromWatchlist.mockRejectedValue(new Error('io error'));
    const req = makeReq({ params: { id: 'movie1' }, query: {} });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to remove from watchlist');
  });

  it('profile isolation — only touches the specified profile', async () => {
    mockRemoveFromWatchlist.mockResolvedValue(['movie3']);
    const req = makeReq({ params: { id: 'movie1' }, query: { profile: 'teen' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('movie1', 'teen');
    // adult profile untouched — store mock only called once with 'teen'
    expect(mockRemoveFromWatchlist).toHaveBeenCalledTimes(1);
  });
});
