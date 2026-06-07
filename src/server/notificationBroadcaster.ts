/**
 * notificationBroadcaster — server-side event bus for app notifications.
 *
 * Any server module (episodeScheduler, postDownloadPipeline, etc.) can call
 * `broadcastNotification()` to push a notification to all connected browser
 * clients via Server-Sent Events (SSE).
 *
 * The client subscribes to GET /api/notifications/stream and receives events
 * in the shape the client-side notificationStore expects.
 *
 * SSE is used instead of WebSocket because:
 *   - Notifications are server → client only (no client → server needed)
 *   - SSE works through HTTP/1.1 proxies without upgrade negotiation
 *   - Built-in reconnect via EventSource
 */

import type { Response } from 'express';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServerNotification {
  type:
    | 'download_complete'
    | 'download_error'
    | 'download_started'
    | 'library_added'
    | 'new_episode_queued'
    | 'info'
    | 'warning'
    | 'error';
  title: string;
  message?: string;
  mediaId?: string;
  poster?: string;
}

// ── Client registry ───────────────────────────────────────────────────────────

const _clients = new Set<Response>();

export function registerClient(res: Response): void {
  _clients.add(res);
}

export function unregisterClient(res: Response): void {
  _clients.delete(res);
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function broadcastNotification(notif: ServerNotification): void {
  if (_clients.size === 0) return;

  const payload = JSON.stringify({
    ...notif,
    id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  });

  const dead: Response[] = [];
  for (const res of _clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) _clients.delete(res);
}
