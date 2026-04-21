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
import path from 'path';

const JOBS_PATH = path.resolve('./homestream-downloads.json');
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
  status: 'queued' | 'downloading' | 'done' | 'error';
  addedAt: string;
  completedAt?: string;
  poster?: string;
  imdbId: string;
  backend: 'qbittorrent' | 'webtorrent';
}

// ── Write queue ───────────────────────────────────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function readRaw(): PersistedJob[] {
  if (!fs.existsSync(JOBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8')) as PersistedJob[];
  } catch {
    return [];
  }
}

function enqueueWrite(updater: (current: PersistedJob[]) => PersistedJob[]): void {
  writeQueue = writeQueue.then(() => {
    const current = readRaw();
    const next = updater(current);
    fs.writeFileSync(JOBS_PATH, JSON.stringify(next, null, 2));
  }).catch(err => {
    console.error('[downloadJobStore] Write failed:', err);
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

export function getPersistedJob(jobId: string): PersistedJob | undefined {
  return readRaw().find(j => j.jobId === jobId);
}

export function deleteJob(jobId: string): void {
  enqueueWrite(jobs => jobs.filter(j => j.jobId !== jobId));
}
