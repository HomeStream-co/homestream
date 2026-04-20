/**
 * POST /api/profiles/:id/pin
 *
 * Body actions:
 *   { action: 'set',    pin: '1234' }  — hash and store a new PIN
 *   { action: 'verify', pin: '1234' }  — check PIN, returns { valid: boolean }
 *   { action: 'clear',  pin: '1234' }  — verify current PIN then remove it
 */
import type { Request, Response } from 'express';
import { setPin, verifyPin, clearPin, hasPin } from '../../../../profilesStore.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { action, pin } = req.body as { action?: string; pin?: string };

    if (!action) return res.status(400).json({ error: 'action is required' });

    if (action === 'set') {
      if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be 4–8 digits' });
      }
      await setPin(id, pin);
      return res.json({ ok: true });
    }

    if (action === 'verify') {
      if (!pin) return res.status(400).json({ error: 'pin is required' });
      const valid = await verifyPin(id, pin);
      return res.json({ valid });
    }

    if (action === 'clear') {
      if (hasPin(id)) {
        if (!pin) return res.status(400).json({ error: 'Current PIN required to clear' });
        const valid = await verifyPin(id, pin);
        if (!valid) return res.status(403).json({ error: 'Incorrect PIN' });
      }
      clearPin(id);
      return res.json({ ok: true });
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'PIN operation failed', message: msg });
  }
}
