/**
 * GET /api/encoder/status
 *
 * Returns the detected hardware encoder status so the Settings panel
 * can display which GPU encoder is active (or that software encoding is used).
 *
 * Query params:
 *   ?refresh=1  — force a fresh probe (bypasses cache)
 *
 * Response:
 *   { encoder: string | null, label: string, detected: boolean }
 *
 * The detection runs once on server startup and is cached.
 * Pass ?refresh=1 to re-probe (useful after driver install).
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { detectHwEncoder } from '../../../hwEncoderDetect.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  try {
    const forceRefresh = req.query.refresh === '1';
    const result = await detectHwEncoder(forceRefresh);
    res.json({
      encoder: result.encoder,
      label: result.label,
      detected: result.encoder !== null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Encoder detection failed', message: String(err) });
  }
}
