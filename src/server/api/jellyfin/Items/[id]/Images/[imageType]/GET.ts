/**
 * GET /api/jellyfin/Items/:id/Images/:imageType
 *
 * Jellyfin-compatible image proxy endpoint.
 * TV apps request poster/backdrop images via this route.
 * We redirect to the actual poster URL stored in the library item.
 *
 * imageType: Primary (poster) | Backdrop | Thumb | Logo
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../../../../../libraryStore.js';

interface LibraryItem {
  id: string;
  poster?: string;
  backdrop?: string;
}

// 1×1 transparent PNG — returned when no image is available
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export default function handler(req: Request, res: Response) {
  try {
    const { id, imageType } = req.params;
    const library = readLibrary<LibraryItem>();
    const item = library.find(i => i.id === id);

    if (!item) {
      res.set('Content-Type', 'image/png');
      return res.send(TRANSPARENT_PNG);
    }

    const isBackdrop = imageType?.toLowerCase() === 'backdrop';
    const imageUrl = isBackdrop ? (item.backdrop ?? item.poster) : (item.poster ?? item.backdrop);

    if (!imageUrl) {
      res.set('Content-Type', 'image/png');
      return res.send(TRANSPARENT_PNG);
    }

    // Redirect to the actual image URL
    res.redirect(302, imageUrl);
  } catch (err) {
    res.status(500).json({ error: 'Image fetch failed', message: String(err) });
  }
}
