/**
 * GET /api/updater/drain
 *
 * Returns and clears all pending updater actions queued by the React app.
 * Called by the Electron main process every 5 seconds.
 *
 * Response: { actions: Array<'check' | 'download' | 'install'> }
 *
 * Restricted to loopback — only the local Electron process should call this.
 */
import type { Request, Response } from 'express';
import { drainUpdaterActions } from '../../../updaterBridge.js';

function isLoopback(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.')
  );
}

export default function handler(req: Request, res: Response) {
  const remoteIp = req.socket.remoteAddress ?? '';
  if (!isLoopback(remoteIp)) {
    return res.status(403).json({ error: 'Loopback only' });
  }
  res.json({ actions: drainUpdaterActions() });
}
