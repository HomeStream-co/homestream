/**
 * GET /api/jellyfin/Videos
 * Jellyfin-compatible videos endpoint.
 * Returns video items from the library in Jellyfin API format.
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
    filePath?: string;
    filepath?: string;
    runtime?: number;
    plot?: string;
  }>();

  const videos = library.filter(m => !m.type || m.type === 'movie' || m.type === 'video');

  res.json({
    Items: videos.map(m => ({
      Name: m.title,
      Id: m.id,
      Type: 'Movie',
      ProductionYear: m.year ? Number(m.year) : undefined,
      Overview: m.plot,
      RunTimeTicks: m.runtime ? m.runtime * 600000000 : undefined,
      MediaSources: [
        {
          Id: m.id,
          Path: m.filePath ?? m.filepath ?? '',
          Protocol: 'File',
          Type: 'Default',
        },
      ],
    })),
    TotalRecordCount: videos.length,
    StartIndex: 0,
  });
}
