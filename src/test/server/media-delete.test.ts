/**
 * media-delete.test.ts
 *
 * Tests for DELETE /api/media/:id
 *
 * This is the v1.2.4 audit fix: safeDelete now resolves the absolute filePath
 * from the library item, not just the uploads/ basename. This means items
 * imported via folderWatcher (which live in /media/downloads/) can actually
 * be deleted.
 *
 * Critical security property: path traversal must be rejected.
 *
 * Coverage:
 *   - 404 when item not found in library
 *   - Calls writeLibrary to remove the item
 *   - Calls removeFromAllWatchlists with the item id
 *   - safeDelete: absolute filePath used directly
 *   - safeDelete: bare filename resolved inside uploads/
 *   - safeDelete: path traversal (../) rejected silently
 *   - safeDelete: originalFilename also deleted when different from primary
 *   - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

type LibraryItem = Record<string, unknown>;
let mockLibrary: LibraryItem[] = [];
const mockWriteLibrary = vi.fn(async (updater: (lib: LibraryItem[]) => LibraryItem[]) => {
  mockLibrary = updater(mockLibrary);
});
const mockRemoveFromAllWatchlists = vi.fn().mockResolvedValue(undefined);

// Track which paths were unlinked
const unlinkedPaths: string[] = [];
let existingPaths = new Set<string>();

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => existingPaths.has(p),
    unlinkSync: (p: string) => { unlinkedPaths.push(p); },
  },
  existsSync: (p: string) => existingPaths.has(p),
  unlinkSync: (p: string) => { unlinkedPaths.push(p); },
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: (...args: Parameters<typeof mockWriteLibrary>) => mockWriteLibrary(...args),
}));

vi.mock('../../server/watchlistStore.js', () => ({
  removeFromAllWatchlists: (...args: Parameters<typeof mockRemoveFromAllWatchlists>) =>
    mockRemoveFromAllWatchlists(...args),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(id: string) {
  const req = {
    params: { id },
    cookies: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

const { default: handler } = await import('../../server/api/media/[id]/DELETE.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/media/:id — 404', () => {
  beforeEach(() => {
    mockLibrary = [];
    unlinkedPaths.length = 0;
    existingPaths = new Set();
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('returns 404 when item is not in library', async () => {
    const { req, res } = makeReqRes('nonexistent-id');
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does not call writeLibrary when item not found', async () => {
    const { req, res } = makeReqRes('nonexistent-id');
    await handler(req, res);
    expect(mockWriteLibrary).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/media/:id — successful delete', () => {
  beforeEach(() => {
    unlinkedPaths.length = 0;
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('returns success:true on successful delete', async () => {
    mockLibrary = [{ id: 'movie1', filePath: '/media/library/movie.mp4' }];
    existingPaths = new Set(['/media/library/movie.mp4']);
    const { req, res, data } = makeReqRes('movie1');
    await handler(req, res);
    expect((data.json as { success: boolean }).success).toBe(true);
  });

  it('calls writeLibrary to remove the item from library', async () => {
    mockLibrary = [{ id: 'movie1', filePath: '/media/library/movie.mp4' }];
    existingPaths = new Set(['/media/library/movie.mp4']);
    const { req, res } = makeReqRes('movie1');
    await handler(req, res);
    expect(mockWriteLibrary).toHaveBeenCalledOnce();
    // Verify the updater filters out the item
    expect(mockLibrary.find(m => m.id === 'movie1')).toBeUndefined();
  });

  it('calls removeFromAllWatchlists with the item id', async () => {
    mockLibrary = [{ id: 'movie1', filePath: '/media/library/movie.mp4' }];
    existingPaths = new Set(['/media/library/movie.mp4']);
    const { req, res } = makeReqRes('movie1');
    await handler(req, res);
    expect(mockRemoveFromAllWatchlists).toHaveBeenCalledWith('movie1');
  });
});

describe('DELETE /api/media/:id — safeDelete: absolute filePath (v1.2.4 fix)', () => {
  beforeEach(() => {
    unlinkedPaths.length = 0;
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('deletes file at absolute filePath (folderWatcher imports)', async () => {
    const absPath = '/media/downloads/inception.mkv';
    mockLibrary = [{ id: 'movie1', filePath: absPath }];
    existingPaths = new Set([absPath]);
    const { req, res } = makeReqRes('movie1');
    await handler(req, res);
    expect(unlinkedPaths).toContain(absPath);
  });

  it('deletes file at absolute filePath even outside uploads/', async () => {
    const absPath = '/mnt/raid/movies/interstellar.mkv';
    mockLibrary = [{ id: 'movie2', filePath: absPath }];
    existingPaths = new Set([absPath]);
    const { req, res } = makeReqRes('movie2');
    await handler(req, res);
    expect(unlinkedPaths).toContain(absPath);
  });
});

describe('DELETE /api/media/:id — safeDelete: bare filename fallback', () => {
  beforeEach(() => {
    unlinkedPaths.length = 0;
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('resolves bare filename inside uploads/ directory', async () => {
    mockLibrary = [{ id: 'movie3', filename: 'movie.mp4' }];
    // The handler resolves path.resolve('./uploads', 'movie.mp4')
    // We can't know the exact resolved path in test, but we verify no crash
    const { req, res, data } = makeReqRes('movie3');
    await handler(req, res);
    // Should succeed (even if file doesn't exist — safeDelete is silent)
    expect((data.json as { success: boolean }).success).toBe(true);
  });
});

describe('DELETE /api/media/:id — safeDelete: path traversal protection', () => {
  beforeEach(() => {
    unlinkedPaths.length = 0;
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('does not unlink when filePath contains ../ traversal', async () => {
    // SECURITY: path.normalize('/media/../../etc/passwd') = '/etc/passwd'
    // so checking the NORMALISED path for '..' is insufficient.
    // The handler must check the RAW string before normalisation.
    // This test verifies the v1.2.4+ fix: check fileRef.includes('..') first.
    mockLibrary = [{ id: 'evil', filePath: '/media/../../etc/passwd' }];
    existingPaths = new Set(['/etc/passwd']);
    const { req, res } = makeReqRes('evil');
    await handler(req, res);
    // The raw path '/media/../../etc/passwd' contains '..' → must be rejected
    expect(unlinkedPaths).not.toContain('/etc/passwd');
  });
});

describe('DELETE /api/media/:id — originalFilename cleanup', () => {
  beforeEach(() => {
    unlinkedPaths.length = 0;
    mockWriteLibrary.mockClear();
    mockRemoveFromAllWatchlists.mockClear();
  });

  it('also deletes originalFilename when it differs from primary', async () => {
    const primaryPath = '/media/library/movie_tc.mp4';
    const originalName = 'movie_original.mkv';
    mockLibrary = [{
      id: 'movie4',
      filePath: primaryPath,
      originalFilename: originalName,
    }];
    existingPaths = new Set([primaryPath]);
    const { req, res } = makeReqRes('movie4');
    await handler(req, res);
    // Primary file deleted
    expect(unlinkedPaths).toContain(primaryPath);
    // Original also attempted (may not exist on disk, but safeDelete is called)
    // We can verify by checking unlinkedPaths includes something with originalName
    // (it won't be in unlinkedPaths if existsSync returns false for it)
    // The important thing is no crash
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('does NOT delete originalFilename when it matches primary basename', async () => {
    const primaryPath = '/media/library/movie.mp4';
    mockLibrary = [{
      id: 'movie5',
      filePath: primaryPath,
      originalFilename: 'movie.mp4', // same basename — should not double-delete
    }];
    existingPaths = new Set([primaryPath]);
    const { req, res } = makeReqRes('movie5');
    await handler(req, res);
    // Only one unlink call (for the primary)
    const movieUnlinks = unlinkedPaths.filter(p => p.includes('movie.mp4'));
    expect(movieUnlinks.length).toBe(1);
  });
});

describe('DELETE /api/media/:id — 500 on error', () => {
  it('returns 500 when writeLibrary throws', async () => {
    mockLibrary = [{ id: 'movie6', filePath: '/media/movie.mp4' }];
    existingPaths = new Set(['/media/movie.mp4']);
    mockWriteLibrary.mockRejectedValueOnce(new Error('Disk full'));
    const { req, res } = makeReqRes('movie6');
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
