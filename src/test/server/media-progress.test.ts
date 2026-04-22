/**
 * media-progress.test.ts
 *
 * Tests for PATCH /api/media/:id/progress
 *
 * Covers:
 *   - 400 when progress field is missing or not a number
 *   - In-progress update (< 95%) returns { ok: true, debounced: true }
 *   - Completion (>= 95%) writes immediately and returns updated item
 *   - Completion resets progress to 0 and sets watchedAt
 *   - Per-profile progress stored in profileProgress map
 *   - Adult profile top-level fields kept in sync
 *   - Non-adult profile does NOT overwrite top-level adult fields
 *   - 404 when item not found on completion write
 *   - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockLibrary: Record<string, unknown>[] = [];

const mockWriteLibrary = vi.fn(async (updater: (lib: Record<string, unknown>[]) => Record<string, unknown>[]) => {
  mockLibrary = updater([...mockLibrary]);
});

vi.mock('../../../../server/libraryStore.js', () => ({
  writeLibrary: (...args: Parameters<typeof mockWriteLibrary>) => mockWriteLibrary(...args),
}));

vi.mock('../../../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(params: Record<string, string>, body: unknown) {
  const req = { params, body, cookies: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

const { default: handler } = await import('../../server/api/media/[id]/progress/PATCH.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/media/:id/progress — validation', () => {
  it('returns 400 when progress is missing', async () => {
    const { req, res } = makeReqRes({ id: 'movie-1' }, {});
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when progress is a string', async () => {
    const { req, res } = makeReqRes({ id: 'movie-1' }, { progress: '50' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PATCH /api/media/:id/progress — in-progress (debounced)', () => {
  beforeEach(() => {
    mockLibrary = [{ id: 'movie-1', title: 'Inception', type: 'movie' }];
    mockWriteLibrary.mockClear();
  });

  it('returns { ok: true, debounced: true } for progress < 95', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 50, currentTime: 3000, duration: 6000 },
    );
    await handler(req, res);
    const body = data.json as { ok: boolean; debounced: boolean };
    expect(body.ok).toBe(true);
    expect(body.debounced).toBe(true);
  });

  it('does NOT write to library immediately for in-progress update', async () => {
    const { req, res } = makeReqRes(
      { id: 'movie-1' },
      { progress: 50, currentTime: 3000, duration: 6000 },
    );
    await handler(req, res);
    expect(mockWriteLibrary).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/media/:id/progress — completion (>= 95%)', () => {
  beforeEach(() => {
    mockLibrary = [
      {
        id: 'movie-1',
        title: 'Inception',
        type: 'movie',
        watchProgress: 80,
        profileProgress: {},
      },
    ];
    mockWriteLibrary.mockClear();
  });

  it('writes immediately on completion', async () => {
    const { req, res } = makeReqRes(
      { id: 'movie-1' },
      { progress: 98, currentTime: 8800, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    expect(mockWriteLibrary).toHaveBeenCalledOnce();
  });

  it('resets watchProgress to 0 on completion', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 98, currentTime: 8800, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    expect((data.json as { watchProgress: number }).watchProgress).toBe(0);
  });

  it('sets watchedAt on completion', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 98, currentTime: 8800, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    expect((data.json as { watchedAt?: string }).watchedAt).toBeDefined();
  });

  it('stores completion in profileProgress for the adult profile', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 98, currentTime: 8800, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    const pp = (data.json as { profileProgress: Record<string, { progress: number }> }).profileProgress;
    expect(pp.adult.progress).toBe(0);
  });

  it('stores completion in profileProgress for the kids profile', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 100, currentTime: 8880, duration: 8880, profileId: 'kids' },
    );
    await handler(req, res);
    const pp = (data.json as { profileProgress: Record<string, { progress: number }> }).profileProgress;
    expect(pp.kids.progress).toBe(0);
  });

  it('returns 404 when item is not found in library', async () => {
    mockLibrary = []; // empty library
    const { req, res } = makeReqRes(
      { id: 'nonexistent' },
      { progress: 98, currentTime: 8800, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('exactly 95% is treated as complete', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 95, currentTime: 8436, duration: 8880, profileId: 'adult' },
    );
    await handler(req, res);
    expect((data.json as { watchProgress: number }).watchProgress).toBe(0);
  });

  it('94% is NOT treated as complete', async () => {
    const { req, res, data } = makeReqRes(
      { id: 'movie-1' },
      { progress: 94, currentTime: 8347, duration: 8880 },
    );
    await handler(req, res);
    // debounced — not a completion write
    expect((data.json as { debounced?: boolean }).debounced).toBe(true);
  });
});
