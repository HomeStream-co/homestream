/**
 * POST /api/library/optimize
 *
 * Scans the entire library and runs enrichment + poster download for items
 * that need it.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary } from '../../../libraryStore.js';
import { runEnrichmentInBackground } from '../../../mediaUtils.js';

export const middleware = [requireAuth];

export default async function handler(req: Request, res: Response) {
  try {
    const library = readLibrary<any>();
    
    // Fire off enrichment for all items
    for (const item of library) {
      if (!item.transcoding) {
        runEnrichmentInBackground(item.id);
      }
    }

    res.json({ success: true, message: 'Optimization started' });
  } catch (err) {
    console.error('[optimize] Error:', err);
    res.status(500).json({ error: 'Failed to start optimization' });
  }
}
