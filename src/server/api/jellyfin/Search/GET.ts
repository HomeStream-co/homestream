/**
 * GET /api/jellyfin/Search
 * Jellyfin-compatible search/hints endpoint.
 * Used by Jellyfin clients for quick search suggestions.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary } from '../../../libraryStore.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const query = ((req.query.SearchTerm ?? req.query.searchTerm ?? '') as string).toLowerCase();

  const library = readLibrary<{
    id: string;
    title: string;
    year?: string | number;
    type?: string;
    poster?: string;
  }>();

  const results = query
    ? library.filter(m => m.title.toLowerCase().includes(query))
    : library.slice(0, 20);

  res.json({
    SearchHints: results.map(m => ({
      ItemId: m.id,
      Name: m.title,
      Type: m.type === 'series' ? 'Series' : 'Movie',
      ProductionYear: m.year ? Number(m.year) : undefined,
    })),
    TotalRecordCount: results.length,
  });
}
