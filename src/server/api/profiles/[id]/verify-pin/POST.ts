/**
 * POST /api/profiles/:id/verify-pin
 *
 * Convenience alias used by PinLock.tsx and ProfileContext.tsx.
 * Delegates to the unified /api/profiles/:id/pin endpoint with action=verify.
 * Rate limiting is applied here too (same namespace as /pin).
 *
 * Body: { pin: string }
 * Response: { valid: boolean }
 */
import type { Request, Response } from 'express';
import { verifyPin } from '../../../../profilesStore.js';
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
    const { id } = req.params;
    const { pin } = req.body as { pin?: string };

    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }

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
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: 'PIN verification failed', message: msg });
  }
}
