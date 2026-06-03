import type { Request, Response } from 'express';
import { updateProfile, toPublic, getProfile } from '../../../profilesStore.js';
import { requireAuth } from '../../../authMiddleware.js';
import { getActiveProfileId } from '../../../ratingGate.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const { name, avatar, color, restricted, maxRating, isAdmin } = req.body as {
      name?: string;
      avatar?: string;
      color?: string;
      restricted?: boolean;
      maxRating?: string;
      isAdmin?: boolean;
    };

    // ── isAdmin self-promotion guard ─────────────────────────────────────────
    // If the caller is trying to grant admin to any profile (including their
    // own), the currently active profile must itself be an admin.
    //
    // Without this guard a non-admin profile could call:
    //   PATCH /api/profiles/kids  { isAdmin: true }
    // and elevate itself to admin status, bypassing parental controls entirely.
    //
    // The built-in "adult" profile is always admin (enforced in profilesStore),
    // so this guard only matters for custom profiles. The fallback when no
    // hs-profile cookie is present is 'adult', which is always admin — so
    // unauthenticated/cookieless callers are not accidentally blocked.
    if (isAdmin === true) {
      const callerProfileId = getActiveProfileId(req);
      const callerProfile = getProfile(callerProfileId);
      if (!callerProfile?.isAdmin) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only an admin profile can grant admin privileges',
        });
      }
    }

    const updated = updateProfile(id, { name, avatar, color, restricted, maxRating, isAdmin });
    res.json({ profile: toPublic(updated) });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'Failed to update profile', message: msg });
  }
}
