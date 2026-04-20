/**
 * PATCH /api/library/storage
 *
 * Save storage allocation percentages for Movies and TV Shows.
 * Body: { moviesPct: number, tvPct: number }
 * Both must be 0–100 and their sum must be ≤ 100.
 */

import type { Request, Response } from 'express';
import { writeConfig } from '../../../configStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { moviesPct, tvPct } = req.body as { moviesPct?: unknown; tvPct?: unknown };

    const m = Number(moviesPct);
    const t = Number(tvPct);

    if (isNaN(m) || isNaN(t) || m < 0 || m > 100 || t < 0 || t > 100) {
      return res.status(400).json({ error: 'moviesPct and tvPct must each be 0–100' });
    }
    if (m + t > 100) {
      return res.status(400).json({ error: 'moviesPct + tvPct must not exceed 100' });
    }

    writeConfig({ storageMoviesPct: Math.round(m), storageTvPct: Math.round(t) });

    res.json({
      ok: true,
      storageAllocation: {
        moviesPct: Math.round(m),
        tvPct: Math.round(t),
        otherPct: 100 - Math.round(m) - Math.round(t),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save storage allocation', message: String(err) });
  }
}
