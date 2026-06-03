/**
 * ratingGate — server-side parental control enforcement
 *
 * Checks the active profile (from the `hs-profile` session cookie) against
 * a media item's MPAA/TV rating. If the profile is restricted and the rating
 * exceeds the allowed threshold, the request is rejected with 403.
 *
 * Rating hierarchy (most permissive → most restrictive):
 *   TV-Y < TV-Y7 < TV-G < TV-PG < TV-14 < TV-MA
 *   G    < PG    < PG-13 < R    < NC-17
 *
 * A "restricted" profile allows: G, PG, TV-Y, TV-Y7, TV-G, TV-PG
 * An "unrestricted" profile allows everything.
 *
 * The `maxRating` field (optional) overrides the default restricted set,
 * allowing fine-grained control (e.g. allow PG-13 but not R).
 *
 * Usage:
 *   import { checkRating } from '../../ratingGate.js';
 *   // In a handler:
 *   if (!checkRating(req, res, item.rated)) return;
 */

import type { Request, Response } from 'express';
import { getProfile } from './profilesStore.js';

// ── Rating order ──────────────────────────────────────────────────────────────

const MOVIE_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'X'];
const TV_ORDER    = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];

/** Returns a numeric severity score for a rating (higher = more adult). */
function ratingScore(rating: string): number {
  const r = rating.trim().toUpperCase();
  const tvIdx = TV_ORDER.indexOf(r);
  if (tvIdx !== -1) return tvIdx;
  const mvIdx = MOVIE_ORDER.indexOf(r);
  if (mvIdx !== -1) return mvIdx;
  // Unknown ratings: treat as adult content (restrictive default)
  return 99;
}

// ── Default allowed set for restricted profiles ───────────────────────────────

const DEFAULT_RESTRICTED_RATINGS = new Set([
  'G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG',
]);

/**
 * Returns true if `rating` is allowed for a restricted profile with the given
 * `maxRating` ceiling (or the default restricted set if maxRating is absent).
 */
function isRatingAllowed(rating: string, maxRating?: string): boolean {
  const r = rating.trim().toUpperCase();
  if (!r || r === 'N/A' || r === 'NR' || r === 'UNKNOWN' || r === 'NOT RATED') {
    // Unrated content: block for restricted profiles (conservative default)
    return false;
  }

  if (maxRating) {
    // Custom ceiling: allow anything ≤ maxRating score
    return ratingScore(r) <= ratingScore(maxRating);
  }

  // Default: only allow the standard kids set
  return DEFAULT_RESTRICTED_RATINGS.has(r);
}

// ── Active profile resolution ─────────────────────────────────────────────────

/**
 * Read the active profile ID from the `hs-profile` cookie.
 * Falls back to 'adult' (unrestricted) if no cookie is set.
 */
export function getActiveProfileId(req: Request): string {
  const cookie = req.cookies?.['hs-profile'];
  if (typeof cookie === 'string' && cookie.trim()) return cookie.trim();
  return 'adult';
}

// ── Gate function ─────────────────────────────────────────────────────────────

/**
 * Check whether the active profile is allowed to access content with the
 * given MPAA/TV rating.
 *
 * Returns true if access is allowed.
 * Returns false AND sends a 403 response if access is denied.
 *
 * @param req     Express request (reads `hs-profile` cookie)
 * @param res     Express response (sends 403 on denial)
 * @param rated   MPAA/TV rating string from the media item (e.g. "PG-13")
 */
export function checkRating(req: Request, res: Response, rated?: string): boolean {
  // No rating info — allow (can't gate what we don't know; user explicitly
  // chose to play this item). filterByRating() is more conservative for lists.
  if (!rated || rated.trim() === '' || rated.trim().toUpperCase() === 'N/A') return true;

  const profileId = getActiveProfileId(req);
  const profile = getProfile(profileId);

  // Unknown profile, admin, or unrestricted — allow
  if (!profile || profile.isAdmin || !profile.restricted) return true;

  const allowed = isRatingAllowed(rated, profile.maxRating);
  if (!allowed) {
    res.status(403).json({
      error: 'Content restricted',
      message: `This content (rated ${rated}) is not available for the "${profile.name}" profile.`,
      rated,
      profileId,
    });
    return false;
  }

  return true;
}

/**
 * Filter an array of media items to only those allowed for the active profile.
 * Used by list endpoints (GET /api/media, GET /api/library, etc.) to avoid
 * leaking restricted titles in the response.
 */
export function filterByRating<T extends { rated?: string }>(
  req: Request,
  items: T[],
): T[] {
  const profileId = getActiveProfileId(req);
  const profile = getProfile(profileId);

  // Admin or unrestricted profile — return everything
  if (!profile || profile.isAdmin || !profile.restricted) return items;

  return items.filter(item => {
    const r = item.rated ?? '';
    if (!r || r.trim().toUpperCase() === 'N/A') return false; // block unrated
    return isRatingAllowed(r, profile.maxRating);
  });
}
