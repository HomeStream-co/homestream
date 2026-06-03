import type { Request, Response } from 'express';
import { updateProfile, toPublic } from '../../../profilesStore.js';
import { requireAuth } from '../../../authMiddleware.js';

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

    // NOTE: isAdmin changes are accepted from any authenticated session.
    // The primary defence is the admin password (requireAuth above) — only
    // users who know the admin password can reach this endpoint. The profile
    // cookie is a UI-level concept, not a security boundary. profilesStore
    // already protects the built-in adult profile's isAdmin flag from being
    // cleared (see updateProfile in profilesStore.ts).

    const updated = updateProfile(id, { name, avatar, color, restricted, maxRating, isAdmin });
    res.json({ profile: toPublic(updated) });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'Failed to update profile', message: msg });
  }
}
