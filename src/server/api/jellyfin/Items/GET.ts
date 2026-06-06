/**
 * GET /api/jellyfin/Items
 * Jellyfin-compatible items endpoint. Returns library items in Jellyfin API format
 * so Jellyfin-aware clients (Infuse, Swiftfin, etc.) can browse the HomeStream library.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary } from '../../../libraryStore.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const library = readLibrary<{
    id: string;
    title: string;
    year?: string | number;
    type?: string;
    poster?: string;
    backdrop?: string;
    plot?: string;
    genre?: string[];
    imdbRating?: string | number;
    runtime?: number;
  }>();

  const startIndex = parseInt((req.query.StartIndex as string) ?? '0', 10);
  const limit = parseInt((req.query.Limit as string) ?? '100', 10);
  const includeItemTypes = req.query.IncludeItemTypes as string | undefined;

  let items = library;

  if (includeItemTypes) {
    const types = includeItemTypes.toLowerCase().split(',');
    items = items.filter(m => {
      const t = (m.type ?? 'movie').toLowerCase();
      return types.some(type => t.includes(type) || type.includes(t));
    });
  }

  const total = items.length;
  const page = items.slice(startIndex, startIndex + limit);

  const jellyfinItems = page.map(m => ({
    Name: m.title,
    Id: m.id,
    Type: m.type === 'series' ? 'Series' : 'Movie',
    ProductionYear: m.year ? Number(m.year) : undefined,
    Overview: m.plot,
    Genres: m.genre ?? [],
    CommunityRating: m.imdbRating ? Number(m.imdbRating) : undefined,
    RunTimeTicks: m.runtime ? m.runtime * 600000000 : undefined,
    ImageTags: m.poster ? { Primary: m.id } : {},
  }));

  res.json({
    Items: jellyfinItems,
    TotalRecordCount: total,
    StartIndex: startIndex,
  });
}
