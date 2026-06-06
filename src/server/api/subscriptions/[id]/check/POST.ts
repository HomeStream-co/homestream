/**
 * POST /api/subscriptions/:id/check
 * Manually trigger an immediate episode check for a subscribed show.
 * Useful for "Check now" button in the UI.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { checkNow } from '../../../../episodeScheduler.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { id } = req.params;
    const result = await checkNow(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Check failed', message: String(err) });
  }
}
