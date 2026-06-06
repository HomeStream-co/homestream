/**
 * GET /api/jellyfin/Sessions
 * Jellyfin-compatible sessions endpoint.
 * Returns active playback sessions in Jellyfin API format.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  // HomeStream does not expose multi-session data externally;
  // return an empty sessions array so Jellyfin clients don't error.
  res.json([]);
}
