/**
 * downloads-controls.test.ts
 *
 * Tests for the three download control endpoints:
 *
 *   POST /api/stremio/downloads/pause
 *   POST /api/stremio/downloads/resume
 *   POST /api/stremio/downloads/priority
 *
 * These are the action endpoints the Downloads tab calls when the user
 * clicks Pause, Resume, or the Up/Down priority arrows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/stremio/downloads/pause
 *   - 400 when hash is missing
 *   - 503 when qBittorrent is not reachable
 *   - Does NOT call pauseTorrent when qBit is offline
 *   - Returns ok:true on success
 *   - Calls pauseTorrent with the provided hash
 *   - Returns 500 when pauseTorrent throws
 *   - Includes error message in 500 response
 *
 * POST /api/stremio/downloads/resume
 *   - 400 when hash is missing
 *   - 503 when qBittorrent is not reachable
 *   - Does NOT call resumeTorrent when qBit is offline
 *   - Returns ok:true on success
 *   - Calls resumeTorrent with the provided hash
 *   - Returns 500 when resumeTorrent throws
 *   - Includes error message in 500 response
 *
 * POST /api/stremio/downloads/priority
 *   - 400 when hash is missing
 *   - 400 when direction is missing
 *   - 400 when direction is invalid (not 'up' or 'down')
 *   - Calls increasePrio endpoint when direction is 'up'
 *   - Calls decreasePrio endpoint when direction is 'down'
 *   - Returns ok:true with hash and direction on success
 *   - Returns 500 when qbitRequest throws
 *   - Includes error message in 500 response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state
// ─────────────────────────────────────────────────────────────────────────────

let mockQbitReachable = true;

const mockPauseTorrent  = vi.fn().mockResolvedValue(undefined);
const mockResumeTorrent = vi.fn().mockResolvedValue(undefined);
const mockQbitRequest   = vi.fn().mockResolvedValue('Ok.');

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:     () => Promise.resolve(mockQbitReachable),
  pauseTorrent:    (...args: unknown[]) => mockPauseTorrent(...args),
  resumeTorrent:   (...args: unknown[]) => mockResumeTorrent(...args),
  qbitRequest:     (...args: unknown[]) => mockQbitRequest(...args),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks
// ─────────────────────────────────────────────────────────────────────────────

const { default: pauseHandler }    = await import('../../server/api/stremio/downloads/pause/POST.js');
const { default: resumeHandler }   = await import('../../server/api/stremio/downloads/resume/POST.js');
const { default: priorityHandler } = await import('../../server/api/stremio/downloads/priority/POST.js');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown = {}) {
  const req = {
    body,
    params:  {},
    query:   {},
    cookies: {},
    headers: {},
    socket:  { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  const data: { json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;

  return { req, res, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stremio/downloads/pause
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/downloads/pause — validation', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockPauseTorrent.mockClear();
  });

  it('returns 400 when hash is missing from body', async () => {
    const { req, res } = makeReqRes({});
    await pauseHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when hash is empty string', async () => {
    const { req, res } = makeReqRes({ hash: '' });
    await pauseHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/stremio/downloads/pause — qBit offline', () => {
  beforeEach(() => {
    mockQbitReachable = false;
    mockPauseTorrent.mockClear();
  });

  it('returns 503 when qBittorrent is not reachable', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await pauseHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('does NOT call pauseTorrent when qBit is offline', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await pauseHandler(req, res);
    expect(mockPauseTorrent).not.toHaveBeenCalled();
  });
});

describe('POST /api/stremio/downloads/pause — success', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockPauseTorrent.mockClear().mockResolvedValue(undefined);
  });

  it('returns ok:true on successful pause', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await pauseHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls pauseTorrent with the provided hash', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await pauseHandler(req, res);
    expect(mockPauseTorrent).toHaveBeenCalledWith('abc123def456');
  });

  it('calls pauseTorrent exactly once', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await pauseHandler(req, res);
    expect(mockPauseTorrent).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/stremio/downloads/pause — error handling', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockPauseTorrent.mockClear();
  });

  it('returns 500 when pauseTorrent throws', async () => {
    mockPauseTorrent.mockRejectedValueOnce(new Error('qBit connection reset'));
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await pauseHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes error message in 500 response', async () => {
    mockPauseTorrent.mockRejectedValueOnce(new Error('qBit connection reset'));
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await pauseHandler(req, res);
    expect(String((data.json as { error: string }).error)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stremio/downloads/resume
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/downloads/resume — validation', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockResumeTorrent.mockClear();
  });

  it('returns 400 when hash is missing from body', async () => {
    const { req, res } = makeReqRes({});
    await resumeHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when hash is empty string', async () => {
    const { req, res } = makeReqRes({ hash: '' });
    await resumeHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/stremio/downloads/resume — qBit offline', () => {
  beforeEach(() => {
    mockQbitReachable = false;
    mockResumeTorrent.mockClear();
  });

  it('returns 503 when qBittorrent is not reachable', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await resumeHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('does NOT call resumeTorrent when qBit is offline', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await resumeHandler(req, res);
    expect(mockResumeTorrent).not.toHaveBeenCalled();
  });
});

describe('POST /api/stremio/downloads/resume — success', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockResumeTorrent.mockClear().mockResolvedValue(undefined);
    mockPauseTorrent.mockClear(); // ensure pause spy is clean for the independence check
  });

  it('returns ok:true on successful resume', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls resumeTorrent with the provided hash', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect(mockResumeTorrent).toHaveBeenCalledWith('abc123def456');
  });

  it('calls resumeTorrent exactly once', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect(mockResumeTorrent).toHaveBeenCalledTimes(1);
  });

  it('resume is independent of pause — does not call pauseTorrent', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect(mockPauseTorrent).not.toHaveBeenCalled();
  });
});

describe('POST /api/stremio/downloads/resume — error handling', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockResumeTorrent.mockClear();
  });

  it('returns 500 when resumeTorrent throws', async () => {
    mockResumeTorrent.mockRejectedValueOnce(new Error('Torrent not found in qBit'));
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes error message in 500 response', async () => {
    mockResumeTorrent.mockRejectedValueOnce(new Error('Torrent not found in qBit'));
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await resumeHandler(req, res);
    expect(String((data.json as { error: string }).error)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stremio/downloads/priority
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/downloads/priority — validation', () => {
  beforeEach(() => {
    mockQbitRequest.mockClear().mockResolvedValue('Ok.');
  });

  it('returns 400 when hash is missing', async () => {
    const { req, res } = makeReqRes({ direction: 'up' });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when direction is missing', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when direction is invalid string', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'sideways' });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when direction is a number', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 1 });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when both hash and direction are missing', async () => {
    const { req, res } = makeReqRes({});
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/stremio/downloads/priority — direction:up', () => {
  beforeEach(() => {
    mockQbitRequest.mockClear().mockResolvedValue('Ok.');
  });

  it('calls qbitRequest with increasePrio endpoint for direction:up', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect(mockQbitRequest).toHaveBeenCalledWith(
      '/api/v2/torrents/increasePrio',
      'POST',
      expect.any(URLSearchParams),
    );
  });

  it('passes the hash in the URLSearchParams body for direction:up', async () => {
    const { req, res } = makeReqRes({ hash: 'myhash123', direction: 'up' });
    await priorityHandler(req, res);
    const params = mockQbitRequest.mock.calls[0][2] as URLSearchParams;
    expect(params.get('hashes')).toBe('myhash123');
  });

  it('returns ok:true for direction:up', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('echoes hash in response for direction:up', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect((data.json as { hash: string }).hash).toBe('abc123');
  });

  it('echoes direction:up in response', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect((data.json as { direction: string }).direction).toBe('up');
  });
});

describe('POST /api/stremio/downloads/priority — direction:down', () => {
  beforeEach(() => {
    mockQbitRequest.mockClear().mockResolvedValue('Ok.');
  });

  it('calls qbitRequest with decreasePrio endpoint for direction:down', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    expect(mockQbitRequest).toHaveBeenCalledWith(
      '/api/v2/torrents/decreasePrio',
      'POST',
      expect.any(URLSearchParams),
    );
  });

  it('passes the hash in the URLSearchParams body for direction:down', async () => {
    const { req, res } = makeReqRes({ hash: 'myhash456', direction: 'down' });
    await priorityHandler(req, res);
    const params = mockQbitRequest.mock.calls[0][2] as URLSearchParams;
    expect(params.get('hashes')).toBe('myhash456');
  });

  it('returns ok:true for direction:down', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('echoes direction:down in response', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    expect((data.json as { direction: string }).direction).toBe('down');
  });

  it('does NOT call increasePrio when direction is down', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    const endpoint = mockQbitRequest.mock.calls[0][0] as string;
    expect(endpoint).not.toContain('increase');
  });

  it('does NOT call decreasePrio when direction is up', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    const endpoint = mockQbitRequest.mock.calls[0][0] as string;
    expect(endpoint).not.toContain('decrease');
  });
});

describe('POST /api/stremio/downloads/priority — error handling', () => {
  beforeEach(() => {
    mockQbitRequest.mockClear();
  });

  it('returns 500 when qbitRequest throws for direction:up', async () => {
    mockQbitRequest.mockRejectedValueOnce(new Error('qBit queue management failed'));
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 500 when qbitRequest throws for direction:down', async () => {
    mockQbitRequest.mockRejectedValueOnce(new Error('qBit queue management failed'));
    const { req, res } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes error message in 500 response', async () => {
    mockQbitRequest.mockRejectedValueOnce(new Error('qBit queue management failed'));
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'up' });
    await priorityHandler(req, res);
    expect((data.json as { message: string }).message).toContain('qBit queue management failed');
  });

  it('includes "Priority change failed" in error field', async () => {
    mockQbitRequest.mockRejectedValueOnce(new Error('timeout'));
    const { req, res, data } = makeReqRes({ hash: 'abc123', direction: 'down' });
    await priorityHandler(req, res);
    expect((data.json as { error: string }).error).toContain('Priority change failed');
  });
});
