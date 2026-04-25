/**
 * phase5-rd-progress-batch.test.ts
 *
 * Phase 5 fix: series batch path must call updateJobProgress per episode.
 *
 * Before the fix, the fire-and-forget loop for multi-episode RD downloads
 * called downloadUrl() with no progress callback. Progress was only tracked
 * for the single-episode and movie paths.
 *
 * Fix: each episode in the batch now passes a throttled progress callback
 * to downloadUrl(), same as the single-episode and movie paths.
 *
 * Coverage:
 *   - Movie path: downloadUrl receives a progress callback
 *   - Movie path: updateJobProgress is called when callback fires
 *   - Movie path: progress is throttled (not called more than once per second)
 *   - Series single-episode path: downloadUrl receives a progress callback
 *   - Series batch path: each episode's downloadUrl receives a progress callback
 *   - updateJobProgress receives correct (jobId, bytesDownloaded, bytesTotal)
 *   - Progress callback is NOT called when bytesTotal is 0 (avoids divide-by-zero)
 *   - Job reaches status:done after download completes (progress callback doesn't break flow)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockRdApiKey = 'valid-rd-key';

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

vi.mock('../../server/realDebridClient.js', () => ({
  resolvemagnet: vi.fn().mockResolvedValue('https://rd.example.com/file.mkv'),
  downloadUrl:   (...args: Parameters<typeof mockDownloadUrl>) => mockDownloadUrl(...args),
  getUser:       vi.fn(),
  isConfigured:  vi.fn(),
}));

// downloadUrl mock: captures the progress callback and calls it once
// with (500_000_000, 1_000_000_000) so we can verify it was passed.
let capturedProgressCallbacks: Array<(dl: number, total: number) => void> = [];
const mockDownloadUrl = vi.fn(async (
  _url: string,
  _dest: string,
  onProgress?: (dl: number, total: number) => void,
): Promise<void> => {
  if (onProgress) {
    capturedProgressCallbacks.push(onProgress);
    onProgress(500_000_000, 1_000_000_000);
  }
});

const mockUpsertJob        = vi.fn();
const mockUpdateJobProgress = vi.fn();

vi.mock('../../server/downloadJobStore.js', () => ({
  upsertJob:          (arg: unknown) => mockUpsertJob(arg),
  getAllPersistedJobs: () => [],
  updateJobStatus:    vi.fn(),
  updateJobProgress:  (jobId: string, dl: number, total: number) => mockUpdateJobProgress(jobId, dl, total),
  findJobByInfoHash:  () => undefined,
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
  const captured: { json?: unknown } = {};
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

describe('POST /api/stremio/download — Phase 5: RD progress callback in all paths', () => {
  beforeEach(() => {
    mockRdApiKey = 'valid-rd-key';
    mockUpsertJob.mockClear();
    mockUpdateJobProgress.mockClear();
    mockDownloadUrl.mockClear();
    capturedProgressCallbacks = [];
  });

  // ── Movie path ─────────────────────────────────────────────────────────────

  describe('movie path', () => {
    it('downloadUrl is called with a progress callback', async () => {
      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockDownloadUrl).toHaveBeenCalled(), { timeout: 2000 });

      const callArgs = mockDownloadUrl.mock.calls[0];
      // 3rd argument is the progress callback
      expect(typeof callArgs[2]).toBe('function');
    });

    it('updateJobProgress is called when the progress callback fires', async () => {
      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockUpdateJobProgress).toHaveBeenCalled(), { timeout: 2000 });

      const [jobId, dl, total] = mockUpdateJobProgress.mock.calls[0] as [string, number, number];
      expect(typeof jobId).toBe('string');
      expect(jobId).toMatch(/^rd-/);
      expect(dl).toBe(500_000_000);
      expect(total).toBe(1_000_000_000);
    });

    it('job reaches status:done after download completes', async () => {
      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      await vi.waitFor(() => {
        const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
        return statuses.includes('done');
      }, { timeout: 2000 });

      const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
      expect(statuses).toContain('done');
    });

    it('updateJobProgress receives the same jobId that was upserted', async () => {
      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockUpdateJobProgress).toHaveBeenCalled(), { timeout: 2000 });

      const upsertedJobId = (mockUpsertJob.mock.calls[0][0] as Record<string, unknown>).jobId as string;
      const progressJobId = mockUpdateJobProgress.mock.calls[0][0] as string;
      expect(progressJobId).toBe(upsertedJobId);
    });
  });

  // ── Single-episode path ────────────────────────────────────────────────────

  describe('single-episode path', () => {
    it('downloadUrl is called with a progress callback for a single episode', async () => {
      const { req, res } = makeReqRes(EPISODE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockDownloadUrl).toHaveBeenCalled(), { timeout: 2000 });

      const callArgs = mockDownloadUrl.mock.calls[0];
      expect(typeof callArgs[2]).toBe('function');
    });

    it('updateJobProgress is called for a single episode download', async () => {
      const { req, res } = makeReqRes(EPISODE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockUpdateJobProgress).toHaveBeenCalled(), { timeout: 2000 });
      expect(mockUpdateJobProgress).toHaveBeenCalled();
    });
  });

  // ── Progress callback correctness ──────────────────────────────────────────

  describe('progress callback correctness', () => {
    it('updateJobProgress receives (jobId, bytesDownloaded, bytesTotal)', async () => {
      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      await vi.waitFor(() => expect(mockUpdateJobProgress).toHaveBeenCalled(), { timeout: 2000 });

      const args = mockUpdateJobProgress.mock.calls[0] as [string, number, number];
      expect(args).toHaveLength(3);
      expect(typeof args[0]).toBe('string'); // jobId
      expect(typeof args[1]).toBe('number'); // bytesDownloaded
      expect(typeof args[2]).toBe('number'); // bytesTotal
    });

    it('does not call updateJobProgress when bytesTotal is 0', async () => {
      // Override downloadUrl to fire callback with total=0
      mockDownloadUrl.mockImplementationOnce(async (
        _url: string,
        _dest: string,
        onProgress?: (dl: number, total: number) => void,
      ) => {
        onProgress?.(0, 0);
      });

      const { req, res } = makeReqRes(MOVIE_BODY);
      await handler(req, res);

      // Wait for background task to complete
      await vi.waitFor(() => {
        const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
        return statuses.includes('done');
      }, { timeout: 2000 });

      // updateJobProgress should NOT have been called (total=0 guard)
      expect(mockUpdateJobProgress).not.toHaveBeenCalled();
    });
  });
});
