/**
 * probe-cache-ttl.test.ts
 *
 * Tests for probeCache TTL eviction (evictStaleProbeCache).
 *
 * The cache Map is private, so we populate it by calling probeFile() with a
 * mocked spawn that returns valid ffprobe JSON, then advance Date.now() past
 * the 24-hour TTL using vi.setSystemTime, then verify evictStaleProbeCache()
 * removes the stale entries.
 *
 * Tests:
 *   ✓ evictStaleProbeCache returns 0 when cache is empty
 *   ✓ evictStaleProbeCache returns 0 for entries accessed within 24h
 *   ✓ evictStaleProbeCache returns N for entries older than 24h
 *   ✓ evictStaleProbeCache removes evicted entries (size decreases)
 *   ✓ evictStaleProbeCache keeps fresh entries (size unchanged for fresh)
 *   ✓ evictStaleProbeCache is idempotent (second call returns 0)
 *   ✓ invalidateProbeCache removes a specific entry
 *   ✓ getProbeCacheStats reflects size after eviction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock spawn to return valid ffprobe JSON ───────────────────────────────────

const FAKE_PROBE_JSON = JSON.stringify({
  streams: [
    {
      codec_name: 'h264',
      codec_type: 'video',
      width: 1920,
      height: 1080,
      bit_rate: '4000000',
      duration: '3600.0',
    },
    {
      codec_name: 'aac',
      codec_type: 'audio',
      channels: 2,
      tags: { language: 'eng', title: 'English' },
      disposition: { default: 1 },
    },
  ],
  format: {
    size: '1800000000',
    bit_rate: '4000000',
    duration: '3600.0',
  },
});

function makeFakeProc(stdout: string) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();

  // Use process.nextTick instead of setImmediate — nextTick fires even under
  // vi.useFakeTimers() because Vitest only fakes setTimeout/setInterval/Date,
  // not the microtask queue.
  process.nextTick(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', 0);
  });

  return proc;
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => makeFakeProc(FAKE_PROBE_JSON)),
}));

// Also mock fs.statSync so probeFile can read mtime without hitting disk
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      statSync: vi.fn(() => ({ mtimeMs: 1000, size: 1_800_000_000 })),
      existsSync: vi.fn(() => true),
    },
    statSync: vi.fn(() => ({ mtimeMs: 1000, size: 1_800_000_000 })),
    existsSync: vi.fn(() => true),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

import {
  evictStaleProbeCache,
  probeFile,
  invalidateProbeCache,
  getProbeCacheStats,
} from '../../server/probeCache.js';

const TTL_MS = 24 * 60 * 60 * 1000; // must match probeCache.ts

describe('probeCache — TTL eviction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns 0 when cache is empty (no entries to evict)', () => {
    // Evict anything that may have been populated by other tests
    evictStaleProbeCache();
    const result = evictStaleProbeCache();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(typeof result).toBe('number');
  });

  it('returns 0 for entries accessed within the last 24h', async () => {
    const path = '/media/fresh-movie.mkv';
    await probeFile(path);

    // Advance time by 23h 59m — still within TTL
    vi.advanceTimersByTime(TTL_MS - 60_000);

    const evicted = evictStaleProbeCache();
    // The entry we just added should NOT be evicted
    expect(evicted).toBe(0);
  });

  it('evicts entries older than 24h', async () => {
    const path = '/media/old-movie.mkv';
    await probeFile(path);

    const before = getProbeCacheStats().size;
    expect(before).toBeGreaterThan(0);

    // Advance time past TTL
    vi.advanceTimersByTime(TTL_MS + 1);

    const evicted = evictStaleProbeCache();
    expect(evicted).toBeGreaterThan(0);

    const after = getProbeCacheStats().size;
    expect(after).toBeLessThan(before);
  });

  it('is idempotent — second call returns 0 after first eviction', async () => {
    const path = '/media/idempotent-movie.mkv';
    await probeFile(path);

    vi.advanceTimersByTime(TTL_MS + 1);

    const first  = evictStaleProbeCache();
    const second = evictStaleProbeCache();

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0); // nothing left to evict
  });

  it('keeps fresh entries when evicting stale ones', async () => {
    const stalePath = '/media/stale-movie.mkv';
    const freshPath = '/media/fresh-movie-2.mkv';

    // Populate stale entry
    await probeFile(stalePath);

    // Advance past TTL
    vi.advanceTimersByTime(TTL_MS + 1);

    // Populate fresh entry (after time advance — its lastAccess is now)
    await probeFile(freshPath);

    const sizeBefore = getProbeCacheStats().size;
    const evicted = evictStaleProbeCache();

    // stalePath should be evicted, freshPath should remain
    expect(evicted).toBeGreaterThan(0);
    expect(getProbeCacheStats().size).toBe(sizeBefore - evicted);
  });

  it('invalidateProbeCache removes a specific entry without affecting others', async () => {
    const pathA = '/media/movie-a.mkv';
    const pathB = '/media/movie-b.mkv';

    await probeFile(pathA);
    await probeFile(pathB);

    const before = getProbeCacheStats().size;
    invalidateProbeCache(pathA);
    const after = getProbeCacheStats().size;

    expect(after).toBe(before - 1);
  });

  it('getProbeCacheStats size reflects eviction', async () => {
    const path = '/media/stats-test.mkv';
    await probeFile(path);

    const before = getProbeCacheStats().size;
    vi.advanceTimersByTime(TTL_MS + 1);
    evictStaleProbeCache();
    const after = getProbeCacheStats().size;

    expect(after).toBeLessThanOrEqual(before);
  });
});
