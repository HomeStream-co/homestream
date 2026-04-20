/**
 * POST /api/profiles/:id/verify-pin
 *
 * Convenience alias used by PinLock.tsx and ProfileContext.tsx.
 * Delegates to the unified /api/profiles/:id/pin endpoint with action=verify.
 *
 * Body: { pin: string }
 * Response: { valid: boolean }
 */
import type { Request, Response } from 'express';
import { verifyPin } from '../../../../../profilesStore.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { pin } = req.body as { pin?: string };

    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }

    const valid = await verifyPin(id, pin);
    return res.json({ valid });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'PIN verification failed', message: msg });
  }
}
