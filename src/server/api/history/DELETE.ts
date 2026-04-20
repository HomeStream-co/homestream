/**
 * DELETE /api/history
 *
 * Clears watch history for one or all items, scoped to a profile.
 *
 * Body:
 *   id?        — omit to clear all history
 *   profileId? — which profile's history to clear (defaults to 'adult')
 *
 * Behaviour:
 *   - Removes lastWatchedAt / watchedAt from the per-profile entry in
 *     profileProgress[profileId] (and resets progress to 0 for that profile)
 *   - If the cleared profile is 'adult' (or no profileId given), also clears
 *     the top-level lastWatchedAt / watchedAt fields for backwards compat
 *     with Jellyfin API and legacy code.
 *   - Does NOT touch other profiles' progress entries.
 */
import type { Request, Response } from 'express';
import { writeLibrary } from '../../libraryStore.js';

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { id, profileId = 'adult' } = req.body as { id?: string; profileId?: string };

    await writeLibrary<Record<string, unknown>>(lib => {
      return lib.map(item => {
        if (id && item.id !== id) return item;

        // Clear the per-profile entry
        const existingPP = (item.profileProgress as Record<string, ProfileProgressEntry> | undefined) ?? {};
        const profileEntry = existingPP[profileId];
        if (!profileEntry) return item; // nothing to clear for this profile

        const clearedEntry: ProfileProgressEntry = {
          progress: 0,
          watchedSeconds: 0,
          totalSeconds: profileEntry.totalSeconds,
          // Remove lastWatchedAt and watchedAt
        };

        const updatedPP: Record<string, ProfileProgressEntry> = {
          ...existingPP,
          [profileId]: clearedEntry,
        };

        const base: Record<string, unknown> = { ...item, profileProgress: updatedPP };

        // Keep top-level fields in sync for the adult profile (Jellyfin compat)
        if (profileId === 'adult') {
          delete base.lastWatchedAt;
          delete base.watchedAt;
          base.watchProgress = 0;
          base.watchedSeconds = 0;
        }

        return base;
      });
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history', message: String(err) });
  }
}
