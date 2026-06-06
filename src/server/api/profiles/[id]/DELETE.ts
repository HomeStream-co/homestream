import type { Request, Response } from 'express';
import { deleteProfile } from '../../../profilesStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const id = req.params.id as string;
    deleteProfile(id);
    res.json({ ok: true });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    if (msg.includes('Built-in')) return res.status(403).json({ error: msg });
    res.status(500).json({ error: 'Failed to delete profile', message: msg });
  }
}
