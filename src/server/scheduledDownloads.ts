/**
 * scheduledDownloads — persistent store + cron-style engine
 *
 * Scheduled jobs are stored in homestream-scheduled.json alongside the other
 * data files. Every minute the engine checks for jobs whose `scheduledFor`
 * timestamp has passed and fires them via the same download pipeline used by
 * the StremioPanel.
 *
 * Schema per job:
 *   id          — uuid-style unique ID
 *   title       — human-readable label (movie/show name)
 *   imdbId      — tt-prefixed IMDB ID
 *   type        — 'movie' | 'series'
 *   season      — optional (series only)
 *   episode     — optional (series only)
 *   poster      — optional poster URL
 *   year        — optional release year string
 *   streams     — optional pre-selected stream list (from StremioPanel)
 *   scheduledFor — ISO timestamp — when to fire
 *   status      — 'pending' | 'fired' | 'error'
 *   createdAt   — ISO timestamp
 *   firedAt     — ISO timestamp (set when fired)
 *   error       — error message if status === 'error'
 */

import fs from 'fs';
import { dataPath } from './dataDir.js';

const STORE_PATH = dataPath('homestream-scheduled.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  title: string;
  imdbId: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  poster?: string;
  year?: string;
  streams?: unknown[];
  scheduledFor: string;   // ISO
  status: 'pending' | 'fired' | 'error';
  createdAt: string;      // ISO
  firedAt?: string;       // ISO
  error?: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function readAll(): ScheduledJob[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as ScheduledJob[];
  } catch {
    return [];
  }
}

function writeAll(jobs: ScheduledJob[]): void {
  const tmp = STORE_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    console.error('[scheduledDownloads] Write failed:', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listScheduled(): ScheduledJob[] {
  return readAll();
}

export function addScheduled(job: Omit<ScheduledJob, 'id' | 'status' | 'createdAt'>): ScheduledJob {
  const jobs = readAll();
  const newJob: ScheduledJob = {
    ...job,
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  writeAll(jobs);
  return newJob;
}

export function removeScheduled(id: string): boolean {
  const jobs = readAll();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return false;
  jobs.splice(idx, 1);
  writeAll(jobs);
  return true;
}

function updateJob(id: string, patch: Partial<ScheduledJob>): void {
  const jobs = readAll();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...patch };
  writeAll(jobs);
}

// ── Scheduler engine ──────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

async function fireDueJobs(): Promise<void> {
  const now = Date.now();
  const jobs = readAll().filter(j => j.status === 'pending' && new Date(j.scheduledFor).getTime() <= now);

  for (const job of jobs) {
    console.log(`[scheduler] Firing scheduled download: "${job.title}" (${job.id})`);
    try {
      const body: Record<string, unknown> = {
        imdbId: job.imdbId,
        type: job.type,
        title: job.title,
        poster: job.poster,
        year: job.year,
        streams: job.streams,
      };
      if (job.season != null) body.season = job.season;
      if (job.episode != null) body.episode = job.episode;

      // Fire via internal loopback — same pipeline as the StremioPanel
      const res = await fetch('http://127.0.0.1:3000/api/stremio/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Server-Call': 'homestream',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        updateJob(job.id, { status: 'fired', firedAt: new Date().toISOString() });
        console.log(`[scheduler] Fired OK: "${job.title}"`);
      } else {
        const err = await res.text();
        updateJob(job.id, { status: 'error', error: `HTTP ${res.status}: ${err.slice(0, 200)}` });
        console.error(`[scheduler] Fire failed for "${job.title}": HTTP ${res.status}`);
      }
    } catch (err) {
      updateJob(job.id, { status: 'error', error: String(err) });
      console.error(`[scheduler] Fire exception for "${job.title}":`, err);
    }
  }
}

/**
 * Start the scheduler. Safe to call multiple times — only one timer runs.
 * Call this once from server boot (vite-plugin-api-routes entry or Electron main).
 */
export function startScheduler(): void {
  if (_timer) return;
  console.log('[scheduler] Starting scheduled download engine (60s tick)');
  // Fire immediately on startup to catch any jobs that were due while offline
  void fireDueJobs();
  _timer = setInterval(() => { void fireDueJobs(); }, 60_000);
}

export function stopScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
