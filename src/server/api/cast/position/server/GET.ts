/**
 * GET /api/cast/position/server
 *
 * Returns the latest DLNA playback position from the server-side polling loop
 * started by POST /api/cast/send.
 *
 * Unlike GET /api/cast/position (which polls the TV on every request), this
 * endpoint reads from in-memory state updated every 5 s by the server.
 * Safe to call frequently from any client without hammering the TV.
 *
 * Returns:
 *   { ok: true,  mediaId, currentTime, duration, updatedAt }
 *   { ok: false, error: 'No active DLNA cast' }
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { getPosition } from '../../../../dlnaPositionTracker.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const pos = getPosition();
  if (!pos) {
    res.json({ ok: false, error: 'No active DLNA cast' });
    return;
  }

  res.json({
    ok: true,
    mediaId:     pos.mediaId,
    currentTime: pos.currentTime,
    duration:    pos.duration,
    updatedAt:   pos.updatedAt,
  });
}
