/**
 * torrent-delete.test.ts
 *
 * Tests for DELETE /api/stremio/downloads/:hash
 *
 * Covers:
 *   - 400 when hash is missing
 *   - Real-Debrid job: deleted from store, qBit never called
 *   - Real-Debrid job: "rd-" prefix pattern (safety net)
 *   - 503 when qBittorrent is not reachable (non-RD hash)
 *   - Successful qBit delete without file deletion
 *   - Successful qBit delete with file deletion (?deleteFiles=true)
 *   - Hash is passed as-is to qBit (client lowercases internally)
 *   - 500 on qBit API error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockQbitReachable = true;

const mockDeleteTorrent = vi.fn().mockResolvedValue(undefined);
const mockDeleteJob     = vi.fn();
let   mockPersistedJob: { backend: string } | undefined = undefined;

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:     () => Promise.resolve(mockQbitReachable),
  deleteTorrent:   (...args: unknown[]) => mockDeleteTorrent(...args),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/downloadJobStore.js', () => ({
  getPersistedJob: (_id: string) => mockPersistedJob,
  deleteJob:       (...args: unknown[]) => mockDeleteJob(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(
  params: Record<string, string>,
  query: Record<string, string> = {},
) {
  const req = { params, query, cookies: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

const { default: handler } = await import('../../server/api/stremio/downloads/[hash]/DELETE.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/stremio/downloads/:hash — validation', () => {
  it('returns 400 when hash param is empty string', async () => {
    const { req, res } = makeReqRes({ hash: '' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /api/stremio/downloads/:hash — Real-Debrid jobs', () => {
  beforeEach(() => {
    mockDeleteJob.mockClear();
    mockDeleteTorrent.mockClear();
    mockQbitReachable = true;
  });

  it('deletes RD job from store when persisted job is real-debrid backend', async () => {
    mockPersistedJob = { backend: 'real-debrid' };
    const { req, res, data } = makeReqRes({ hash: 'rd-abc123-1700000000000' });
    await handler(req, res);
    expect(mockDeleteJob).toHaveBeenCalledWith('rd-abc123-1700000000000');
    expect((data.json as { ok: boolean }).ok).toBe(true);
    expect((data.json as { backend: string }).backend).toBe('real-debrid');
  });

  it('does NOT call qBit deleteTorrent for RD jobs', async () => {
    mockPersistedJob = { backend: 'real-debrid' };
    const { req, res } = makeReqRes({ hash: 'rd-abc123-1700000000000' });
    await handler(req, res);
    expect(mockDeleteTorrent).not.toHaveBeenCalled();
  });

  it('handles "rd-" prefix pattern even when job not in store', async () => {
    mockPersistedJob = undefined; // not in store
    const { req, res, data } = makeReqRes({ hash: 'rd-deadbeef-9999999999' });
    await handler(req, res);
    // deleteJob called as a no-op safety net
    expect(mockDeleteJob).toHaveBeenCalledWith('rd-deadbeef-9999999999');
    expect((data.json as { ok: boolean }).ok).toBe(true);
    expect((data.json as { backend: string }).backend).toBe('real-debrid');
  });

  it('does NOT call qBit for "rd-" prefix hash even when qBit is offline', async () => {
    mockPersistedJob = undefined;
    mockQbitReachable = false;
    const { req, res } = makeReqRes({ hash: 'rd-deadbeef-9999999999' });
    await handler(req, res);
    expect(mockDeleteTorrent).not.toHaveBeenCalled();
    // Should succeed (not 503)
    expect(res.status).not.toHaveBeenCalledWith(503);
  });
});

describe('DELETE /api/stremio/downloads/:hash — qBit offline', () => {
  beforeEach(() => {
    mockQbitReachable = false;
    mockPersistedJob = undefined;
    mockDeleteTorrent.mockClear();
  });

  it('returns 503 when qBittorrent is not reachable', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('does NOT call deleteTorrent when qBit is offline', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123' });
    await handler(req, res);
    expect(mockDeleteTorrent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/stremio/downloads/:hash — successful qBit delete', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockPersistedJob = undefined;
    mockDeleteTorrent.mockClear();
  });

  it('returns ok:true on successful delete', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('echoes the hash in the response', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect((data.json as { hash: string }).hash).toBe('abc123def456');
  });

  it('calls deleteTorrent with deleteFiles:false by default', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123def456', false);
  });

  it('calls deleteTorrent with deleteFiles:true when ?deleteFiles=true', async () => {
    const { req, res } = makeReqRes({ hash: 'abc123def456' }, { deleteFiles: 'true' });
    await handler(req, res);
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123def456', true);
  });

  it('reports deleteFiles:false in response when not requested', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect((data.json as { deleteFiles: boolean }).deleteFiles).toBe(false);
  });

  it('reports deleteFiles:true in response when requested', async () => {
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' }, { deleteFiles: 'true' });
    await handler(req, res);
    expect((data.json as { deleteFiles: boolean }).deleteFiles).toBe(true);
  });

  it('passes hash as-is to deleteTorrent (qBit client lowercases internally)', async () => {
    const MIXED_CASE = 'AABBCCDD1122334455667788990011223344556677';
    const { req, res } = makeReqRes({ hash: MIXED_CASE });
    await handler(req, res);
    expect(mockDeleteTorrent).toHaveBeenCalledWith(MIXED_CASE, false);
  });
});

describe('DELETE /api/stremio/downloads/:hash — error handling', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockPersistedJob = undefined;
    mockDeleteTorrent.mockClear();
  });

  it('returns 500 when deleteTorrent throws', async () => {
    mockDeleteTorrent.mockRejectedValueOnce(new Error('qBit API timeout'));
    const { req, res } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes error message in 500 response', async () => {
    mockDeleteTorrent.mockRejectedValueOnce(new Error('qBit API timeout'));
    const { req, res, data } = makeReqRes({ hash: 'abc123def456' });
    await handler(req, res);
    expect((data.json as { message: string }).message).toContain('qBit API timeout');
  });
});
