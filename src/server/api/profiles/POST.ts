import type { Request, Response } from 'express';
import { createProfile, toPublic } from '../../profilesStore.js';
import { requireAuth } from '../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { name, avatar, color, restricted, isAdmin } = req.body as {
      name?: string;
      avatar?: string;
      color?: string;
      restricted?: boolean;
      isAdmin?: boolean;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const profile = createProfile({
      name: name.trim(),
      avatar: avatar ?? '🎭',
      color: color ?? 'ring-primary',
      restricted: restricted ?? false,
      isAdmin: isAdmin ?? false,
    });

    res.status(201).json({ profile: toPublic(profile) });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('Maximum')) return res.status(400).json({ error: msg });
    res.status(500).json({ error: 'Failed to create profile', message: msg });
  }
}
