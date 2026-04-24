/**
 * POST /api/stremio/schedule
 *
 * Add a new scheduled download job.
 *
 * Body:
 *   title        string  — human-readable name
 *   imdbId       string  — tt-prefixed IMDB ID
 *   type         'movie' | 'series'
 *   scheduledFor string  — ISO timestamp (must be in the future)
 *   season?      number
 *   episode?     number
 *   poster?      string
 *   year?        string
 *   streams?     unknown[] — pre-selected streams from StremioPanel
 *
 * Returns: { ok: true, job: ScheduledJob } | { ok: false, error: string }
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { addScheduled } from '../../../scheduledDownloads.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { title, imdbId, type, scheduledFor, season, episode, poster, year, streams } =
    req.body as {
      title?: string;
      imdbId?: string;
      type?: string;
      scheduledFor?: string;
      season?: number;
      episode?: number;
      poster?: string;
      year?: string;
      streams?: unknown[];
    };

  if (!title || !imdbId || !scheduledFor) {
    res.status(400).json({ ok: false, error: 'title, imdbId, and scheduledFor are required' });
    return;
  }
  if (type !== 'movie' && type !== 'series') {
    res.status(400).json({ ok: false, error: 'type must be "movie" or "series"' });
    return;
  }
  if (new Date(scheduledFor).getTime() <= Date.now()) {
    res.status(400).json({ ok: false, error: 'scheduledFor must be in the future' });
    return;
  }

  const job = addScheduled({ title, imdbId, type, scheduledFor, season, episode, poster, year, streams });
  res.json({ ok: true, job });
}
