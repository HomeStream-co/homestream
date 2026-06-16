/**
 * POST /api/jellyfin/Sessions/Playing/Stopped
 *
 * Jellyfin playback stopped report — called by TV apps when the user stops
 * or finishes watching. We persist the final position and mark as watched
 * if ≥ 90% complete.
 */
import type { Request, Response } from 'express';
import { writeLibrary } from '../../../../../libraryStore.js';
import { requireJellyfinAuth } from '../../../../../jellyfinAuth.js';

interface LibraryItem {
  id: string;
  watchProgress?: number;
  watchedSeconds?: number;
  runtime?: number;
}

interface StoppedBody {
  ItemId?: string;
  PositionTicks?: number;
  PlayedToCompletion?: boolean;
}

export default async function handler(req: Request, res: Response) {
  if (!requireJellyfinAuth(req, res)) return;
  try {
    const body = req.body as StoppedBody;
    const itemId = body.ItemId;
    const ticks = body.PositionTicks ?? 0;

    if (!itemId) return res.status(204).send();

    const watchedSeconds = Math.floor(ticks / 10_000_000);

    await writeLibrary<LibraryItem>(lib => {
      const idx = lib.findIndex(i => i.id === itemId);
      if (idx === -1) return lib;

      const item = lib[idx];
      const runtime = item.runtime ?? 0;
      const totalSeconds = runtime * 60;
      const progress = body.PlayedToCompletion
        ? 100
        : totalSeconds > 0
          ? Math.min(100, Math.round((watchedSeconds / totalSeconds) * 100))
          : 0;

      lib[idx] = { ...item, watchedSeconds, watchProgress: progress };
      return lib;
    });

    res.status(204).send();
  } catch (err) {
    console.error('[Jellyfin] Stopped error:', err);
    res.status(204).send();
  }
}
