/**
 * POST /api/demo/seed
 *
 * Seeds the library with all demo media items (Blender CC-licensed films).
 * Safe to call multiple times — already-seeded items are skipped.
 *
 * Returns { ok: true, seeded: number, skipped: number }
 */
import type { Request, Response } from 'express';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { ALL_DEMO_ITEMS } from '../../../demoLibrary.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const library = readLibrary<Record<string, unknown>>();
    const existingIds = new Set(library.map(m => m.id as string));
    const toAdd = ALL_DEMO_ITEMS.filter(d => !existingIds.has(d.id));
    const skipped = ALL_DEMO_ITEMS.length - toAdd.length;

    if (toAdd.length > 0) {
      await writeLibrary(lib => {
        lib.unshift(...(toAdd as unknown as Record<string, unknown>[]));
        return lib;
      });
    }

    res.json({ ok: true, seeded: toAdd.length, skipped, total: ALL_DEMO_ITEMS.length });
  } catch (err) {
    res.status(500).json({ error: 'Seed failed', message: String(err) });
  }
}
