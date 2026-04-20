import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { removeFromAllWatchlists } from '../../../watchlistStore.js';

const UPLOADS_DIR  = path.resolve('./uploads');

/** Safely delete a file in the uploads directory. Ignores missing files. */
function safeDelete(filename: string) {
  if (!filename) return;
  // Only allow deleting files inside the uploads directory (prevent path traversal)
  const resolved = path.resolve(UPLOADS_DIR, path.basename(filename));
  if (!resolved.startsWith(UPLOADS_DIR)) return;
  try { if (fs.existsSync(resolved)) fs.unlinkSync(resolved); } catch { /* ignore */ }
}

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = readLibrary<Record<string, unknown>>();
    const item = data.find((m) => m.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Delete the transcoded/current file
    safeDelete(item.filename as string);

    // Also delete the original file if it differs (e.g. transcode was reverted
    // and the original was kept alongside a failed _tc.mp4, or the original
    // was a different extension before remux).
    if (item.originalFilename && item.originalFilename !== item.filename) {
      safeDelete(item.originalFilename as string);
    }

    // Remove from library (serialised through write queue)
    await writeLibrary(lib => lib.filter(m => m.id !== id));
    // Remove from all profiles' watchlists
    await removeFromAllWatchlists(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media', message: String(error) });
  }
}
