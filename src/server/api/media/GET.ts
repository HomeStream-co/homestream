/**
 * GET /api/media?profile=adult|kids
 *
 * Returns the full media library. When a `profile` query param is provided,
 * the per-profile watch progress fields (watchProgress, watchedSeconds,
 * lastWatchedAt, watchedAt) are resolved for that profile before returning.
 *
 * This lets the Kids profile have its own Continue Watching row without
 * affecting the Adult profile's progress — and vice versa.
 *
 * If no profile param is given, returns raw library data (adult profile
 * top-level fields are always kept in sync for backwards compat).
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../libraryStore.js';

type ProfileId = 'adult' | 'kids';

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

export default function handler(req: Request, res: Response) {
  try {
    const library = readLibrary<Record<string, unknown>>();

    const profileId = req.query.profile as ProfileId | undefined;
    if (!profileId || (profileId !== 'adult' && profileId !== 'kids')) {
      // No profile filter — return raw data
      return res.json(library);
    }

    // Resolve per-profile progress fields
    const resolved = library.map(item => {
      const profileProgress = item.profileProgress as
        Record<string, ProfileProgressEntry> | undefined;

      if (!profileProgress) {
        // Legacy item — no per-profile data yet; return as-is
        return item;
      }

      const entry = profileProgress[profileId];
      if (!entry) {
        // This profile has never watched this item — zero out progress fields
        return {
          ...item,
          watchProgress: 0,
          watchedSeconds: 0,
          lastWatchedAt: undefined,
          watchedAt: undefined,
        };
      }

      return {
        ...item,
        watchProgress: entry.progress,
        watchedSeconds: entry.watchedSeconds ?? 0,
        ...(entry.totalSeconds !== undefined && { totalSeconds: entry.totalSeconds }),
        lastWatchedAt: entry.lastWatchedAt,
        watchedAt: entry.watchedAt,
      };
    });

    res.json(resolved);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read media library', message: String(error) });
  }
}
