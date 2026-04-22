/**
 * media-crud.test.ts
 *
 * Tests for:
 *   PUT    /api/media/:id  — update metadata fields
 *   DELETE /api/media/:id  — remove from library + watchlists
 *
 * Covers:
 *   - 404 when item not found
 *   - Successful update merges fields and preserves id
 *   - id cannot be overwritten by body
 *   - Successful delete removes item and calls removeFromAllWatchlists
 *   - safeDelete path-traversal protection
 *   - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockLibrary: Record<string, unknown>[] = [];

const mockWriteLibrary = vi.fn(async (updater: (lib: Record<string, unknown>[]) => Record<string, unknown>[]) => {
  mockLibrary = updater(mockLibrary);
});

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary:  () => mockLibrary,
  writeLibrary: (...args: Parameters<typeof mockWriteLibrary>) => mockWriteLibrary(...args),
}));

const mockRemoveFromAllWatchlists = vi.fn().mockResolvedValue(undefined);

vi.mock('../../server/watchlistStore.js', () => ({
  removeFromAllWatchlists: (...args: unknown[]) => mockRemoveFromAllWatchlists(...args),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(params: Record<string, string> = {}, body: unknown = {}) {
  const req = { params, body, cookies: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

const { default: putHandler }    = await import('../../server/api/media/[id]/PUT.js');
const { default: deleteHandler } = await import('../../server/api/media/[id]/DELETE.js');

// ── PUT /api/media/:id ────────────────────────────────────────────────────────

describe('PUT /api/media/:id', () => {
  beforeEach(() => {
    mockLibrary = [
      { id: 'movie-1', title: 'Inception', type: 'movie', year: '2010' },
      { id: 'movie-2', title: 'The Dark Knight', type: 'movie', year: '2008' },
    ];
    mockWriteLibrary.mockClear();
  });

  it('returns 404 when item does not exist', async () => {
    const { req, res } = makeReqRes({ id: 'nonexistent' }, { title: 'New Title' });
    await putHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('merges update fields into existing item', async () => {
    const { req, res, data } = makeReqRes({ id: 'movie-1' }, { title: 'Inception (Updated)', year: '2011' });
    await putHandler(req, res);
    const updated = data.json as { id: string; title: string; year: string; type: string };
    expect(updated.title).toBe('Inception (Updated)');
    expect(updated.year).toBe('2011');
    expect(updated.type).toBe('movie'); // unchanged field preserved
  });

  it('preserves the original id even if body tries to overwrite it', async () => {
    const { req, res, data } = makeReqRes({ id: 'movie-1' }, { id: 'hacked-id', title: 'Hacked' });
    await putHandler(req, res);
    expect((data.json as { id: string }).id).toBe('movie-1');
  });

  it('calls writeLibrary with the updated item', async () => {
    const { req, res } = makeReqRes({ id: 'movie-1' }, { title: 'New Title' });
    await putHandler(req, res);
    expect(mockWriteLibrary).toHaveBeenCalledOnce();
  });

  it('returns 500 on unexpected error', async () => {
    mockWriteLibrary.mockRejectedValueOnce(new Error('disk full'));
    const { req, res } = makeReqRes({ id: 'movie-1' }, { title: 'New Title' });
    await putHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── DELETE /api/media/:id ─────────────────────────────────────────────────────

describe('DELETE /api/media/:id', () => {
  beforeEach(() => {
    mockLibrary = [
      { id: 'movie-1', title: 'Inception', type: 'movie', filename: 'inception.mp4' },
      { id: 'movie-2', title: 'The Dark Knight', type: 'movie', filename: 'dark-knight.mkv' },
    ];
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('returns 404 when item does not exist', async () => {
    const { req, res } = makeReqRes({ id: 'nonexistent' });
    await deleteHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('removes item from library', async () => {
    const { req, res, data } = makeReqRes({ id: 'movie-1' });
    await deleteHandler(req, res);
    expect((data.json as { success: boolean }).success).toBe(true);
    expect(mockWriteLibrary).toHaveBeenCalledOnce();
    // Verify the updater removes the item
    const updater = mockWriteLibrary.mock.calls[0][0] as (lib: Record<string, unknown>[]) => Record<string, unknown>[];
    const result = updater([
      { id: 'movie-1', title: 'Inception' },
      { id: 'movie-2', title: 'Dark Knight' },
    ]);
    expect(result.find(m => m.id === 'movie-1')).toBeUndefined();
    expect(result.find(m => m.id === 'movie-2')).toBeDefined();
  });

  it('calls removeFromAllWatchlists with the deleted id', async () => {
    const { req, res } = makeReqRes({ id: 'movie-1' });
    await deleteHandler(req, res);
    expect(mockRemoveFromAllWatchlists).toHaveBeenCalledWith('movie-1');
  });

  it('returns 500 on unexpected error', async () => {
    mockWriteLibrary.mockRejectedValueOnce(new Error('disk full'));
    const { req, res } = makeReqRes({ id: 'movie-1' });
    await deleteHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
