/**
 * subscriptionStore — persists per-show auto-download subscriptions.
 *
 * Each subscription tracks:
 *   - imdbId / title / poster — show identity
 *   - schedule — how often to check for new episodes
 *   - lastCheckedAt — ISO timestamp of last check
 *   - lastFoundEpisode — { season, episode } of the highest episode we've
 *     already queued, so we only queue NEW episodes on subsequent checks
 *   - enabled — can be paused without deleting
 *
 * Persisted to homestream-subscriptions.json via write queue (same pattern
 * as downloadJobStore / sessionStore).
 */

import fs from 'fs';

import { dataPath } from './dataDir.js';
const SUBS_PATH = dataPath('homestream-subscriptions.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckSchedule =
  | 'daily'       // every 24 h
  | 'every3days'  // every 72 h
  | 'weekly'      // every 7 days
  | 'every2weeks' // every 14 days

export const SCHEDULE_LABELS: Record<CheckSchedule, string> = {
  daily:       'Every day',
  every3days:  'Every 3 days',
  weekly:      'Every week',
  every2weeks: 'Every 2 weeks',
};

export const SCHEDULE_MS: Record<CheckSchedule, number> = {
  daily:       24 * 60 * 60 * 1000,
  every3days:  3  * 24 * 60 * 60 * 1000,
  weekly:      7  * 24 * 60 * 60 * 1000,
  every2weeks: 14 * 24 * 60 * 60 * 1000,
};

export interface ShowSubscription {
  /** Unique id — same as imdbId so it's easy to look up */
  id: string;
  imdbId: string;
  title: string;
  poster?: string;
  totalSeasons: number;
  schedule: CheckSchedule;
  enabled: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  /** Highest season+episode we have already queued/downloaded */
  lastFoundEpisode?: { season: number; episode: number };
  /** ISO timestamp of the next scheduled check (computed on write) */
  nextCheckAt?: string;
}

// ── Write queue ───────────────────────────────────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function readRaw(): ShowSubscription[] {
  if (!fs.existsSync(SUBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUBS_PATH, 'utf-8')) as ShowSubscription[];
  } catch {
    return [];
  }
}

function enqueueWrite(updater: (current: ShowSubscription[]) => ShowSubscription[]): void {
  writeQueue = writeQueue
    .then(() => {
      const current = readRaw();
      const next = updater(current);
      fs.writeFileSync(SUBS_PATH, JSON.stringify(next, null, 2));
    })
    .catch(err => {
      console.error('[subscriptionStore] Write failed:', err);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNextCheck(schedule: CheckSchedule, fromNow = true): string {
  return new Date(Date.now() + (fromNow ? SCHEDULE_MS[schedule] : 0)).toISOString();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllSubscriptions(): ShowSubscription[] {
  return readRaw();
}

export function getSubscription(imdbId: string): ShowSubscription | undefined {
  return readRaw().find(s => s.imdbId === imdbId);
}

export function upsertSubscription(sub: Omit<ShowSubscription, 'id' | 'createdAt' | 'nextCheckAt'> & Partial<Pick<ShowSubscription, 'createdAt' | 'nextCheckAt'>>): ShowSubscription {
  let result!: ShowSubscription;
  enqueueWrite(subs => {
    const idx = subs.findIndex(s => s.imdbId === sub.imdbId);
    const now = new Date().toISOString();
    const full: ShowSubscription = {
      ...sub,
      id: sub.imdbId,
      createdAt: sub.createdAt ?? now,
      nextCheckAt: computeNextCheck(sub.schedule),
    };
    result = full;
    if (idx >= 0) {
      subs[idx] = full;
    } else {
      subs.push(full);
    }
    return subs;
  });
  return result;
}

export function updateAfterCheck(
  imdbId: string,
  lastFoundEpisode?: { season: number; episode: number },
): void {
  enqueueWrite(subs => {
    const sub = subs.find(s => s.imdbId === imdbId);
    if (!sub) return subs;
    sub.lastCheckedAt = new Date().toISOString();
    sub.nextCheckAt = computeNextCheck(sub.schedule);
    if (lastFoundEpisode) sub.lastFoundEpisode = lastFoundEpisode;
    return subs;
  });
}

export function deleteSubscription(imdbId: string): void {
  enqueueWrite(subs => subs.filter(s => s.imdbId !== imdbId));
}

export function setEnabled(imdbId: string, enabled: boolean): void {
  enqueueWrite(subs => {
    const sub = subs.find(s => s.imdbId === imdbId);
    if (sub) {
      sub.enabled = enabled;
      sub.nextCheckAt = enabled ? computeNextCheck(sub.schedule) : undefined;
    }
    return subs;
  });
}

/** Returns subscriptions that are due for a check right now */
export function getDueSubscriptions(): ShowSubscription[] {
  const now = Date.now();
  return readRaw().filter(s => {
    if (!s.enabled) return false;
    if (!s.nextCheckAt) return true;
    return new Date(s.nextCheckAt).getTime() <= now;
  });
}
