import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { removeFromAllWatchlists } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';
import { dataDir } from '../../../dataDir.js';
import { killTranscode } from '../../../transcodeWorker.js';

const UPLOADS_DIR = path.join(dataDir(), 'uploads');

/**
 * Safely delete a file that belongs to this media item.
 *
 * Accepts either:
 *   - A bare filename (basename only) → resolved inside uploads/
 *   - An absolute path → used directly if it exists
 *
 * In both cases we verify the resolved path exists before unlinking.
 * We do NOT restrict deletion to uploads/ only — items imported via
 * folderWatcher live in the downloads directory and must also be deletable.
 * We DO prevent path traversal by rejecting any path that contains '..'
 * after normalisation.
 */
function safeDelete(fileRef: string): void {
  if (!fileRef) return;

  // Reject path traversal attempts BEFORE normalisation.
  // path.normalize resolves '..' segments so checking the normalised path
  // is insufficient — '/media/../../etc/passwd' normalises to '/etc/passwd'
  // with no '..' remaining. We must check the raw string first.
  if (fileRef.includes('..')) return;

  // Normalise to an absolute path
  const resolved = path.isAbsolute(fileRef)
    ? path.normalize(fileRef)
    : path.resolve(UPLOADS_DIR, path.basename(fileRef));

  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  } catch { /* ignore — file may already be gone */ }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const id = req.params.id as string;
    const data = readLibrary<Record<string, unknown>>();
    const item = data.find((m) => m.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Kill any active transcode process for this media item
    killTranscode(id);

    // Delete the current (possibly transcoded) file.
    // Prefer the absolute filePath stored by the upload/watcher pipeline;
    // fall back to the bare filename for legacy library entries.
    const primaryPath = (item.filePath ?? item.filepath ?? item.filename) as string | undefined;
    if (primaryPath) safeDelete(primaryPath);

    // Also delete the original file if it differs (e.g. transcode was reverted
    // and the original was kept alongside a failed _tc.mp4, or the original
    // was a different extension before remux).
    const originalRef = item.originalFilename as string | undefined;
    if (originalRef && originalRef !== path.basename(primaryPath ?? '')) {
      safeDelete(originalRef);
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
