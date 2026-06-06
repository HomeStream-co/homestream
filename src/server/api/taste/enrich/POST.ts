/**
 * POST /api/taste/enrich
 *
 * Fetch Trakt.tv enrichment data for a batch of library items.
 * Results are cached in media_enrichment for 7 days.
 *
 * Body: { items: LibraryItemForEnrichment[] }
 */
import type { Request, Response } from 'express';
import { enrichLibrary } from '../../../traktClient.js';
import type { LibraryItemForEnrichment } from '../../../traktClient.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { items } = req.body as { items: LibraryItemForEnrichment[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    // Cap at 50 items per request to avoid long-running calls
    const batch = items.slice(0, 50);
    const results = await enrichLibrary(batch);

    // Convert Map to plain object for JSON serialisation
    const out: Record<string, unknown> = {};
    for (const [id, enrichment] of results.entries()) {
      out[id] = enrichment;
    }

    res.json({ enrichment: out, count: results.size });
  } catch (error) {
    console.error('[taste/enrich] POST error:', error);
    res.status(500).json({ error: 'Enrichment failed', message: String(error) });
  }
}
