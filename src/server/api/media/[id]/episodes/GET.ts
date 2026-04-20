import type { Request, Response } from 'express';
import { readLibrary } from '../../../../libraryStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const library = readLibrary<{ id: string; type: string; episodes?: unknown[] }>();
    const item = library.find(m => m.id === id);

    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    if (item.type !== 'series') {
      return res.status(400).json({ error: 'Item is not a TV series' });
    }

    return res.json(item.episodes || []);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch episodes', message: String(error) });
  }
}
