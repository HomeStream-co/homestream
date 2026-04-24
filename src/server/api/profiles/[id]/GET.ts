import type { Request, Response } from 'express';
import { getProfile, toPublic } from '../../../profilesStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const profile = getProfile(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: toPublic(profile) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read profile', message: String(err) });
  }
}
