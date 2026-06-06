/**
 * GET /api/stremio/schedule
 *
 * Returns all scheduled download jobs (pending, fired, error).
 * Sorted by scheduledFor ascending so the soonest job is first.
 *
 * Returns: ScheduledJob[]
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { listScheduled } from '../../../scheduledDownloads.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const jobs = listScheduled().sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
  res.json(jobs);
}
