/**
 * GET /api/media/:id/tracks
 *
 * Returns all audio and subtitle tracks for a media file.
 * Uses the probe cache so repeated calls are instant (no repeated ffprobe).
 *
 * File resolution order (mirrors stream endpoint):
 *  1. item.filePath (absolute path — handles downloads folder, custom dirs)
 *  2. uploads/<filename> (legacy upload path)
 */
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { probeFile } from '../../../../probeCache.js';
import { requireAuth } from '../../../../authMiddleware.js';

const UPLOADS_DIR = path.resolve('./uploads');

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;

    const libPath = path.resolve('./media-library.json');
    if (!fs.existsSync(libPath)) {
      return res.json({ audio: [], subtitles: [] });
    }

    type LibEntry = { id: string; filename?: string; filePath?: string; filepath?: string };
    const library = JSON.parse(fs.readFileSync(libPath, 'utf8')) as LibEntry[];

    const item = library.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    // Resolve file path — prefer stored absolute path, fall back to uploads/
    let resolvedPath: string | null = null;

    const storedPath = item.filePath ?? item.filepath;
    if (storedPath && fs.existsSync(storedPath)) {
      resolvedPath = storedPath;
    } else {
      const filename = item.filename ?? path.basename(storedPath ?? '');
      if (filename) {
        const uploadsPath = path.join(UPLOADS_DIR, filename);
        if (fs.existsSync(uploadsPath)) resolvedPath = uploadsPath;
      }
    }

    if (!resolvedPath) {
      return res.json({ audio: [], subtitles: [] });
    }

    const probe = await probeFile(resolvedPath);

    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ audio: probe.audioTracks, subtitles: probe.subtitleTracks });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
