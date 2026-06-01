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
 *
 * HTTP caching:
 *   - ETag based on library item count + last-modified timestamp of the
 *     most recently updated item. If nothing changed, returns 304 Not Modified
 *     so the client reuses its cached copy — avoids re-sending the full JSON
 *     payload on every page navigation.
 *   - Cache-Control: no-cache (revalidate every time, but use cached copy if
 *     ETag matches). Not "no-store" — we want the browser to cache it.
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { readLibrary } from '../../libraryStore.js';
import { requireAuth } from '../../authMiddleware.js';
import { filterByRating } from '../../ratingGate.js';

interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

/** Build a cheap ETag from item count + the most recent lastWatchedAt timestamp */
function buildETag(library: Record<string, unknown>[], profileId: string): string {
  const count = library.length;
  // Find the most recently touched item — either by lastWatchedAt or addedAt
  let latestTs = '';
  for (const item of library) {
    const ts = (item.lastWatchedAt as string | undefined) || (item.addedAt as string | undefined) || '';
    if (ts > latestTs) latestTs = ts;
  }
  const raw = `${count}:${latestTs}:${profileId}`;
  return `"${crypto.createHash('md5').update(raw).digest('hex').slice(0, 16)}"`;
}

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const library = readLibrary<Record<string, unknown>>();

    const profileId = (req.query.profile as string | undefined)?.trim() ?? '';

    // ── ETag / 304 handling ───────────────────────────────────────────────────
    const etag = buildETag(library, profileId);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    if (!profileId) {
      // No profile filter — apply rating gate based on active session profile, return data
      const filtered = filterByRating(req, library as Array<{ rated?: string } & Record<string, unknown>>);
      return res.json(filtered);
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

    res.json(filterByRating(req, resolved as Array<{ rated?: string } & Record<string, unknown>>));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read media library', message: String(error) });
  }
}
