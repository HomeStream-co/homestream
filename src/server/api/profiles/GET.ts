import type { Request, Response } from 'express';
import { readProfiles, toPublic } from '../../profilesStore.js';

export default function handler(_req: Request, res: Response) {
  try {
    const profiles = readProfiles().map(toPublic);
    res.json({ profiles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read profiles', message: String(err) });
  }
}
