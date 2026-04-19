/**
 * GET /api/media/:id/tracks
 *
 * Returns all audio and subtitle tracks for a media file.
 * Uses the probe cache so repeated calls are instant (no repeated ffprobe).
 */
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { probeFile } from '../../../../probeCache.js';

const UPLOADS_DIR = path.resolve('./uploads');

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const libPath = path.resolve('./media-library.json');
    if (!fs.existsSync(libPath)) {
      return res.json({ audio: [], subtitles: [] });
    }

    const library = JSON.parse(fs.readFileSync(libPath, 'utf8')) as Array<{
      id: string; filename?: string; filePath?: string;
    }>;

    const item = library.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    const filename = item.filename ?? path.basename(item.filePath ?? '');
    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.json({ audio: [], subtitles: [] });
    }

    const probe = await probeFile(filePath);

    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ audio: probe.audioTracks, subtitles: probe.subtitleTracks });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
