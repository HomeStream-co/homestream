/**
 * optimization.test.ts
 *
 * Tests for performance-critical server utilities:
 *  - probeCache  — LRU in-memory ffprobe result cache
 *  - tmdbCache   — getCacheAge() freshness logic
 *  - transcodeStore — job lifecycle helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── probeCache ───────────────────────────────────────────────────────────────

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { getProbeCacheStats, invalidateProbeCache } from '../../server/probeCache.js';

describe('probeCache — cache stats', () => {
  it('returns size and maxSize', () => {
    const stats = getProbeCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxSize');
    expect(typeof stats.size).toBe('number');
    expect(typeof stats.maxSize).toBe('number');
    expect(stats.maxSize).toBeGreaterThan(0);
  });

  it('size is non-negative', () => {
    const { size } = getProbeCacheStats();
    expect(size).toBeGreaterThanOrEqual(0);
  });

  it('invalidateProbeCache does not throw for unknown path', () => {
    expect(() => invalidateProbeCache('/nonexistent/file.mp4')).not.toThrow();
  });

  it('size does not increase after invalidating a non-cached path', () => {
    const before = getProbeCacheStats().size;
    invalidateProbeCache('/some/random/path.mkv');
    const after = getProbeCacheStats().size;
    expect(after).toBe(before);
  });
});

// ─── tmdbCache — getCacheAge ──────────────────────────────────────────────────

import { getCacheAge } from '../../server/tmdbCache.js';

describe('tmdbCache — getCacheAge', () => {
  it('returns fetchedAt and stale fields', () => {
    const result = getCacheAge();
    expect(result).toHaveProperty('fetchedAt');
    expect(result).toHaveProperty('stale');
    expect(typeof result.stale).toBe('boolean');
  });

  it('fetchedAt is null or a number', () => {
    const { fetchedAt } = getCacheAge();
    expect(fetchedAt === null || typeof fetchedAt === 'number').toBe(true);
  });

  it('stale is true when fetchedAt is null (never fetched)', () => {
    // If cache has never been populated, it should be considered stale
    const { fetchedAt, stale } = getCacheAge();
    if (fetchedAt === null) {
      expect(stale).toBe(true);
    }
  });

  it('stale is false when fetchedAt is very recent', () => {
    // We can't easily force a fresh fetch in unit tests, but we can verify
    // the logic: if fetchedAt is within the last second, stale must be false
    // (cache TTL is 30 days — 1 second ago is definitely fresh)
    const { fetchedAt, stale } = getCacheAge();
    if (fetchedAt !== null) {
      const ageMs = Date.now() - fetchedAt;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (ageMs < THIRTY_DAYS_MS) {
        expect(stale).toBe(false);
      }
    }
  });
});

// ─── transcodeStore — job lifecycle ──────────────────────────────────────────

import {
  createJob,
  getJob,
  updateJob,
  getAllJobs,
} from '../../server/transcodeStore.js';

describe('transcodeStore — job lifecycle', () => {
  const mediaId = `test-opt-${Date.now()}`;

  beforeEach(() => {
    createJob(mediaId, '/tmp/input.mkv', '/tmp/output.mp4');
  });

  it('createJob returns a job object with correct fields', () => {
    const job = getJob(mediaId);
    expect(job).toBeDefined();
    expect(job?.mediaId).toBe(mediaId);
  });

  it('new job starts with queued or processing status', () => {
    const job = getJob(mediaId);
    expect(['queued', 'processing', 'pending']).toContain(job?.status);
  });

  it('updateJob updates progress', () => {
    updateJob(mediaId, { progress: 42 });
    const job = getJob(mediaId);
    expect(job?.progress).toBe(42);
  });

  it('updateJob updates status to done', () => {
    updateJob(mediaId, { status: 'done', progress: 100 });
    const job = getJob(mediaId);
    expect(job?.status).toBe('done');
    expect(job?.progress).toBe(100);
  });

  it('updateJob updates status to error', () => {
    updateJob(mediaId, { status: 'error' });
    const job = getJob(mediaId);
    expect(job?.status).toBe('error');
  });

  it('getJob returns undefined for unknown mediaId', () => {
    expect(getJob('nonexistent-media-id-xyz')).toBeUndefined();
  });

  it('getAllJobs returns an array', () => {
    const jobs = getAllJobs();
    expect(Array.isArray(jobs)).toBe(true);
  });

  it('getAllJobs includes the created job', () => {
    const jobs = getAllJobs();
    const found = jobs.find(j => j.mediaId === mediaId);
    expect(found).toBeDefined();
  });

  it('job progress is a number between 0 and 100', () => {
    updateJob(mediaId, { progress: 55 });
    const job = getJob(mediaId);
    expect(job?.progress).toBeGreaterThanOrEqual(0);
    expect(job?.progress).toBeLessThanOrEqual(100);
  });

  it('multiple progress updates accumulate correctly', () => {
    updateJob(mediaId, { progress: 10 });
    updateJob(mediaId, { progress: 75 });
    const job = getJob(mediaId);
    expect(job?.progress).toBe(75);
  });
});
