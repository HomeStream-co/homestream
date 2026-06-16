/**
 * downloadJobStore — persistent download job metadata.
 *
 * Persists qBittorrent and WebTorrent job metadata to homestream-downloads.json
 * so the Downloads page survives server restarts.
 *
 * What is persisted:
 *   - Job metadata: title, quality, type, season, episode, poster, imdbId, addedAt
 *   - Last known status (queued/downloading/done/error)
 *   - infoHash — used to re-match against live qBit data after restart
 *
 * What is NOT persisted:
 *   - Live progress/speed/ETA (these come from qBit API or WebTorrent at runtime)
 *
 * On restart, the Downloads page merges persisted metadata with live qBit data
 * using infoHash as the join key — so in-progress downloads show their real
 * progress again without any extra work.
 *
 * Retention: completed/error jobs are kept for 30 days, then pruned.
 */

import fs from 'fs';

import { dataPath } from './dataDir.js';
const JOBS_PATH = dataPath('homestream-downloads.json');
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersistedJob {
  jobId: string;
  infoHash: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: 'queued' | 'downloading' | 'transcoding' | 'done' | 'error';
  addedAt: string;
  completedAt?: string;
  poster?: string;
  imdbId: string;
  backend: 'qbittorrent' | 'webtorrent' | 'real-debrid';
  profileId?: string;
  errorCount?: number;
  /** 0–100 download progress (Real-Debrid only — qBit/WT use live API data) */
  progress?: number;
  /** Bytes downloaded so far (Real-Debrid only) */
  bytesDownloaded?: number;
  /** Total bytes (Real-Debrid only) */
  bytesTotal?: number;
}

// ── Write-through in-memory cache ─────────────────────────────────────────────
//
// FIX (🟡): Previously enqueueWrite called readRaw() (a synchronous disk read)
// inside every queue callback to get the current state before applying the
// updater. Under rapid Real-Debrid progress updates (up to 1 write/sec per
// active download × N concurrent downloads) this produced N disk reads per
// second — a read-before-every-write pattern that adds unnecessary I/O and
// latency.
//
// Now we maintain a module-level _cache that mirrors the on-disk state. The
// write queue applies updaters against _cache (memory), then flushes to disk.
// readRaw() returns _cache when populated, falling back to a one-time disk
// read on first access (cold start / after a server restart). This means:
//   - All writes after the first are pure memory → disk (no read round-trip).
//   - getAllPersistedJobs() / findJobByInfoHash() / getPersistedJob() all read
//     from memory — zero disk I/O for the common case.
//   - The write queue serialisation is preserved, so concurrent upserts are
//     still applied in order without races.

let _cache: PersistedJob[] | null = null;

function readRaw(): PersistedJob[] {
  if (_cache !== null) return _cache;
  if (!fs.existsSync(JOBS_PATH)) {
    _cache = [];
    return _cache;
  }
  try {
    _cache = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8')) as PersistedJob[];
  } catch {
    _cache = [];
  }
  return _cache;
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(updater: (current: PersistedJob[]) => PersistedJob[]): void {
  writeQueue = writeQueue.then(() => {
    // Apply updater against the in-memory cache — no disk read needed.
    const next = updater(readRaw());
    _cache = next; // keep cache in sync before the disk write
    const tmp = JOBS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, JOBS_PATH);
  }).catch(err => {
    console.error('[downloadJobStore] Write failed:', err);
    // On write failure, invalidate the cache so the next read re-syncs from disk.
    _cache = null;
  });
}

// ── Prune old completed jobs on startup ───────────────────────────────────────

function pruneOld(jobs: PersistedJob[]): PersistedJob[] {
  const cutoff = Date.now() - RETENTION_MS;
  return jobs.filter(j => {
    if (j.status === 'done' || j.status === 'error') {
      const ts = j.completedAt ? new Date(j.completedAt).getTime() : new Date(j.addedAt).getTime();
      return ts > cutoff;
    }
    return true; // keep active jobs forever
  });
}

enqueueWrite(pruneOld);

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllPersistedJobs(): PersistedJob[] {
  return readRaw();
}

/**
 * Reset the in-memory cache. FOR TESTING ONLY.
 * Call this in beforeEach when the fs mock resets diskData so the cache
 * doesn't serve stale data from a previous test.
 */
export function _resetCacheForTesting(): void {
  _cache = null;
}

export function upsertJob(job: PersistedJob): void {
  enqueueWrite(jobs => {
    const idx = jobs.findIndex(j => j.jobId === job.jobId);
    if (idx >= 0) {
      jobs[idx] = job;
    } else {
      jobs.push(job);
    }
    return jobs;
  });
}

export function updateJobStatus(
  jobId: string,
  status: PersistedJob['status'],
  completedAt?: string,
): void {
  enqueueWrite(jobs => {
    const job = jobs.find(j => j.jobId === jobId);
    if (job) {
      job.status = status;
      if (completedAt) job.completedAt = completedAt;
    }
    return jobs;
  });
}

/**
 * Update byte-level download progress for a Real-Debrid job.
 * Written to disk so the WS broadcaster can include it in the next push.
 * Throttled by the caller — called at most once per second.
 */
export function updateJobProgress(
  jobId: string,
  bytesDownloaded: number,
  bytesTotal: number,
): void {
  const progress = bytesTotal > 0 ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0;
  enqueueWrite(jobs => {
    const job = jobs.find(j => j.jobId === jobId);
    if (job) {
      job.progress = progress;
      job.bytesDownloaded = bytesDownloaded;
      job.bytesTotal = bytesTotal;
    }
    return jobs;
  });
}

export function getPersistedJob(jobId: string): PersistedJob | undefined {
  return readRaw().find(j => j.jobId === jobId);
}

export function deleteJob(jobId: string): void {
  enqueueWrite(jobs => jobs.filter(j => j.jobId !== jobId));
}

/**
 * Check whether an infoHash is already queued or downloading.
 * Used for duplicate detection before adding a new torrent.
 * Returns the existing job if found, undefined otherwise.
 */
export function findJobByInfoHash(infoHash: string): PersistedJob | undefined {
  return readRaw().find(j =>
    j.infoHash.toLowerCase() === infoHash.toLowerCase() &&
    (j.status === 'queued' || j.status === 'downloading' || j.status === 'transcoding')
  );
}

/**
 * Mark a job as interrupted so the UI can offer a resume/retry button.
 * Called when a download is interrupted mid-way (server restart, network drop).
 */
export function markJobInterrupted(jobId: string): void {
  enqueueWrite(jobs => {
    const job = jobs.find(j => j.jobId === jobId);
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      job.status = 'error';
      (job as PersistedJob & { interrupted?: boolean }).interrupted = true;
    }
    return jobs;
  });
}

/**
 * Return all jobs that were interrupted (status=error AND interrupted=true).
 * These are candidates for the "Resume" button.
 */
export function getInterruptedJobs(): (PersistedJob & { interrupted?: boolean })[] {
  return (readRaw() as (PersistedJob & { interrupted?: boolean })[])
    .filter(j => j.status === 'error' && j.interrupted === true);
}
