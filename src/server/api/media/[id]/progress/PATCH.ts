import type { Request, Response } from 'express';
import { writeLibrary } from '../../../../libraryStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

/**
 * PATCH /api/media/:id/progress
 *
 * Persists watch progress to media-library.json so it survives server
 * restarts, device switches, and browser refreshes.
 *
 * Body:
 *   progress      — 0–100 percentage watched
 *   currentTime   — raw seconds (optional, stored for precision resume)
 *   duration      — total seconds (optional)
 *   profileId     — "adult" | "kids" (optional, defaults to "adult")
 *
 * Storage schema (per-profile):
 *   profileProgress: {
 *     adult: { progress, watchedSeconds, lastWatchedAt, watchedAt? },
 *     kids:  { progress, watchedSeconds, lastWatchedAt, watchedAt? },
 *   }
 *
 * For backwards compatibility, the top-level watchProgress / watchedSeconds /
 * lastWatchedAt / watchedAt fields are also updated to reflect the adult
 * profile (the primary profile). Jellyfin API and legacy code reads these.
 *
 * Side-effects:
 *   - Sets lastWatchedAt to now (ISO string) for "Continue Watching" ordering
 *   - If progress >= 95, marks watchProgress = 0 (completed — remove from CW row)
 *     and sets watchedAt = now
 *
 * Debounce:
 *   Server-side per-item debounce of 10 seconds. The player calls this every
 *   few seconds; without debouncing, 4 simultaneous viewers = 4 writes/second
 *   to media-library.json. Debounce reduces this to at most 1 write per item
 *   per 10 seconds while still capturing the final position on completion.
 */

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt: string;
  watchedAt?: string;
}

// ── Per-item debounce ─────────────────────────────────────────────────────────
// Key: `${mediaId}:${profileId}` → pending timer
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 10_000; // 10 seconds

interface PendingWrite {
  id: string;
  progress: number;
  currentTime?: number;
  duration?: number;
  profileId: string;
  resolve: (value: Record<string, unknown> | null) => void;
  reject: (err: unknown) => void;
}

const pendingData = new Map<string, PendingWrite>();

async function flushWrite(key: string): Promise<Record<string, unknown> | null> {
  const data = pendingData.get(key);
  pendingData.delete(key);
  pendingWrites.delete(key);
  if (!data) return null;

  const { id, progress, currentTime, duration, profileId } = data;
  const safeProfileId: string = profileId || 'adult';
  const now = new Date().toISOString();
  const isComplete = progress >= 95;

  let updated: Record<string, unknown> | null = null;

  await writeLibrary<Record<string, unknown>>(lib => {
    const idx = lib.findIndex(m => m.id === id);
    if (idx === -1) return lib;

    const item = lib[idx];

    const profileEntry: ProfileProgressEntry = {
      progress: isComplete ? 0 : progress,
      lastWatchedAt: now,
      ...(currentTime !== undefined && { watchedSeconds: isComplete ? 0 : currentTime }),
      ...(duration !== undefined && { totalSeconds: duration }),
      ...(isComplete && { watchedAt: now }),
    };

    const existingProfileProgress =
      (item.profileProgress as Record<string, ProfileProgressEntry> | undefined) ?? {};
    const profileProgress: Record<string, ProfileProgressEntry> = {
      ...existingProfileProgress,
      [safeProfileId]: profileEntry,
    };

    const adultEntry = safeProfileId === 'adult'
      ? profileEntry
      : (existingProfileProgress['adult'] ?? profileEntry);

    updated = {
      ...item,
      profileProgress,
      watchProgress: adultEntry.progress,
      lastWatchedAt: adultEntry.lastWatchedAt,
      ...(adultEntry.watchedSeconds !== undefined && { watchedSeconds: adultEntry.watchedSeconds }),
      ...(adultEntry.totalSeconds !== undefined && { totalSeconds: adultEntry.totalSeconds }),
      ...(adultEntry.watchedAt && { watchedAt: adultEntry.watchedAt }),
    };
    lib[idx] = updated!;
    return lib;
  });

  return updated;
}

