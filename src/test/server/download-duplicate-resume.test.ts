/**
 * download-duplicate-resume.test.ts
 *
 * Tests for:
 *   1. Duplicate torrent detection in downloadJobStore.findJobByInfoHash()
 *   2. POST /api/stremio/downloads/retry — resume/retry interrupted downloads
 *   3. markJobInterrupted() and getInterruptedJobs()
 *
 * These features prevent the same torrent from being downloaded twice and
 * allow users to recover from interrupted downloads without losing progress.
 *
 * Coverage:
 *   findJobByInfoHash()
 *     - Returns undefined when no matching job exists
 *     - Returns the job when infoHash matches a queued job
 *     - Returns the job when infoHash matches a downloading job
 *     - Returns undefined for done/error jobs (not active duplicates)
 *     - Case-insensitive hash comparison
 *
 *   markJobInterrupted() / getInterruptedJobs()
 *     - Marks a queued job as interrupted (status=error, interrupted=true)
 *     - Marks a downloading job as interrupted
 *     - Does NOT mark done jobs as interrupted
 *     - getInterruptedJobs returns only interrupted jobs
 *
 *   POST /api/stremio/downloads/retry
 *     - 400 when jobId missing
 *     - 404 when job not found
 *     - 409 when job is not in error state
 *     - 409 when another active job has the same infoHash
 *     - Calls queueDownload (WebTorrent) when qBit offline
 *     - Returns ok:true with newJobId on success
 *     - Deletes old job before creating new one
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock fs (downloadJobStore needs it) ───────────────────────────────────────

let diskData: string = '[]';

vi.mock('fs', () => ({
  default: {
    existsSync:    () => true,
    readFileSync:  () => diskData,
    writeFileSync: (_p: string, data: string) => { diskData = data; },
  },
  existsSync:    () => true,
  readFileSync:  () => diskData,
  writeFileSync: (_p: string, data: string) => { diskData = data; },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/tmp/test-${name}`,
}));

// ── Import store AFTER mocks ──────────────────────────────────────────────────

const {
  upsertJob,
  findJobByInfoHash,
  markJobInterrupted,
  getInterruptedJobs,
  getAllPersistedJobs,
  _resetCacheForTesting,
} = await import('../../server/downloadJobStore.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetDisk() {
  diskData = '[]';
  _resetCacheForTesting(); // also clear the write-through in-memory cache
}

/** Flush the async write queue — upsertJob enqueues via Promise chain */
async function flush() {
  // Multiple awaits to drain nested promise chains in the write queue
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeJob(overrides: Partial<{
  jobId: string;
  infoHash: string;
  status: 'queued' | 'downloading' | 'done' | 'error';
  backend: 'qbittorrent' | 'webtorrent';
}> = {}) {
  return {
    jobId:    overrides.jobId    ?? `job-${Math.random().toString(36).slice(2)}`,
    infoHash: overrides.infoHash ?? 'aabbccdd1122334455667788',
    title:    'Test Movie',
    quality:  '1080p',
    type:     'movie' as const,
    status:   overrides.status   ?? 'queued' as const,
    addedAt:  new Date().toISOString(),
    imdbId:   'tt1234567',
    backend:  overrides.backend  ?? 'webtorrent' as const,
  };
}

// ── findJobByInfoHash() ───────────────────────────────────────────────────────

describe('findJobByInfoHash()', () => {
  beforeEach(resetDisk);

  it('returns undefined when no jobs exist', () => {
    expect(findJobByInfoHash('aabbccdd')).toBeUndefined();
  });

  it('returns the job when infoHash matches a queued job', async () => {
    const job = makeJob({ infoHash: 'abc123', status: 'queued' });
    upsertJob(job);
    await flush();
    const found = findJobByInfoHash('abc123');
    expect(found?.jobId).toBe(job.jobId);
  });

  it('returns the job when infoHash matches a downloading job', async () => {
    const job = makeJob({ infoHash: 'def456', status: 'downloading' });
    upsertJob(job);
    await flush();
    expect(findJobByInfoHash('def456')?.jobId).toBe(job.jobId);
  });

  it('returns undefined for done jobs (not an active duplicate)', async () => {
    const job = makeJob({ infoHash: 'done123', status: 'done' });
    upsertJob(job);
    await flush();
    expect(findJobByInfoHash('done123')).toBeUndefined();
  });

  it('returns undefined for error jobs', async () => {
    const job = makeJob({ infoHash: 'err123', status: 'error' });
    upsertJob(job);
    await flush();
    expect(findJobByInfoHash('err123')).toBeUndefined();
  });

  it('is case-insensitive (uppercase hash matches lowercase stored)', async () => {
    const job = makeJob({ infoHash: 'abcdef123456', status: 'queued' });
    upsertJob(job);
    await flush();
    expect(findJobByInfoHash('ABCDEF123456')?.jobId).toBe(job.jobId);
  });

  it('returns undefined when hash does not match any job', async () => {
    const job = makeJob({ infoHash: 'aaaa', status: 'queued' });
    upsertJob(job);
    await flush();
    expect(findJobByInfoHash('bbbb')).toBeUndefined();
  });
});

// ── markJobInterrupted() ──────────────────────────────────────────────────────

describe('markJobInterrupted()', () => {
  beforeEach(resetDisk);

  it('marks a queued job as error with interrupted=true', async () => {
    const job = makeJob({ status: 'queued' });
    upsertJob(job);
    await flush();
    markJobInterrupted(job.jobId);
    await flush();
    const all = getAllPersistedJobs() as Array<{ jobId: string; status: string; interrupted?: boolean }>;
    const found = all.find(j => j.jobId === job.jobId);
    expect(found?.status).toBe('error');
    expect(found?.interrupted).toBe(true);
  });

  it('marks a downloading job as interrupted', async () => {
    const job = makeJob({ status: 'downloading' });
    upsertJob(job);
    await flush();
    markJobInterrupted(job.jobId);
    await flush();
    const all = getAllPersistedJobs() as Array<{ jobId: string; status: string; interrupted?: boolean }>;
    const found = all.find(j => j.jobId === job.jobId);
    expect(found?.status).toBe('error');
    expect(found?.interrupted).toBe(true);
  });

  it('does NOT mark a done job as interrupted', async () => {
    const job = makeJob({ status: 'done' });
    upsertJob(job);
    await flush();
    markJobInterrupted(job.jobId);
    await flush();
    const all = getAllPersistedJobs() as Array<{ jobId: string; status: string; interrupted?: boolean }>;
    const found = all.find(j => j.jobId === job.jobId);
    expect(found?.status).toBe('done');
    expect(found?.interrupted).toBeUndefined();
  });
});

// ── getInterruptedJobs() ──────────────────────────────────────────────────────

describe('getInterruptedJobs()', () => {
  beforeEach(resetDisk);

  it('returns empty array when no interrupted jobs', () => {
    expect(getInterruptedJobs()).toHaveLength(0);
  });

  it('returns only interrupted jobs (not regular error jobs)', async () => {
    const interrupted = makeJob({ jobId: 'j1', status: 'queued' });
    const regularError = makeJob({ jobId: 'j2', status: 'error' });
    upsertJob(interrupted);
    upsertJob(regularError);
    await flush();
    markJobInterrupted('j1');
    await flush();
    const result = getInterruptedJobs();
    expect(result.some(j => j.jobId === 'j1')).toBe(true);
    expect(result.some(j => j.jobId === 'j2')).toBe(false);
  });

  it('returns multiple interrupted jobs', async () => {
    const j1 = makeJob({ jobId: 'i1', status: 'queued' });
    const j2 = makeJob({ jobId: 'i2', status: 'downloading' });
    upsertJob(j1);
    upsertJob(j2);
    await flush();
    markJobInterrupted('i1');
    markJobInterrupted('i2');
    await flush();
    const result = getInterruptedJobs();
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ── POST /api/stremio/downloads/retry ────────────────────────────────────────

// Mock dependencies for the retry handler
const mockIsReachable = vi.fn().mockResolvedValue(false); // default: qBit offline
const mockAddMagnet   = vi.fn().mockResolvedValue('newhash123');
const mockQueueDownload = vi.fn().mockReturnValue({ jobId: 'new-wt-job', infoHash: 'abc123' });

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: (...args: unknown[]) => mockIsReachable(...args),
  addMagnet:   (...args: unknown[]) => mockAddMagnet(...args),
}));

vi.mock('../../server/torrentManager.js', () => ({
  queueDownload: (...args: unknown[]) => mockQueueDownload(...args),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ mediaDir: '/media' }),
}));

