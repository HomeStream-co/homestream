/**
 * POST /api/profiles/switch
 *
 * Sets the active profile server-side by writing the `hs-profile` cookie.
 * This is the authoritative source for parental control enforcement —
 * the client cannot bypass it by manipulating localStorage.
 *
 * Body:
 *   { profileId: string, pin?: string }
 *
 * Flow:
 *   1. Validate profileId exists
 *   2. If profile has a PIN, verify it (returns 401 on mismatch)
 *   3. Set `hs-profile` cookie (httpOnly, sameSite strict, 30-day expiry)
 *   4. Return the public profile
 *
 * The cookie is httpOnly so JavaScript cannot read or forge it.
 * The parental control middleware (ratingGate.ts) reads this cookie.
 *
 * Clearing the active profile:
 *   POST /api/profiles/switch { profileId: '' } — clears the cookie
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { getProfile, verifyPin, toPublic } from '../../../profilesStore.js';

const COOKIE_NAME = 'hs-profile';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  try {
    const { profileId, pin } = req.body as { profileId?: string; pin?: string };

    // Clear profile
    if (!profileId || profileId.trim() === '') {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.json({ ok: true, profileId: null });
    }

    const profile = getProfile(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify PIN if the profile has one
    if (profile.pinHash) {
      if (!pin) {
        return res.status(401).json({ error: 'PIN required', requiresPin: true });
      }
      const valid = await verifyPin(profileId, pin);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect PIN', requiresPin: true });
      }
    }

    // Set the httpOnly cookie
    res.cookie(COOKIE_NAME, profileId, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return res.json({ ok: true, profile: toPublic(profile) });

  } catch (err) {
    res.status(500).json({ error: 'Failed to switch profile', message: String(err) });
  }
}
