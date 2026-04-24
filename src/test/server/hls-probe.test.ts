/**
 * hls-probe.test.ts
 *
 * Tests for GET /api/hls/:id/probe — the codec detection endpoint that
 * the player calls on load to decide whether to use direct streaming or
 * HLS transcoding.
 *
 * Critical paths tested:
 *   ✓ Returns needsTranscode:false for h264 (browser-safe)
 *   ✓ Returns needsTranscode:true  for hevc (needs HLS)
 *   ✓ Returns needsTranscode:false for unknown codec (safe fallback)
 *   ✓ 404 when media item not found in library
 *   ✓ Returns needsTranscode:false when file does not exist on disk
 *   ✓ 401 when not authenticated
 *   ✓ 500 when probeCodec throws unexpectedly
 *   ✓ hlsUrl is null when needsTranscode:false
 *   ✓ hlsUrl is /api/hls/:id/index.m3u8 when needsTranscode:true
 *   ✓ Handles item with filepath (legacy) vs filePath (current)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadLibrary  = vi.fn();
const mockProbeCodec   = vi.fn();
const mockExistsSync   = vi.fn();
let   mockAuthed       = true;

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: (...a: unknown[]) => mockReadLibrary(...a),
}));

vi.mock('../../server/hlsTranscoder.js', () => ({
  probeCodec: (...a: unknown[]) => mockProbeCodec(...a),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...a: unknown[]) => mockExistsSync(...a),
    },
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeReq(id: string): Request {
  return { params: { id }, cookies: {} } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/hls/:id/probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthed = true;
    mockExistsSync.mockReturnValue(true);
    mockReadLibrary.mockReturnValue([
      { id: 'movie-1', filePath: '/media/movie.mkv' },
    ]);
    mockProbeCodec.mockResolvedValue({ codec: 'h264', needsTranscode: false });
  });

  it('returns needsTranscode:false + null hlsUrl for h264', async () => {
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'h264', needsTranscode: false, hlsUrl: null })
    );
  });

  it('returns needsTranscode:true + hlsUrl for hevc', async () => {
    mockProbeCodec.mockResolvedValue({ codec: 'hevc', needsTranscode: true });
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'hevc',
        needsTranscode: true,
        hlsUrl: '/api/hls/movie-1/index.m3u8',
      })
    );
  });

  it('returns needsTranscode:false for unknown codec (safe fallback)', async () => {
    mockProbeCodec.mockResolvedValue({ codec: 'unknown', needsTranscode: false });
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ needsTranscode: false, hlsUrl: null })
    );
  });

  it('returns 404 when media item not found', async () => {
    mockReadLibrary.mockReturnValue([]);
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('nonexistent'), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Media not found' }));
  });

  it('returns needsTranscode:false when file does not exist on disk', async () => {
    mockExistsSync.mockReturnValue(false);
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'unknown', needsTranscode: false, hlsUrl: null })
    );
    // probeCodec should NOT be called for missing files — no point spawning ffprobe
    expect(mockProbeCodec).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 when probeCodec throws', async () => {
    mockProbeCodec.mockRejectedValue(new Error('ffprobe crashed'));
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-1'), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Probe failed' })
    );
  });

  it('handles legacy filepath field (lowercase p)', async () => {
    mockReadLibrary.mockReturnValue([
      { id: 'movie-2', filepath: '/media/legacy.mkv' }, // legacy lowercase
    ]);
    mockProbeCodec.mockResolvedValue({ codec: 'h264', needsTranscode: false });
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-2'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ needsTranscode: false })
    );
  });

  it('handles item with no filePath at all', async () => {
    mockReadLibrary.mockReturnValue([
      { id: 'movie-3' }, // no filePath or filepath
    ]);
    const { default: handler } = await import('../../server/api/hls/[id]/probe/GET.js');
    const res = makeRes();
    await handler(makeReq('movie-3'), res);
    // Should return safe defaults, not crash
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'unknown', needsTranscode: false, hlsUrl: null })
    );
    expect(mockProbeCodec).not.toHaveBeenCalled();
  });
});
