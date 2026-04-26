/**
 * POST /api/updater/action
 *
 * Triggers an auto-updater action from the React app.
 * Body: { action: 'check' | 'download' | 'install' }
 *
 * The Electron main process listens for these via the updaterBridge and
 * forwards them to electron-updater.  Outside Electron the calls are no-ops.
 *
 * Protected — requires auth so random LAN devices can't trigger installs.
 */
import type { Request, Response } from 'express';
import { triggerUpdaterAction } from '../../../updaterBridge.js';

export default function handler(req: Request, res: Response) {
  const { action } = req.body as { action?: string };
  if (!action || !['check', 'download', 'install'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use check | download | install.' });
  }
  triggerUpdaterAction(action as 'check' | 'download' | 'install');
  res.json({ ok: true, action });
}
