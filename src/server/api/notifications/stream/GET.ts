/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time app notifications.
 * The client subscribes with EventSource and receives JSON notification
 * objects whenever the server broadcasts (e.g. new episode queued).
 *
 * Auth: same open-mode / session-cookie logic as other protected routes.
 * Unauthenticated requests receive 401 and are closed immediately.
 *
 * Keep-alive: sends a comment ping every 30 s to prevent proxy timeouts.
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { registerClient, unregisterClient } from '../../../notificationBroadcaster.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send an initial comment so the client knows the connection is live
  res.write(': connected\n\n');

  registerClient(res);

  // Keep-alive ping every 30 s
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 30_000);

  const cleanup = () => {
    clearInterval(ping);
    unregisterClient(res);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}
