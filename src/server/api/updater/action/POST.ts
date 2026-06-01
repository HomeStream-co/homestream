/**
 * POST /api/updater/action
 *
 * Queues an auto-updater action from the React app.
 * Body: { action: 'check' | 'download' | 'install' }
 *
 * The Electron main process polls GET /api/updater/drain every 5 s and
 * executes any queued actions.  Outside Electron the queue is never drained
 * (no-op).
 *
 * Protected — requires auth so random LAN devices can't trigger installs.
 */
import type { Request, Response } from 'express';
import { enqueueUpdaterAction } from '../../../updaterBridge.js';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { action } = req.body as { action?: string };
  if (!action || !['check', 'download', 'install'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use check | download | install.' });
  }
  enqueueUpdaterAction(action as 'check' | 'download' | 'install');
  res.json({ ok: true, action });
}
