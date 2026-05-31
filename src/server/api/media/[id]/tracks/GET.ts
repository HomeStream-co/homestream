import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { probeFile } from '../../../../probeCache.js';
import { requireAuth } from '../../../../authMiddleware.js';
import { readLibrary } from '../../../../libraryStore.js';
import { dataDir } from '../../../../dataDir.js';

const UPLOADS_DIR = path.join(dataDir(), 'uploads');

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { id } = req.params;

    type LibEntry = { id: string; filename?: string; filePath?: string; filepath?: string };
    const library = readLibrary<LibEntry>();

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
