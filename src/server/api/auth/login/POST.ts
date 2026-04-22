/**
 * POST /api/auth/login
 *
 * Validates the admin password and returns a session token stored in an
 * httpOnly cookie.  Sessions are persisted to homestream-sessions.json so
 * they survive server restarts — users stay logged in across reboots.
 *
 * Passwords are stored as bcrypt hashes. Plain-text passwords in existing
 * configs are accepted on first login and then automatically re-hashed.
 *
 * Rate limiting: max 10 attempts per IP per 15 minutes.
 * After 5 failures, responses are delayed by 2s to slow brute-force.
 *
 * Body: { password: string }
 * Response: { ok: true } | { error: string }
 */
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { readConfig, writeConfig } from '../../../configStore.js';
import {
  createSession,
  isValidSession,
  clearAllSessions,
  getSessionCount,
  SESSION_TTL_MS,
} from '../../../sessionStore.js';

// Re-export for authMiddleware backwards compat
export { isValidSession, clearAllSessions, getSessionCount };

// ── Rate limiter ──────────────────────────────────────────────────────────────
interface RateBucket {
  attempts: number;
  windowStart: number;
  failures: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 10;                  // per window per IP
const DELAY_AFTER_FAILURES = 5;          // start delaying after this many failures
const FAILURE_DELAY_MS = 2000;           // 2s delay per attempt after threshold

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, failures: 0 };
    rateBuckets.set(ip, bucket);
  }

  bucket.attempts++;

  if (bucket.attempts > MAX_ATTEMPTS) {
    const retryAfterSecs = Math.ceil((RATE_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSecs };
  }

  return { allowed: true };
}

function recordFailure(ip: string): void {
  const bucket = rateBuckets.get(ip);
  if (bucket) bucket.failures++;
}

function getFailureDelay(ip: string): number {
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.failures < DELAY_AFTER_FAILURES) return 0;
  return FAILURE_DELAY_MS;
}

// Clean up old buckets every 30 minutes
// .unref() so this timer never prevents a clean process exit (SIGTERM/SIGINT)
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.windowStart < cutoff) rateBuckets.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBcryptHash(s: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(s);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const ip = getClientIp(req);

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    res.set('Retry-After', String(rateCheck.retryAfterSecs ?? 60));
    return res.status(429).json({
      error: 'Too many login attempts. Please wait before trying again.',
      retryAfterSecs: rateCheck.retryAfterSecs,
    });
  }

  const { password } = req.body as { password?: string };
  if (!password) return res.status(400).json({ error: 'Password required' });

  const cfg = readConfig();
  const storedPassword = cfg.adminPassword || '';

  // If no admin password is set, allow any login (open mode)
  if (storedPassword) {
    let valid = false;

    if (isBcryptHash(storedPassword)) {
      valid = await bcrypt.compare(password, storedPassword);
    } else {
      // Legacy plaintext — compare directly, then upgrade to bcrypt
      valid = password === storedPassword;
      if (valid) {
        const hashed = await bcrypt.hash(password, 12);
        writeConfig({ adminPassword: hashed });
        console.log('[auth] Admin password upgraded to bcrypt hash');
      }
    }

    if (!valid) {
      recordFailure(ip);
      const delay = getFailureDelay(ip);
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }
      return res.status(401).json({ error: 'Incorrect password' });
    }
  }

  const token = createSession();

  res.cookie('hs_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  res.json({ ok: true });
}