const { default: retryHandler } = await import('../../server/api/stremio/downloads/retry/POST.js');

function makeReqRes(body: unknown = {}) {
  const req = {
    body,
    params: {},
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

describe('POST /api/stremio/downloads/retry — validation', () => {
  beforeEach(resetDisk);

  it('returns 400 when jobId is missing', async () => {
    const { req, res } = makeReqRes({});
    await retryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when job not found', async () => {
    const { req, res } = makeReqRes({ jobId: 'nonexistent' });
    await retryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when job is not in error state', async () => {
    const job = makeJob({ jobId: 'active-job', status: 'downloading' });
    upsertJob(job);
    await flush();
    const { req, res } = makeReqRes({ jobId: 'active-job' });
    await retryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('POST /api/stremio/downloads/retry — success (WebTorrent)', () => {
  beforeEach(() => {
    resetDisk();
    mockIsReachable.mockResolvedValue(false);
    mockQueueDownload.mockClear();
  });

  it('returns ok:true on successful retry', async () => {
    const job = makeJob({ jobId: 'err-job', status: 'error' });
    upsertJob(job);
    await flush();
    const { req, res, data } = makeReqRes({ jobId: 'err-job' });
    await retryHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls queueDownload with the stored job params', async () => {
    const job = makeJob({ jobId: 'err-job2', status: 'error', infoHash: 'myhash' });
    upsertJob(job);
    await flush();
    const { req, res } = makeReqRes({ jobId: 'err-job2' });
    await retryHandler(req, res);
    expect(mockQueueDownload).toHaveBeenCalledWith(expect.objectContaining({
      infoHash: 'myhash',
      title: 'Test Movie',
    }));
  });

  it('deletes the old error job before creating new one', async () => {
    const job = makeJob({ jobId: 'err-job3', status: 'error' });
    upsertJob(job);
    await flush();
    const { req, res } = makeReqRes({ jobId: 'err-job3' });
    await retryHandler(req, res);
    await flush();
    const all = getAllPersistedJobs();
    expect(all.find(j => j.jobId === 'err-job3')).toBeUndefined();
  });

  it('returns newJobId in response', async () => {
    const job = makeJob({ jobId: 'err-job4', status: 'error' });
    upsertJob(job);
    await flush();
    const { req, res, data } = makeReqRes({ jobId: 'err-job4' });
    await retryHandler(req, res);
    expect((data.json as { newJobId: string }).newJobId).toBeDefined();
  });

  it('returns backend: webtorrent when qBit offline', async () => {
    const job = makeJob({ jobId: 'err-job5', status: 'error' });
    upsertJob(job);
    await flush();
    const { req, res, data } = makeReqRes({ jobId: 'err-job5' });
    await retryHandler(req, res);
    expect((data.json as { backend: string }).backend).toBe('webtorrent');
  });
});

describe('POST /api/stremio/downloads/retry — duplicate guard', () => {
  beforeEach(() => {
    resetDisk();
    mockIsReachable.mockResolvedValue(false);
  });

  it('returns 409 when another active job has the same infoHash', async () => {
    const hash = 'shared-hash-xyz';
    const activeJob = makeJob({ jobId: 'active', infoHash: hash, status: 'downloading' });
    const errorJob  = makeJob({ jobId: 'errored', infoHash: hash, status: 'error' });
    upsertJob(activeJob);
    upsertJob(errorJob);
    await flush();

    const { req, res } = makeReqRes({ jobId: 'errored' });
    await retryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