// ── Flush all pending writes on shutdown ──────────────────────────────────────
// SIGTERM on Windows kills immediately — we hook the graceful /api/shutdown
// POST endpoint instead, but also register SIGINT for dev server Ctrl+C.
// This ensures the last seek position is never lost on a clean exit.
async function flushAllPending(): Promise<void> {
  const keys = [...pendingWrites.keys()];
  if (keys.length === 0) return;
  console.log(`[progress] Flushing ${keys.length} pending write(s) before shutdown…`);
  for (const key of keys) {
    const timer = pendingWrites.get(key);
    if (timer) clearTimeout(timer);
    try { await flushWrite(key); } catch (err) {
      console.error(`[progress] Flush failed for ${key}:`, err);
    }
  }
}

process.once('SIGINT',  () => flushAllPending().finally(() => process.exit(0)));
process.once('SIGTERM', () => flushAllPending().finally(() => process.exit(0)));

// Also export so /api/shutdown POST can call it directly before process.exit
export { flushAllPending as flushProgressWrites };

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { id } = req.params;
    const { progress, currentTime, duration, profileId = 'adult' } = req.body as {
      progress?: number;
      currentTime?: number;
      duration?: number;
      profileId?: string;
    };

    if (progress === undefined || typeof progress !== 'number') {
      return res.status(400).json({ error: 'progress (number) is required' });
    }

    const key = `${id}:${profileId || 'adult'}`;
    const isComplete = progress >= 95;

    // Always flush immediately on completion (>= 95%) so the final position
    // is never lost. For in-progress updates, debounce to reduce write frequency.
    if (isComplete) {
      // Cancel any pending debounced write for this item
      const existing = pendingWrites.get(key);
      if (existing) {
        clearTimeout(existing);
        pendingWrites.delete(key);
        pendingData.delete(key);
      }

      // Write immediately
      const safeProfileId = profileId || 'adult';
      const now = new Date().toISOString();
      let updated: Record<string, unknown> | null = null;

      await writeLibrary<Record<string, unknown>>(lib => {
        const idx = lib.findIndex(m => m.id === id);
        if (idx === -1) return lib;
        const item = lib[idx];

        const profileEntry: ProfileProgressEntry = {
          progress: 0,
          lastWatchedAt: now,
          watchedSeconds: 0,
          ...(duration !== undefined && { totalSeconds: duration }),
          watchedAt: now,
        };

        const existingProfileProgress =
          (item.profileProgress as Record<string, ProfileProgressEntry> | undefined) ?? {};
        const profileProgress = { ...existingProfileProgress, [safeProfileId]: profileEntry };

        const adultEntry = safeProfileId === 'adult'
          ? profileEntry
          : (existingProfileProgress['adult'] ?? profileEntry);

        updated = {
          ...item,
          profileProgress,
          watchProgress: adultEntry.progress,
          lastWatchedAt: adultEntry.lastWatchedAt,
          watchedSeconds: adultEntry.watchedSeconds ?? 0,
          ...(adultEntry.totalSeconds !== undefined && { totalSeconds: adultEntry.totalSeconds }),
          watchedAt: adultEntry.watchedAt,
        };
        lib[idx] = updated!;
        return lib;
      });

      if (!updated) return res.status(404).json({ error: 'Media item not found' });
      return res.json(updated);
    }

    // In-progress update — debounce
    // Store the latest data (overwrites any pending write for this key)
    pendingData.set(key, {
      id,
      progress,
      currentTime,
      duration,
      profileId: profileId || 'adult',
      resolve: () => {},
      reject: () => {},
    });

    // Reset the debounce timer
    const existing = pendingWrites.get(key);
    if (existing) clearTimeout(existing);

    pendingWrites.set(key, setTimeout(async () => {
      try {
        await flushWrite(key);
      } catch (err) {
        console.error('[progress] Debounced write failed:', err);
      }
    }, DEBOUNCE_MS));

    // Respond immediately — the write will happen in the background
    res.json({ ok: true, debounced: true });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update progress', message: String(error) });
  }
}

