/**
 * DELETE /api/stremio/schedule/:id
 *
 * Remove a scheduled download job by ID.
 * Only pending jobs should be cancelled; fired/error jobs are kept for history.
 *
 * Returns: { ok: true } | { ok: false, error: string }
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { removeScheduled } from '../../../../scheduledDownloads.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { id } = req.params as { id: string };
  if (!id) {
    res.status(400).json({ ok: false, error: 'id is required' });
    return;
  }

  const removed = removeScheduled(id);
  if (!removed) {
    res.status(404).json({ ok: false, error: 'Scheduled job not found' });
    return;
  }

  res.json({ ok: true });
}
