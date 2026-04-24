/**
 * GET /api/jellyfin/Videos/:id/stream
 *
 * Jellyfin-compatible video stream endpoint.
 * TV apps request this URL to play a video directly.
 *
 * Redirects to the HomeStream native stream endpoint so all the
 * range-request, chunk-size, and caching optimisations are reused.
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../../../../libraryStore.js';
import { requireJellyfinAuth } from '../../../../../jellyfinAuth.js';

interface LibraryItem {
  id: string;
  filename?: string;
}

export default function handler(req: Request, res: Response) {
  if (!requireJellyfinAuth(req, res)) return;
  try {
    const { id } = req.params;
    const library = readLibrary<LibraryItem>();
    const item = library.find(i => i.id === id);

    if (!item || !item.filename) {
      return res.status(404).json({ error: 'Item not found or has no file' });
    }

    // Redirect to the native HomeStream stream endpoint
    // This reuses all the range-request and chunk-size optimisations
    res.redirect(302, `/api/stream/${encodeURIComponent(item.filename)}`);
  } catch (err) {
    res.status(500).json({ error: 'Stream redirect failed', message: String(err) });
  }
}
