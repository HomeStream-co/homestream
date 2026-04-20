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
 */

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt: string;
  watchedAt?: string;
}

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

    const safeProfileId: string = profileId || 'adult';
    const now = new Date().toISOString();
    const isComplete = progress >= 95;

    let updated: Record<string, unknown> | null = null;

    await writeLibrary<Record<string, unknown>>(lib => {
      const idx = lib.findIndex(m => m.id === id);
      if (idx === -1) return lib;

      const item = lib[idx];

      // Build the per-profile progress entry
      const profileEntry: ProfileProgressEntry = {
        progress: isComplete ? 0 : progress,
        lastWatchedAt: now,
        ...(currentTime !== undefined && { watchedSeconds: isComplete ? 0 : currentTime }),
        ...(duration !== undefined && { totalSeconds: duration }),
        ...(isComplete && { watchedAt: now }),
      };

      // Merge into profileProgress map
      const existingProfileProgress =
        (item.profileProgress as Record<string, ProfileProgressEntry> | undefined) ?? {};
      const profileProgress: Record<string, ProfileProgressEntry> = {
        ...existingProfileProgress,
        [safeProfileId]: profileEntry,
      };

      // Keep top-level fields in sync with the adult profile for backwards compat
      // (Jellyfin API, startupCleanup, and any direct reads use these)
      const adultEntry = safeProfileId === 'adult'
        ? profileEntry
        : (existingProfileProgress['adult'] ?? profileEntry);

      updated = {
        ...item,
        profileProgress,
        // Top-level fields mirror adult profile
        watchProgress: adultEntry.progress,
        lastWatchedAt: adultEntry.lastWatchedAt,
        ...(adultEntry.watchedSeconds !== undefined && { watchedSeconds: adultEntry.watchedSeconds }),
        ...(adultEntry.totalSeconds !== undefined && { totalSeconds: adultEntry.totalSeconds }),
        ...(adultEntry.watchedAt && { watchedAt: adultEntry.watchedAt }),
      };
      lib[idx] = updated!;
      return lib;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update progress', message: String(error) });
  }
}
