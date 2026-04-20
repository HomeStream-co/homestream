/**
 * POST /api/jellyfin/Sessions/Playing
 *
 * Jellyfin-compatible playback reporting endpoint.
 * TV apps call this to report playback start, progress, and stop.
 *
 * Body: {
 *   ItemId: string,
 *   PositionTicks: number,   // 100-nanosecond ticks
 *   IsPaused: boolean,
 *   EventName?: 'timeupdate' | 'pause' | 'unpause' | 'stop'
 * }
 */
import type { Request, Response } from 'express';
import { writeLibrary } from '../../../../libraryStore.js';
import { requireJellyfinAuth } from '../../../../jellyfinAuth.js';

interface PlayingBody {
  ItemId?: string;
  PositionTicks?: number;
  IsPaused?: boolean;
  EventName?: string;
}

// Convert Jellyfin ticks (100ns units) to seconds
function ticksToSeconds(ticks: number): number {
  return Math.floor(ticks / 10_000_000);
}

export default async function handler(req: Request, res: Response) {
  if (!requireJellyfinAuth(req, res)) return;
  try {
    const { ItemId, PositionTicks, EventName } = req.body as PlayingBody;

    if (!ItemId) {
      return res.status(400).json({ error: 'ItemId required' });
    }

    const watchedSeconds = PositionTicks ? ticksToSeconds(PositionTicks) : 0;
    const isStopped = EventName === 'stop';

    await writeLibrary<Record<string, unknown>>(lib => {
      return lib.map(item => {
        if (item.id !== ItemId) return item;

        const totalSeconds = (item.totalSeconds as number) ?? 0;
        const watchProgress = totalSeconds > 0
          ? Math.min(100, Math.round((watchedSeconds / totalSeconds) * 100))
          : 0;

        const updates: Record<string, unknown> = {
          watchedSeconds,
          watchProgress,
          lastWatchedAt: new Date().toISOString(),
        };

        if (isStopped && watchProgress >= 90) {
          updates.watchedAt = new Date().toISOString();
        }

        return { ...item, ...updates };
      });
    });

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to save progress', message: String(err) });
  }
}
