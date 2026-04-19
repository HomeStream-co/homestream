import type { Request, Response } from 'express';
import { writeLibrary } from '../../../../libraryStore.js';

/**
 * PATCH /api/media/:id/progress
 *
 * Persists watch progress to media-library.json so it survives server restarts,
 * device switches, and browser refreshes.
 *
 * Body:
 *   progress      — 0–100 percentage watched
 *   currentTime   — raw seconds (optional, stored for precision resume)
 *   duration      — total seconds (optional)
 *
 * Side-effects:
 *   - Sets lastWatchedAt to now (ISO string) for "Continue Watching" ordering
 *   - If progress >= 95, marks watchProgress = 0 (completed — remove from CW row)
 *     and sets watchedAt = now
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { progress, currentTime, duration } = req.body as {
      progress?: number;
      currentTime?: number;
      duration?: number;
    };

    if (progress === undefined || typeof progress !== 'number') {
      return res.status(400).json({ error: 'progress (number) is required' });
    }

    const now = new Date().toISOString();
    const isComplete = progress >= 95;

    let updated: Record<string, unknown> | null = null;

    await writeLibrary<Record<string, unknown>>(lib => {
      const idx = lib.findIndex(m => m.id === id);
      if (idx === -1) return lib;

      const item = lib[idx];
      updated = {
        ...item,
        // If complete, reset to 0 so it drops off the Continue Watching row
        watchProgress: isComplete ? 0 : progress,
        lastWatchedAt: now,
        // Store raw seconds for sub-second precision resume
        ...(currentTime !== undefined && { watchedSeconds: isComplete ? 0 : currentTime }),
        ...(duration !== undefined && { totalSeconds: duration }),
        // Mark fully watched
        ...(isComplete && { watchedAt: now }),
      };
      lib[idx] = updated!;
      return lib;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update progress', message: String(error) });
  }
}
