/**
 * POST /api/profiles/:id/pin
 *
 * Body actions:
 *   { action: 'set',    pin: '1234' }  — hash and store a new PIN
 *   { action: 'verify', pin: '1234' }  — check PIN, returns { valid: boolean }
 *   { action: 'clear',  pin: '1234' }  — verify current PIN then remove it
 *
 * Rate limiting on 'verify': max 10 attempts per IP per 15 minutes.
 * After 3 failures, responses are delayed 1.5s to slow brute-force.
 */
import type { Request, Response } from 'express';
import { setPin, verifyPin, clearPin, hasPin } from '../../../../profilesStore.js';
import { checkRateLimit, recordFailure, getFailureDelay } from '../../../../rateLimiter.js';

const RATE_NS = 'pin-verify';
const RATE_OPTS = { maxAttempts: 10, windowMs: 15 * 60 * 1000 };
const DELAY_OPTS = { delayAfter: 3, delayMs: 1500 };

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export default async function handler(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
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

      // Rate limit
      const ip = getClientIp(req);
      const rateCheck = checkRateLimit(RATE_NS, ip, RATE_OPTS);
      if (!rateCheck.allowed) {
        res.set('Retry-After', String(rateCheck.retryAfterSecs ?? 60));
        return res.status(429).json({
          error: 'Too many PIN attempts. Please wait before trying again.',
          retryAfterSecs: rateCheck.retryAfterSecs,
        });
      }

      const valid = await verifyPin(id, pin);

      if (!valid) {
        recordFailure(RATE_NS, ip);
        const delay = getFailureDelay(RATE_NS, ip, DELAY_OPTS);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
      }

      return res.json({ valid });
    }

    if (action === 'clear') {
      if (hasPin(id)) {
        if (!pin) return res.status(400).json({ error: 'Current PIN required to clear' });

        // Rate limit clear attempts too (same namespace)
        const ip = getClientIp(req);
        const rateCheck = checkRateLimit(RATE_NS, ip, RATE_OPTS);
        if (!rateCheck.allowed) {
          res.set('Retry-After', String(rateCheck.retryAfterSecs ?? 60));
          return res.status(429).json({
            error: 'Too many PIN attempts. Please wait before trying again.',
            retryAfterSecs: rateCheck.retryAfterSecs,
          });
        }

        const valid = await verifyPin(id, pin);
        if (!valid) {
          recordFailure(RATE_NS, getClientIp(req));
          return res.status(403).json({ error: 'Incorrect PIN' });
        }
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
