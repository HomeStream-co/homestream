/**
 * GET /api/history?profile=<profileId>
 *
 * Returns all library items that have been watched at least once by the
 * given profile, sorted by lastWatchedAt descending (most recent first).
 *
 * When a profileId is supplied, per-profile progress fields are resolved
 * from item.profileProgress[profileId] so each profile sees only its own
 * watch history. Falls back to top-level fields for legacy items that
 * pre-date the per-profile schema.
 *
 * Each entry includes: id, title, type, poster, watchProgress,
 * watchedSeconds, totalSeconds, lastWatchedAt, watchedAt (if complete)
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../libraryStore.js';

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

interface LibraryItem {
  id: string;
  title: string;
  type: string;
  poster?: string;
  watchProgress?: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
  genre?: string[];
  imdbRating?: string;
  year?: string;
  rated?: string;
  profileProgress?: Record<string, ProfileProgressEntry>;
}

export default async function handler(req: Request, res: Response) {
  try {
    const profileId = (req.query.profile as string | undefined)?.trim();
    const library = readLibrary<LibraryItem>();

    const watched = library
      .map(item => {
        // Resolve progress fields for the requested profile
        if (profileId && item.profileProgress) {
          const entry = item.profileProgress[profileId];
          if (!entry || !entry.lastWatchedAt) return null; // never watched by this profile
          return {
            id: item.id,
            title: item.title,
            type: item.type,
            poster: item.poster,
            watchProgress: entry.progress ?? 0,
            watchedSeconds: entry.watchedSeconds ?? 0,
            totalSeconds: entry.totalSeconds ?? 0,
            lastWatchedAt: entry.lastWatchedAt,
            watchedAt: entry.watchedAt,
            genre: item.genre ?? [],
            imdbRating: item.imdbRating,
            year: item.year,
            rated: item.rated,
          };
        }

        // Legacy / no profile param — fall back to top-level fields
        if (!item.lastWatchedAt) return null;
        return {
          id: item.id,
          title: item.title,
          type: item.type,
          poster: item.poster,
          watchProgress: item.watchProgress ?? 0,
          watchedSeconds: item.watchedSeconds ?? 0,
          totalSeconds: item.totalSeconds ?? 0,
          lastWatchedAt: item.lastWatchedAt,
          watchedAt: item.watchedAt,
          genre: item.genre ?? [],
          imdbRating: item.imdbRating,
          year: item.year,
          rated: item.rated,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
        const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
        return tb - ta;
      });

    res.json(watched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history', message: String(err) });
  }
}
