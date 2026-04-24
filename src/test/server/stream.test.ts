/**
 * stream.test.ts
 *
 * Tests for GET /api/stream/:filename
 *
 * Covers:
 *   - 404 when file cannot be resolved
 *   - 304 Not Modified when ETag matches
 *   - 206 Partial Content for Range requests (correct headers)
 *   - 206 for no-Range request on large file (auto-chunked)
 *   - 200 for no-Range request on small file (fits in one chunk)
 *   - Correct MIME type per extension
 *   - Library-first path resolution (filePath over uploads/)
 *   - Path traversal blocked (basename stripping)
 *   - 500 on unexpected error
 *
 * All fs I/O is mocked — no real files needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

// Simulated files on disk: absolute path → { size, mtimeMs }
const mockFiles = new Map<string, { size: number; mtimeMs: number }>();

// Library items for path resolution
let mockLibrary: Array<{ filename?: string; filePath?: string; filepath?: string }> = [];

// ── Mock fs ───────────────────────────────────────────────────────────────────
// Synchronous factory (no importActual) — avoids Vitest async hoisting issues.
// We provide only the methods the stream handler uses.

vi.mock('fs', () => {
  return {
    default: {
      existsSync: (p: string) => {
        const base = p.split('/').pop() ?? '';
        return mockFiles.has(base) || mockFiles.has(p);
      },
      statSync: (p: string) => {
        const base = p.split('/').pop() ?? '';
        const f = mockFiles.get(base) ?? mockFiles.get(p);
        if (!f) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
        return { size: f.size, mtimeMs: f.mtimeMs, mtime: new Date(f.mtimeMs) };
      },
      createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    },
    existsSync: (p: string) => {
      const base = p.split('/').pop() ?? '';
      return mockFiles.has(base) || mockFiles.has(p);
    },
    statSync: (p: string) => {
      const base = p.split('/').pop() ?? '';
      const f = mockFiles.get(base) ?? mockFiles.get(p);
      if (!f) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      return { size: f.size, mtimeMs: f.mtimeMs, mtime: new Date(f.mtimeMs) };
    },
    createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
  };
});

// ── Mock libraryStore ─────────────────────────────────────────────────────────

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockLibrary,
}));

// ── Mock authMiddleware ───────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
// Register files by basename — the mock resolves by basename so we don't
// need to know the exact UPLOADS_DIR path the handler uses at runtime.

function makeReqRes(
  filename: string,
  headers: Record<string, string> = {},
) {
  const req = {
    params: { filename },
    headers,
    cookies: {},
  } as unknown as Request;

  const data: {
    statusCode?: number;
    headers?: Record<string, unknown>;
    json?: unknown;
    ended?: boolean;
  } = {};

  const res = {
    status: vi.fn((code: number) => { data.statusCode = code; return res; }),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
    end:    vi.fn(() => { data.ended = true; return res; }),
    writeHead: vi.fn((code: number, hdrs: Record<string, unknown>) => {
      data.statusCode = code;
      data.headers = hdrs;
      return res;
    }),
    set: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res, data };
}

const { default: handler } = await import('../../server/api/stream/[filename]/GET.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/stream/:filename — 404 / not found', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
  });

  it('returns 404 when file does not exist anywhere', () => {
    const { req, res, data } = makeReqRes('missing.mp4');
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect((data.json as { error: string }).error).toMatch(/not found/i);
  });

  it('strips directory traversal from filename param', () => {
    // Even if ../../etc/passwd is passed, basename() strips it to "passwd"
    // which won't exist in uploads/ — so we get a 404, not a path escape
    const { req, res } = makeReqRes('../../etc/passwd');
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('GET /api/stream/:filename — 304 Not Modified', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
    // Register by basename
    mockFiles.set('movie.mp4', { size: 1024, mtimeMs: 1700000000000 });
  });

  it('returns 304 when If-None-Match matches the ETag', () => {
    // ETag format: "<size>-<mtimeMs.toString(36)>"
    const size = 1024;
    const mtimeMs = 1700000000000;
    const etag = `"${size}-${mtimeMs.toString(36)}"`;

    const { req, res, data } = makeReqRes('movie.mp4', { 'if-none-match': etag });
    handler(req, res);
    expect(data.statusCode).toBe(304);
    expect(res.end).toHaveBeenCalled();
  });

  it('does NOT return 304 when ETag does not match', () => {
    const { req, res, data } = makeReqRes('movie.mp4', { 'if-none-match': '"wrong-etag"' });
    handler(req, res);
    // Should proceed to serve the file (200 for small file)
    expect(data.statusCode).not.toBe(304);
  });
});

describe('GET /api/stream/:filename — Range requests (206)', () => {
  const FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
    mockFiles.set('big.mp4', { size: FILE_SIZE, mtimeMs: 1700000000000 });
  });

  it('returns 206 with correct Content-Range header for a range request', () => {
    const { req, res, data } = makeReqRes('big.mp4', { range: 'bytes=0-1048575' });
    handler(req, res);
    expect(data.statusCode).toBe(206);
    expect(data.headers?.['Content-Range']).toMatch(/^bytes 0-1048575\//);
  });

  it('returns 206 with correct Content-Length for a range request', () => {
    const { req, res, data } = makeReqRes('big.mp4', { range: 'bytes=0-1048575' });
    handler(req, res);
    expect(Number(data.headers?.['Content-Length'])).toBe(1048576);
  });

  it('includes Accept-Ranges: bytes header', () => {
    const { req, res, data } = makeReqRes('big.mp4', { range: 'bytes=0-1048575' });
    handler(req, res);
    expect(data.headers?.['Accept-Ranges']).toBe('bytes');
  });

  it('includes ETag in range response', () => {
    const { req, res, data } = makeReqRes('big.mp4', { range: 'bytes=0-1048575' });
    handler(req, res);
    expect(data.headers?.['ETag']).toBeDefined();
  });

  it('includes Vary: Range header', () => {
    const { req, res, data } = makeReqRes('big.mp4', { range: 'bytes=0-1048575' });
    handler(req, res);
    expect(data.headers?.['Vary']).toBe('Range');
  });

  it('handles open-ended range (bytes=X-) by capping at CHUNK_SIZE', () => {
    const CHUNK_SIZE = 4 * 1024 * 1024;
    const start = 0;
    const { req, res, data } = makeReqRes('big.mp4', { range: `bytes=${start}-` });
    handler(req, res);
    expect(data.statusCode).toBe(206);
    const expectedEnd = Math.min(start + CHUNK_SIZE - 1, FILE_SIZE - 1);
    expect(data.headers?.['Content-Range']).toBe(`bytes ${start}-${expectedEnd}/${FILE_SIZE}`);
  });

  it('auto-chunks large file with no Range header (returns 206)', () => {
    const { req, res, data } = makeReqRes('big.mp4');
    handler(req, res);
    expect(data.statusCode).toBe(206);
  });
});

describe('GET /api/stream/:filename — small file (200)', () => {
  const FILE_SIZE = 512 * 1024; // 512 KB — fits in one chunk

  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
    mockFiles.set('small.mp4', { size: FILE_SIZE, mtimeMs: 1700000000000 });
  });

  it('returns 200 for a small file with no Range header', () => {
    const { req, res, data } = makeReqRes('small.mp4');
    handler(req, res);
    expect(data.statusCode).toBe(200);
  });

  it('includes ETag on 200 response (v1.2.4 fix)', () => {
    const { req, res, data } = makeReqRes('small.mp4');
    handler(req, res);
    expect(data.headers?.['ETag']).toBeDefined();
  });

  it('includes Vary: Range on 200 response (v1.2.4 fix)', () => {
    const { req, res, data } = makeReqRes('small.mp4');
    handler(req, res);
    expect(data.headers?.['Vary']).toBe('Range');
  });
});

describe('GET /api/stream/:filename — MIME types', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
  });

  const cases: Array<[string, string]> = [
    ['video.mp4',  'video/mp4'],
    ['video.mkv',  'video/x-matroska'],
    ['video.avi',  'video/x-msvideo'],
    ['video.webm', 'video/webm'],
    ['video.mov',  'video/quicktime'],
  ];

  for (const [filename, expectedMime] of cases) {
    it(`serves ${filename} with Content-Type: ${expectedMime}`, () => {
      mockFiles.set(filename, { size: 512 * 1024, mtimeMs: 1700000000000 });
      const { req, res, data } = makeReqRes(filename);
      handler(req, res);
      expect(data.headers?.['Content-Type']).toBe(expectedMime);
    });
  }
});

describe('GET /api/stream/:filename — library-first path resolution', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLibrary = [];
  });

  it('uses filePath from library when item is found by filename', () => {
    const customPath = '/media/downloads/inception.mp4';
    mockLibrary = [{ filename: 'inception.mp4', filePath: customPath }];
    // Register by the full path AND basename so existsSync finds it
    mockFiles.set(customPath, { size: 512 * 1024, mtimeMs: 1700000000000 });
    mockFiles.set('inception.mp4', { size: 512 * 1024, mtimeMs: 1700000000000 });

    const { req, res, data } = makeReqRes('inception.mp4');
    handler(req, res);
    // Should serve successfully (not 404)
    expect(data.statusCode).not.toBe(404);
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it('falls back to uploads/ when item is not in library', () => {
    mockFiles.set('fallback.mp4', { size: 512 * 1024, mtimeMs: 1700000000000 });
    const { req, res, data } = makeReqRes('fallback.mp4');
    handler(req, res);
    expect(data.statusCode).not.toBe(404);
  });
});
