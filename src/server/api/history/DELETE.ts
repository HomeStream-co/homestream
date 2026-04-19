/**
 * DELETE /api/history
 *
 * Clears watch history for one or all items.
 * Body: { id?: string }  — omit id to clear all history
 */
import type { Request, Response } from 'express';
import { writeLibrary } from '../../libraryStore.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.body as { id?: string };

    await writeLibrary<Record<string, unknown>>(lib => {
      return lib.map(item => {
        if (id && item.id !== id) return item;
        // Strip all watch-tracking fields
        const { lastWatchedAt: _l, watchedAt: _w, watchProgress: _p, watchedSeconds: _s, ...rest } = item as Record<string, unknown>;
        void _l; void _w; void _p; void _s;
        return rest;
      });
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history', message: String(err) });
  }
}
