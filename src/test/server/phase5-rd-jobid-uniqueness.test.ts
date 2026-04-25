/**
 * phase5-rd-jobid-uniqueness.test.ts
 *
 * Phase 5 fix: RD jobIds must be unique per queue action.
 *
 * Before the fix, all three RD paths (movie, single episode, batch episode)
 * used `rd-{hash}` as the jobId. This meant that re-queuing a failed torrent
 * would silently overwrite the old job record via upsertJob (which matches on
 * jobId). The user would see the old job disappear and a new one appear, but
 * the old error record was gone — no history, no way to compare.
 *
 * Fix: jobIds are now `rd-{hash}-{timestamp}` so each queue action is unique.
 * Duplicate detection still uses findJobByInfoHash (not jobId), so the
 * 409 guard is unaffected.
 *
 * Coverage:
 *   - Movie RD jobId matches rd-{hash}-{timestamp} pattern
 *   - Single-episode RD jobId matches rd-{hash}-{timestamp} pattern
 *   - Two consecutive movie downloads produce different jobIds
 *   - jobId contains the infoHash as a substring
 *   - jobId does NOT equal rd-{hash} (old format without timestamp)
 *   - Duplicate detection (409) still fires via findJobByInfoHash, not jobId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockRdApiKey = 'valid-rd-key';
let mockDuplicateJob: Record<string, unknown> | undefined = undefined;

const MOCK_HASH = 'aabbccdd1122334455667788990011223344556677';

const mockStreams = [{
  infoHash: MOCK_HASH,
  title: '1080p BluRay\n8.5 GB 👤 250',
  name: 'Inception 1080p',
  sources: [],
}];

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
  isReachable:    vi.fn().mockResolvedValue(false),
  testConnection: vi.fn().mockResolvedValue({ ok: false }),
  addMagnet:      vi.fn(),
}));

const mockResolvemagnet = vi.fn().mockResolvedValue('https://rd.example.com/file.mkv');
const mockDownloadUrl   = vi.fn().mockResolvedValue(undefined);

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
  updateJobProgress:  vi.fn(),
  findJobByInfoHash:  () => mockDuplicateJob,
}));

vi.mock('../../server/security/threatScanner.js', () => ({
  runPreDownloadScan: vi.fn().mockResolvedValue({
    allowed: true, threatLevel: 'clean', checkedAt: new Date().toISOString(),
  }),
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

vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  json: async () => ({ streams: mockStreams }),
})));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

const { default: handler } = await import('../../server/api/stremio/download/POST.js');

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/download — Phase 5: RD jobId uniqueness', () => {
  beforeEach(() => {
    mockRdApiKey     = 'valid-rd-key';
    mockDuplicateJob = undefined;
    mockUpsertJob.mockClear();
    mockResolvemagnet.mockClear();
    mockDownloadUrl.mockClear();
  });

  // ── Pattern validation ─────────────────────────────────────────────────────

  it('movie RD jobId matches rd-{hash}-{timestamp} pattern', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    const jobId = firstCall.jobId as string;
    // Pattern: rd-{hex-hash}-{numeric-timestamp}
    // Hash length varies (real torrents use 40-char SHA1; test mock uses 42).
    // Timestamp digits vary by environment (high-precision timers may exceed 13).
    expect(jobId).toMatch(/^rd-[0-9a-f]+-\d+$/);
  });

  it('episode RD jobId matches rd-{hash}-{timestamp} pattern', async () => {
    const { req, res } = makeReqRes(EPISODE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    const jobId = firstCall.jobId as string;
    expect(jobId).toMatch(/^rd-[0-9a-f]+-\d+$/);
  });

  it('jobId contains the infoHash as a substring', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    const jobId = firstCall.jobId as string;
    expect(jobId).toContain(MOCK_HASH);
  });

  it('jobId does NOT equal the old rd-{hash} format (no timestamp)', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    const jobId = firstCall.jobId as string;
    // Old format was exactly `rd-{hash}` with nothing after the hash
    expect(jobId).not.toBe(`rd-${MOCK_HASH}`);
  });

  it('two consecutive movie downloads produce different jobIds', async () => {
    const { req: req1, res: res1 } = makeReqRes(MOVIE_BODY);
    await handler(req1, res1);
    const jobId1 = (mockUpsertJob.mock.calls[0][0] as Record<string, unknown>).jobId as string;

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 5));
    mockUpsertJob.mockClear();

    const { req: req2, res: res2 } = makeReqRes(MOVIE_BODY);
    await handler(req2, res2);
    const jobId2 = (mockUpsertJob.mock.calls[0][0] as Record<string, unknown>).jobId as string;

    expect(jobId1).not.toBe(jobId2);
  });

  it('jobId is a string (not undefined or null)', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof firstCall.jobId).toBe('string');
    expect(firstCall.jobId).toBeTruthy();
  });

  // ── Duplicate detection still works via infoHash ───────────────────────────

  it('409 still fires via findJobByInfoHash even with new jobId format', async () => {
    // Simulate an existing job with the OLD jobId format — duplicate detection
    // must still work because it uses infoHash, not jobId.
    mockDuplicateJob = {
      jobId:     `rd-${MOCK_HASH}`,   // old format
      infoHash:  MOCK_HASH,
      status:    'downloading',
    };
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    // No new job should be created
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('infoHash field on the job record still matches the torrent hash', async () => {
    const { req, res } = makeReqRes(MOVIE_BODY);
    await handler(req, res);

    const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall.infoHash).toBe(MOCK_HASH);
  });
});
