/**
 * phase5-downloads-get-rd.test.ts
 *
 * Phase 5 fix: GET /api/stremio/downloads must always include rdJobs.
 *
 * Before the fix, the REST endpoint never returned rdJobs — only the
 * WebSocket broadcaster did. This meant that every time the Downloads page
 * did a manual refresh after a mutation (delete, pause, resume), the
 * Real-Debrid section disappeared for up to 5 seconds.
 *
 * Coverage:
 *   qBit OFFLINE path
 *     - rdJobs is present and contains RD jobs
 *     - rdJobs is empty array when no RD jobs exist
 *
 *   qBit ONLINE path — happy path
 *     - rdJobs is present alongside enriched qbitTorrents
 *     - rdJobs contains only real-debrid backend jobs (not qBit/WT)
 *
 *   qBit ONLINE path — API error
 *     - rdJobs is still present even when getAllTorrents throws
 *
 *   rdJobs filtering
 *     - Only jobs with backend:'real-debrid' appear in rdJobs
 *     - qBit and WebTorrent persisted jobs are excluded from rdJobs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockQbitReachable = false;
let mockWtJobs: unknown[] = [];
let mockQbitJobMeta: unknown[] = [];
let mockQbitTorrents: unknown[] = [];
let mockTransferInfo: unknown = null;
let mockPersistedJobs: unknown[] = [];
let mockGetAllTorrentsError: Error | null = null;

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:     () => Promise.resolve(mockQbitReachable),
  getAllTorrents:   () => mockGetAllTorrentsError
    ? Promise.reject(mockGetAllTorrentsError)
    : Promise.resolve(mockQbitTorrents),
  getTransferInfo: () => Promise.resolve(mockTransferInfo),
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs: () => mockWtJobs,
}));

vi.mock('../../server/api/stremio/download/POST.js', () => ({
  getQbitJobs: () => mockQbitJobMeta,
}));

vi.mock('../../server/downloadJobStore.js', () => ({
  getAllPersistedJobs: () => mockPersistedJobs,
  upsertJob:          vi.fn(),
  updateJobStatus:    vi.fn(),
  findJobByInfoHash:  vi.fn(),
}));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

const { default: handler } = await import('../../server/api/stremio/downloads/GET.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes() {
  const req = { cookies: {}, params: {} } as unknown as Request;
  const captured: { json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { captured.json = v; return res; }),
  } as unknown as Response;
  return { req, res, captured };
}

const RD_JOB = {
  jobId: 'rd-abc123-1700000000000',
  infoHash: 'abc123',
  title: 'Inception 1080p',
  quality: '1080p',
  type: 'movie' as const,
  status: 'done' as const,
  addedAt: new Date().toISOString(),
  imdbId: 'tt1375666',
  backend: 'real-debrid' as const,
};

const QBIT_JOB = {
  jobId: 'qb-def456',
  infoHash: 'def456',
  title: 'Some Movie',
  quality: '720p',
  type: 'movie' as const,
  status: 'done' as const,
  addedAt: new Date().toISOString(),
  imdbId: 'tt9999999',
  backend: 'qbittorrent' as const,
};

const WT_JOB = {
  jobId: 'wt-ghi789',
  infoHash: 'ghi789',
  title: 'Another Movie',
  quality: '480p',
  type: 'movie' as const,
  status: 'done' as const,
  addedAt: new Date().toISOString(),
  imdbId: 'tt8888888',
  backend: 'webtorrent' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/stremio/downloads — Phase 5: rdJobs always included', () => {
  beforeEach(() => {
    mockQbitReachable       = false;
    mockWtJobs              = [];
    mockQbitJobMeta         = [];
    mockQbitTorrents        = [];
    mockTransferInfo        = null;
    mockPersistedJobs       = [];
    mockGetAllTorrentsError = null;
  });

  // ── qBit OFFLINE path ──────────────────────────────────────────────────────

  describe('qBit offline path', () => {
    it('includes rdJobs in response when qBit is offline', async () => {
      mockPersistedJobs = [RD_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body).toHaveProperty('rdJobs');
      expect(Array.isArray(body.rdJobs)).toBe(true);
    });

    it('rdJobs contains the RD job when qBit is offline', async () => {
      mockPersistedJobs = [RD_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as unknown[];
      expect(rdJobs).toHaveLength(1);
      expect((rdJobs[0] as Record<string, unknown>).jobId).toBe(RD_JOB.jobId);
    });

    it('rdJobs is empty array when no RD jobs exist and qBit is offline', async () => {
      mockPersistedJobs = [];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body.rdJobs).toEqual([]);
    });

    it('rdJobs excludes qBit and WebTorrent persisted jobs when qBit is offline', async () => {
      mockPersistedJobs = [RD_JOB, QBIT_JOB, WT_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as Record<string, unknown>[];
      expect(rdJobs).toHaveLength(1);
      expect(rdJobs[0].backend).toBe('real-debrid');
    });

    it('still returns qbitOnline:false and backend:webtorrent when qBit is offline', async () => {
      mockPersistedJobs = [RD_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body.qbitOnline).toBe(false);
      expect(body.backend).toBe('webtorrent');
    });
  });

  // ── qBit ONLINE path ───────────────────────────────────────────────────────

  describe('qBit online path', () => {
    beforeEach(() => {
      mockQbitReachable       = true;
      mockTransferInfo        = { dl_info_speed: 0, up_info_speed: 0 };
      mockGetAllTorrentsError = null;
    });

    it('includes rdJobs in response when qBit is online', async () => {
      mockPersistedJobs = [RD_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body).toHaveProperty('rdJobs');
      expect(Array.isArray(body.rdJobs)).toBe(true);
    });

    it('rdJobs contains RD jobs alongside qBit torrents', async () => {
      mockPersistedJobs = [RD_JOB];
      mockQbitTorrents  = [{
        hash: 'def456', name: 'Some Movie', size: 1000, progress: 0.5,
        dlspeed: 0, upspeed: 0, num_seeds: 5, num_leechs: 2,
        eta: 100, state: 'downloading', save_path: '/downloads',
        added_on: 0, completion_on: 0, ratio: 0,
      }];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as unknown[];
      expect(rdJobs).toHaveLength(1);
      expect((rdJobs[0] as Record<string, unknown>).backend).toBe('real-debrid');
      // qBit torrents are separate
      const qbitTorrents = body.qbitTorrents as unknown[];
      expect(qbitTorrents).toHaveLength(1);
    });

    it('rdJobs is empty array when no RD jobs exist and qBit is online', async () => {
      mockPersistedJobs = [QBIT_JOB]; // only qBit job, no RD
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body.rdJobs).toEqual([]);
    });

    it('rdJobs filters out non-RD persisted jobs when qBit is online', async () => {
      mockPersistedJobs = [RD_JOB, QBIT_JOB, WT_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as Record<string, unknown>[];
      expect(rdJobs).toHaveLength(1);
      expect(rdJobs[0].backend).toBe('real-debrid');
    });
  });

  // ── qBit ONLINE path — API error ───────────────────────────────────────────

  describe('qBit online path — API error', () => {
    it('rdJobs is still present when getAllTorrents throws', async () => {
      mockQbitReachable       = true;
      mockPersistedJobs       = [RD_JOB];
      mockGetAllTorrentsError = new Error('qBit API error');

      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body).toHaveProperty('rdJobs');
      const rdJobs = body.rdJobs as unknown[];
      expect(rdJobs).toHaveLength(1);
    });

    it('rdJobs is empty array when no RD jobs and getAllTorrents throws', async () => {
      mockQbitReachable       = true;
      mockPersistedJobs       = [];
      mockGetAllTorrentsError = new Error('qBit API error');

      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      expect(body.rdJobs).toEqual([]);
    });
  });

  // ── Multiple RD jobs ───────────────────────────────────────────────────────

  describe('multiple RD jobs', () => {
    it('returns all RD jobs when multiple exist', async () => {
      const rdJob2 = { ...RD_JOB, jobId: 'rd-xyz999-1700000001000', infoHash: 'xyz999', title: 'Dune 4K' };
      mockPersistedJobs = [RD_JOB, rdJob2, QBIT_JOB];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as unknown[];
      expect(rdJobs).toHaveLength(2);
    });

    it('rdJobs preserves progress and speed fields from persisted store', async () => {
      const rdJobWithProgress = {
        ...RD_JOB,
        status: 'downloading' as const,
        progress: 42,
        bytesDownloaded: 420_000_000,
        bytesTotal: 1_000_000_000,
      };
      mockPersistedJobs = [rdJobWithProgress];
      const { req, res, captured } = makeReqRes();
      await handler(req, res);

      const body = captured.json as Record<string, unknown>;
      const rdJobs = body.rdJobs as Record<string, unknown>[];
      expect(rdJobs[0].progress).toBe(42);
      expect(rdJobs[0].bytesDownloaded).toBe(420_000_000);
      expect(rdJobs[0].bytesTotal).toBe(1_000_000_000);
    });
  });
});
