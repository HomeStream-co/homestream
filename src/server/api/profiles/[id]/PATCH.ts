import type { Request, Response } from 'express';
import { updateProfile, toPublic } from '../../../profilesStore.js';

export default function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, avatar, color, restricted } = req.body as {
      name?: string;
      avatar?: string;
      color?: string;
      restricted?: boolean;
    };

    const updated = updateProfile(id, { name, avatar, color, restricted });
    res.json({ profile: toPublic(updated) });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'Failed to update profile', message: msg });
  }
}
