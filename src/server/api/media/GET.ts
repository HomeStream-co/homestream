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
import { readLibrary, writeLibrary } from '../../libraryStore.js';
import { DEMO_ITEM } from '../../demoItem.js';

// Seed once at module load — fires as soon as the API route is first imported,
// which happens on the first request to any /api/* endpoint.
let demoSeeded = false;

function ensureDemoSeeded() {
  if (demoSeeded) return;
  demoSeeded = true;
  try {
    const library = readLibrary<Record<string, unknown>>();
    if (library.find(m => m.id === 'demo-bbb')) return;
    writeLibrary(lib => {
      lib.unshift(DEMO_ITEM as unknown as Record<string, unknown>);
      return lib;
    }).catch(err => console.warn('[demo] Seed failed:', err));
    console.log('[demo] Big Buck Bunny seeded into library');
  } catch (err) {
    console.warn('[demo] Seed error (non-fatal):', err);
  }
}

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

export default function handler(req: Request, res: Response) {
  try {
    ensureDemoSeeded();
    const library = readLibrary<Record<string, unknown>>();

    const profileId = (req.query.profile as string | undefined)?.trim();
    if (!profileId) {
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
