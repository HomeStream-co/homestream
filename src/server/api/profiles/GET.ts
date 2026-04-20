import type { Request, Response } from 'express';
import { readProfiles, toPublic } from '../../profilesStore.js';
import { requireAuth } from '../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const profiles = readProfiles().map(toPublic);
    res.json({ profiles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read profiles', message: String(err) });
  }
}
