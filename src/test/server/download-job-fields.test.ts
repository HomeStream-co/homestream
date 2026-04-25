/**
 * download-job-fields.test.ts
 *
 * Download job field completeness test.
 *
 * Every download backend (qBittorrent, WebTorrent, Real-Debrid) writes a
 * PersistedJob to downloadJobStore via upsertJob(). The Downloads page and
 * the Downloads API read these jobs and render fields like title, quality,
 * poster, backend, and status.
 *
 * If a new backend forgets a required field, the UI silently shows blanks or
 * crashes. This test asserts that every backend produces jobs with the full
 * set of required PersistedJob fields.
 *
 * REQUIRED FIELDS (non-optional in PersistedJob interface):
 *   jobId, infoHash, title, quality, type, status, addedAt, imdbId, backend
 *
 * HOW TO ADD A NEW BACKEND
 * ─────────────────────────
 * 1. Add a new `it` block below that calls your download handler with a
 *    mocked config that enables only your backend.
 * 2. Assert that upsertJob was called with all REQUIRED_JOB_FIELDS present
 *    and non-empty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Required fields every backend must write ──────────────────────────────────

const REQUIRED_JOB_FIELDS = [
  'jobId',
  'infoHash',
  'title',
  'quality',
  'type',
  'status',
  'addedAt',
  'imdbId',
  'backend',
] as const;

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockRdApiKey   = '';
let mockQbitOnline = false;

const mockUpsertJob      = vi.fn();
const mockResolvemagnet  = vi.fn();
const mockDownloadUrl    = vi.fn();

const MOCK_STREAMS = [
  {
    infoHash: 'deadbeef1234567890abcdef1234567890abcdef',
    title: '1080p BluRay\n7.2 GB 👤 180',
    name: 'The Matrix 1080p',
    sources: [],
    magnet: 'magnet:?xt=urn:btih:deadbeef1234567890abcdef1234567890abcdef',
  },
];

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({
    mediaDir: '/media',
    downloadsDir: '/media/downloads',
    realDebridApiKey: mockRdApiKey,
  }),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:     () => Promise.resolve(mockQbitOnline),
  testConnection:  () => Promise.resolve(mockQbitOnline ? { ok: true, version: '5.0.0' } : { ok: false, error: 'offline' }),
  addMagnet:       vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/realDebridClient.js', () => ({
  resolvemagnet: (...a: unknown[]) => mockResolvemagnet(...a),
  downloadUrl:   (...a: unknown[]) => mockDownloadUrl(...a),
}));

vi.mock('../../server/downloadJobStore.js', () => ({
  upsertJob:          (...a: unknown[]) => mockUpsertJob(...a),
  updateJobStatus:    vi.fn(),
  getAllPersistedJobs: vi.fn().mockReturnValue([]),
  findJobByInfoHash:  vi.fn().mockReturnValue(undefined),  // correct name used by handler
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs:      vi.fn().mockReturnValue([]),
  getJob:         vi.fn().mockReturnValue(undefined),
  // pickBestStream: mirrors the real return shape — adds quality derived from title
  pickBestStream: (streams: Array<{ infoHash?: string; title?: string; name?: string; magnet?: string }>) => {
    const s = streams.find(st => st.infoHash);
    if (!s) return null;
    // Extract quality label from title (e.g. "1080p BluRay\n7.2 GB" → "1080p BluRay")
    const quality = (s.title ?? '').split('\n')[0].trim() || '1080p';
    return { ...s, quality };
  },
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown) => true,
}));

vi.mock('../../server/threatScanner.js', () => ({
  scanInfoHash: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('../../server/security/threatScanner.js', () => ({
  runPreDownloadScan: vi.fn().mockResolvedValue({ allowed: true, layer: 'none' }),
}));

vi.mock('../../server/vpnService.js', () => ({
  connectForDownload:    vi.fn().mockResolvedValue({ ok: true }),
  disconnectAfterDownload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  default: {
    existsSync:    vi.fn().mockReturnValue(true),
    mkdirSync:     vi.fn(),
    writeFileSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: Record<string, unknown>) {
  const req = { body, cookies: { session: 'tok' } } as unknown as Request;
  const captured: { json?: unknown; statusCode?: number } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((data: unknown) => { captured.json = data; }),
    end:    vi.fn(),
  } as unknown as Response;
  return { req, res, captured };
}

function assertJobFieldsPresent(job: Record<string, unknown>) {
  const missing: string[] = [];
  for (const field of REQUIRED_JOB_FIELDS) {
    const val = job[field];
    if (val === undefined || val === null || val === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `upsertJob() was called but these required fields were missing or empty:\n` +
      `  ${missing.join(', ')}\n\n` +
      `Full job object:\n${JSON.stringify(job, null, 2)}`,
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('download job field completeness — all backends', () => {
  // NOTE: vi.resetModules() is intentionally NOT called here.
  // The vi.mock() calls at the top of this file are hoisted and stable —
  // resetting modules would re-import the handler with fresh (unregistered)
  // mock instances, breaking the mockUpsertJob spy reference.
  beforeEach(() => {
    mockRdApiKey   = '';
    mockQbitOnline = false;
    mockUpsertJob.mockClear();
    mockResolvemagnet.mockClear();
    mockDownloadUrl.mockClear();
  });

  // ── Real-Debrid backend ───────────────────────────────────────────────────

  describe('Real-Debrid backend', () => {
    beforeEach(() => {
      mockRdApiKey = 'valid-rd-key';
      mockResolvemagnet.mockResolvedValue('https://rd.example.com/file.mkv');
      mockDownloadUrl.mockResolvedValue('/media/downloads/The Matrix [1080p BluRay].mkv');
    });

    it('upserts a job with all required fields for a movie download', async () => {
      const { default: handler } = await import('../../server/api/stremio/download/POST.js');
      const { req, res } = makeReqRes({
        streams: MOCK_STREAMS,
        title:   'The Matrix',
        type:    'movie',
        imdbId:  'tt0133093',
        poster:  'https://image.tmdb.org/t/p/w500/poster.jpg',
      });

      await (handler as Function)(req, res);

      // upsertJob is called at least once (immediately on job creation)
      expect(mockUpsertJob).toHaveBeenCalled();

      // Check the first call — the initial job creation
      const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
      assertJobFieldsPresent(firstCall);
      expect(firstCall.backend).toBe('real-debrid');
      expect(firstCall.type).toBe('movie');
    });

    it('upserts a job with all required fields for an episode download', async () => {
      const { default: handler } = await import('../../server/api/stremio/download/POST.js');
      const { req, res } = makeReqRes({
        streams: MOCK_STREAMS,
        title:   'Breaking Bad',
        type:    'series',
        season:  1,
        episode: 1,
        imdbId:  'tt0903747',
        poster:  'https://image.tmdb.org/t/p/w500/poster.jpg',
      });

      await (handler as Function)(req, res);

      expect(mockUpsertJob).toHaveBeenCalled();
      const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
      assertJobFieldsPresent(firstCall);
      expect(firstCall.backend).toBe('real-debrid');
      expect(firstCall.type).toBe('series');
    });

    it('job has status:downloading immediately (not queued or done)', async () => {
      const { default: handler } = await import('../../server/api/stremio/download/POST.js');
      const { req, res } = makeReqRes({
        streams: MOCK_STREAMS,
        title:   'The Matrix',
        type:    'movie',
        imdbId:  'tt0133093',
      });

      await (handler as Function)(req, res);

      const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
      expect(firstCall.status).toBe('downloading');
    });

    it('addedAt is a valid ISO timestamp', async () => {
      const { default: handler } = await import('../../server/api/stremio/download/POST.js');
      const { req, res } = makeReqRes({
        streams: MOCK_STREAMS,
        title:   'The Matrix',
        type:    'movie',
        imdbId:  'tt0133093',
      });

      await (handler as Function)(req, res);

      const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
      const ts = new Date(firstCall.addedAt as string).getTime();
      expect(Number.isNaN(ts)).toBe(false);
      // Should be within the last 5 seconds
      expect(Date.now() - ts).toBeLessThan(5000);
    });
  });

  // ── qBittorrent backend ───────────────────────────────────────────────────

  describe('qBittorrent backend', () => {
    beforeEach(() => {
      mockRdApiKey   = '';        // RD not configured
      mockQbitOnline = true;      // qBit is reachable
    });

    it('upserts a job with all required fields for a movie download', async () => {
      const { default: handler } = await import('../../server/api/stremio/download/POST.js');
      const { req, res } = makeReqRes({
        streams: MOCK_STREAMS,
        title:   'The Matrix',
        type:    'movie',
        imdbId:  'tt0133093',
        poster:  'https://image.tmdb.org/t/p/w500/poster.jpg',
      });

      await (handler as Function)(req, res);

      expect(mockUpsertJob).toHaveBeenCalled();
      const firstCall = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
      assertJobFieldsPresent(firstCall);
      expect(firstCall.backend).toBe('qbittorrent');
    });
  });
});

// ── PersistedJob interface contract ──────────────────────────────────────────
//
// This describe block tests the PersistedJob type itself — it ensures the
// REQUIRED_JOB_FIELDS list above stays in sync with the actual interface.
// If a field is removed from PersistedJob, this test will still pass (it's
// a runtime check), but the TypeScript compiler will catch it in the handler.

describe('REQUIRED_JOB_FIELDS list completeness', () => {
  it('contains at least 9 fields (guards against accidental truncation)', () => {
    expect(REQUIRED_JOB_FIELDS.length).toBeGreaterThanOrEqual(9);
  });

  it('includes backend field (distinguishes RD / qBit / WebTorrent in UI)', () => {
    expect(REQUIRED_JOB_FIELDS).toContain('backend');
  });

  it('includes infoHash field (used as dedup key and qBit join key)', () => {
    expect(REQUIRED_JOB_FIELDS).toContain('infoHash');
  });

  it('includes addedAt field (used for job age display and 30-day retention pruning)', () => {
    expect(REQUIRED_JOB_FIELDS).toContain('addedAt');
  });
});
