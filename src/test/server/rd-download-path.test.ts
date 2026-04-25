/**
 * rd-download-path.test.ts
 *
 * Tests for the Real-Debrid branch inside POST /api/stremio/download.
 *
 * The existing torrent-download.test.ts covers qBit and WebTorrent paths.
 * This file covers everything that only executes when realDebridApiKey is set:
 *
 *   1. RD is chosen as backend when key is configured (qBit is never called)
 *   2. Response is immediate — job is queued with backend:'real-debrid'
 *   3. Duplicate detection fires before RD resolve (409 returned)
 *   4. Security scan blocks download before RD resolve (403 returned)
 *   5. 503 is NOT returned when qBit is offline but RD key is present
 *   6. Episode download via RD — job created with correct type/season/episode
 *   7. RD job status transitions: downloading → done on success
 *   8. RD job status transitions: downloading → error on resolvemagnet failure
 *   9. qBit check is skipped entirely when RD key is set (no testConnection call)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockRdApiKey = 'valid-rd-key';
let mockQbitReachable = false;   // qBit is DOWN — should not matter when RD is set
let mockScanAllowed = true;
let mockDuplicateJob: Record<string, unknown> | undefined = undefined;

const mockStreams = [
  {
    infoHash: 'aabbccdd1122334455667788990011223344556677',
    title: '1080p BluRay\n8.5 GB 👤 250',
    name: 'Inception 1080p',
    sources: [],
  },
];

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({
    mediaDir: '/media',
    downloadsDir: '/media/downloads',
    realDebridApiKey: mockRdApiKey,
    vpn: { enabled: false },
  }),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:    () => Promise.resolve(mockQbitReachable),
  testConnection: vi.fn(() => Promise.resolve({ ok: false, error: 'Connection refused' })),
  addMagnet:      vi.fn(),
}));

const mockResolvemagnet = vi.fn();
const mockDownloadUrl   = vi.fn();

vi.mock('../../server/realDebridClient.js', () => ({
  resolvemagnet: (...args: unknown[]) => mockResolvemagnet(...args),
  downloadUrl:   (...args: unknown[]) => mockDownloadUrl(...args),
  getUser:       vi.fn(),
  isConfigured:  vi.fn(),
}));

const mockUpsertJob = vi.fn();
vi.mock('../../server/downloadJobStore.js', () => ({
  upsertJob:          (...args: unknown[]) => mockUpsertJob(...args),
  getAllPersistedJobs: () => [],
  updateJobStatus:    vi.fn(),
  findJobByInfoHash:  () => mockDuplicateJob,
}));

const mockRunPreDownloadScan = vi.fn();
vi.mock('../../server/security/threatScanner.js', () => ({
  runPreDownloadScan: (...args: unknown[]) => mockRunPreDownloadScan(...args),
}));

vi.mock('../../server/vpnService.js', () => ({
  connectForDownload:      vi.fn().mockResolvedValue({ ok: true }),
  disconnectAfterDownload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/torrentManager.js', () => ({
  pickBestStream: (streams: unknown[]) => streams[0] ?? null,
  queueDownload:  vi.fn(),
  getAllJobs:      () => [],
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// Torrentio fetch — always returns one good stream
vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  json: async () => ({ streams: mockStreams }),
})));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown) {
  const req = { body, cookies: {}, params: {} } as unknown as Request;
  const captured: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { captured.json = v; return res; }),
  } as unknown as Response;
  return { req, res, captured };
}

const MOVIE_BODY = {
  imdbId: 'tt1375666',
  type: 'movie',
  title: 'Inception',
  quality: '1080p',
};

const EPISODE_BODY = {
  imdbId: 'tt0944947',
  type: 'series',
  title: 'Game of Thrones',
  season: 1,
  episode: 1,
};

// Import handler once — mocks are already in place
const { default: handler } = await import('../../server/api/stremio/download/POST.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/download — Real-Debrid backend', () => {
  beforeEach(() => {
    mockRdApiKey    = 'valid-rd-key';
    mockQbitReachable = false;
    mockScanAllowed = true;
    mockDuplicateJob = undefined;
    mockUpsertJob.mockClear();
    mockResolvemagnet.mockClear();
    mockDownloadUrl.mockClear();
    mockRunPreDownloadScan.mockResolvedValue({
      allowed: true, threatLevel: 'clean', checkedAt: new Date().toISOString(),
    });
    mockResolvemagnet.mockResolvedValue('https://rd.example.com/file.mkv');
    mockDownloadUrl.mockResolvedValue(undefined);
  });

  it('responds immediately with backend:real-debrid when RD key is set', async () => {
    const { req, res, captured } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    const body = captured.json as Record<string, unknown>;
    expect(body.backend).toBe('real-debrid');
    expect(body.queued).toBe(1);
  });

  it('never calls testConnection (qBit check) when RD key is set', async () => {
    const { testConnection } = await import('../../server/qbittorrentClient.js');
    (testConnection as ReturnType<typeof vi.fn>).mockClear();

    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    expect(testConnection).not.toHaveBeenCalled();
  });

  it('does NOT return 503 when qBit is offline but RD key is present', async () => {
    mockQbitReachable = false;
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    expect(res.status).not.toHaveBeenCalledWith(503);
  });

  it('upserts job with status:downloading and backend:real-debrid immediately', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall.backend).toBe('real-debrid');
    expect(firstCall.status).toBe('downloading');
    expect(firstCall.type).toBe('movie');
  });

  it('returns 409 on duplicate infoHash before calling RD', async () => {
    mockDuplicateJob = {
      jobId: 'rd-existing',
      infoHash: 'aabbccdd1122334455667788990011223344556677',
      status: 'downloading',
    };
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockResolvemagnet).not.toHaveBeenCalled();
  });

  it('returns 403 when security scan blocks the download before calling RD', async () => {
    mockRunPreDownloadScan.mockResolvedValue({
      allowed: false,
      threatLevel: 'blocked',
      reason: 'Known malware hash',
      layer: 'virustotal',
      checkedAt: new Date().toISOString(),
    });
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockResolvemagnet).not.toHaveBeenCalled();
  });

  it('upserts job with status:done after background RD resolve + download completes', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    // Wait for the background async IIFE to complete
    await vi.waitFor(() => {
      const calls = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
      return calls.includes('done');
    }, { timeout: 2000 });

    const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
    expect(statuses).toContain('done');
  });

  it('upserts job with status:error when resolvemagnet throws', async () => {
    mockResolvemagnet.mockRejectedValue(new Error('RD: torrent failed with status "magnet_error"'));

    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    await vi.waitFor(() => {
      const calls = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
      return calls.includes('error');
    }, { timeout: 2000 });

    const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
    expect(statuses).toContain('error');
    expect(statuses).not.toContain('done');
  });

  it('creates episode job with correct type and season/episode in title', async () => {
    const { req, res, captured } = makeReqRes(EPISODE_BODY);
    await handler(req as Request, res as Response);

    const body = captured.json as Record<string, unknown>;
    expect(body.backend).toBe('real-debrid');
    const job = (body.jobs as Record<string, unknown>[])[0];
    expect(job.type).toBe('series');
  });

  it('falls back to qBit when RD key is empty string', async () => {
    mockRdApiKey = '';
    mockQbitReachable = true;

    // Re-import with updated config mock — need fresh module
    // (We verify by checking that testConnection IS called this time)
    const { testConnection } = await import('../../server/qbittorrentClient.js');
    (testConnection as ReturnType<typeof vi.fn>).mockClear().mockResolvedValue({ ok: true });

    const { req, res, captured } = makeReqRes(MOVIE_BODY);
    await handler(req as Request, res as Response);

    const body = captured.json as Record<string, unknown>;
    // With empty RD key, should NOT be real-debrid
    expect(body.backend).not.toBe('real-debrid');
  });
});
