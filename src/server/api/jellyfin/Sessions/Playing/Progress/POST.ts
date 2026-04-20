/**
 * POST /api/jellyfin/Sessions/Playing/Progress
 *
 * Jellyfin playback progress report — called by TV apps every ~10s during
 * playback to report current position. We persist this to the library so
 * HomeStream's "Continue Watching" rail stays in sync.
 */
import type { Request, Response } from 'express';
import { readLibrary, writeLibraryDirect } from '../../../../../libraryStore.js';

interface LibraryItem {
  id: string;
  watchProgress?: number;
  watchedSeconds?: number;
  runtime?: number;
  profileProgress?: Record<string, { progress: number; watchedSeconds: number; updatedAt: string }>;
}

interface ProgressBody {
  ItemId?: string;
  PositionTicks?: number;  // 100-nanosecond ticks
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number;
  PlayMethod?: string;
  MediaSourceId?: string;
}

export default function handler(req: Request, res: Response) {
  try {
    const body = req.body as ProgressBody;
    const itemId = body.ItemId;
    const ticks = body.PositionTicks ?? 0;

    if (!itemId) return res.status(204).send();

    // Convert ticks → seconds (1 tick = 100ns → 10,000,000 ticks/sec)
    const watchedSeconds = Math.floor(ticks / 10_000_000);

    const library = readLibrary<LibraryItem>();
    const idx = library.findIndex(i => i.id === itemId);
    if (idx === -1) return res.status(204).send();

    const item = library[idx];
    const runtime = item.runtime ?? 0; // minutes
    const totalSeconds = runtime * 60;
    const progress = totalSeconds > 0 ? Math.min(100, Math.round((watchedSeconds / totalSeconds) * 100)) : 0;

    library[idx] = {
      ...item,
      watchedSeconds,
      watchProgress: progress,
    };

    writeLibraryDirect(library);
    res.status(204).send();
  } catch (err) {
    console.error('[Jellyfin] Progress error:', err);
    res.status(204).send(); // Always 204 — clients don't retry on error
  }
}
