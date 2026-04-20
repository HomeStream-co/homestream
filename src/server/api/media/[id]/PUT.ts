import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;
    const data = readLibrary<Record<string, unknown>>();
    const idx = data.findIndex((m) => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Media item not found' });
    }
    const updated = { ...data[idx], ...updates, id };
    await writeLibrary(lib => {
      const i = lib.findIndex(m => m.id === id);
      if (i !== -1) lib[i] = updated;
      return lib;
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update media', message: String(error) });
  }
}
