/**
 * GET /api/jellyfin/Search/Hints
 *
 * Jellyfin search hints endpoint — used by TV apps for type-ahead search.
 * Returns lightweight hint objects (no full metadata).
 *
 * Query params:
 *   searchTerm  — required search string
 *   limit       — max results (default 20)
 *   includeItemTypes — comma-separated: Movie,Series
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../../../libraryStore.js';

interface LibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  year?: string;
  poster?: string;
  genre?: string[];
}

export default function handler(req: Request, res: Response) {
  try {
    const {
      searchTerm = '',
      limit = '20',
      includeItemTypes = '',
    } = req.query as Record<string, string>;

    if (!searchTerm.trim()) {
      return res.json({ SearchHints: [], TotalRecordCount: 0 });
    }

    const library = readLibrary<LibraryItem>();
    const q = searchTerm.toLowerCase();
    const maxResults = Math.min(parseInt(limit) || 20, 100);

    let items = library.filter(item =>
      item.title.toLowerCase().includes(q) ||
      (item.genre ?? []).some(g => g.toLowerCase().includes(q))
    );

    if (includeItemTypes) {
      const types = includeItemTypes.split(',').map(t => t.trim().toLowerCase());
      items = items.filter(item => {
        if (types.includes('movie'))  return item.type === 'movie';
        if (types.includes('series')) return item.type === 'series';
        return true;
      });
    }

    const hints = items.slice(0, maxResults).map(item => ({
      ItemId: item.id,
      Id: item.id,
      Name: item.title,
      Type: item.type === 'movie' ? 'Movie' : 'Series',
      MediaType: 'Video',
      ProductionYear: item.year ? parseInt(item.year) : undefined,
      PrimaryImageTag: item.poster ? 'poster' : undefined,
      ThumbImageTag: item.poster ? 'poster' : undefined,
      // Direct image URL for clients that construct their own image URLs
      PrimaryImageUrl: item.poster ?? undefined,
    }));

    res.json({
      SearchHints: hints,
      TotalRecordCount: hints.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: String(err) });
  }
}
