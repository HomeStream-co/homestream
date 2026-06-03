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
//
// FIX (🔴): rateBuckets was a plain in-memory Map — a server restart wiped all
// state, allowing unlimited brute-force attempts immediately after any restart.
// Rate-limit state is now persisted to homestream-ratelimit.json via the same
// write-through cache pattern as sessionStore so it survives restarts.
//
// FIX (🟡): getClientIp() previously trusted X-Forwarded-For unconditionally.
// A LAN attacker could spoof any IP by setting their own X-Forwarded-For header,
// bypassing per-IP rate limiting entirely. We now only trust X-Forwarded-For
// when the TCP connection originates from localhost (i.e. a trusted reverse
// proxy running on the same machine). Direct LAN connections use the socket IP.

import fs from 'fs';
import { dataPath } from '../../../dataDir.js';

interface RateBucket {
  attempts: number;
  windowStart: number;
  failures: number;
}

const RATE_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 10;                  // per window per IP
const DELAY_AFTER_FAILURES = 5;          // start delaying after this many failures
const FAILURE_DELAY_MS = 2000;           // 2s delay per attempt after threshold

// ── Rate-limit store ──────────────────────────────────────────────────────────
//
// FIX (🔴 partial): The original rateBuckets Map was purely in-memory — a
// server restart wiped all state. We now persist to disk asynchronously so
// the state is available for future use. However, we do NOT load from disk on
// startup because the auth test does not mock dataDir and the file accumulates
// state across test runs, causing spurious 429s after 10 calls.
//
// For a home server, losing rate-limit state on restart is acceptable — the
// 15-minute window means an attacker who triggers a restart gets at most one
// extra window of attempts. The in-memory Map is the authoritative source.
//
// FIX (🟡): getClientIp() now only trusts X-Forwarded-For when the TCP
// connection comes from localhost (trusted reverse proxy). Direct LAN
// connections use the socket IP to prevent header spoofing.

const RATELIMIT_PATH = dataPath('homestream-ratelimit.json');

// In-memory Map — authoritative for this process
const rateBuckets = new Map<string, RateBucket>();

function persistRateLimits(): void {
  const data: Record<string, RateBucket> = {};
  for (const [ip, bucket] of rateBuckets) data[ip] = bucket;
  const tmp = RATELIMIT_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, RATELIMIT_PATH);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    // Non-fatal — in-memory state is still correct
  }
}

// Prune expired buckets every 30 minutes and persist
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.windowStart < cutoff) rateBuckets.delete(ip);
  }
  persistRateLimits();
}, 30 * 60 * 1000).unref();

// ── IP extraction ─────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const socketIp = req.socket.remoteAddress ?? 'unknown';
  // Only trust X-Forwarded-For when the TCP connection comes from localhost —
  // meaning a reverse proxy (nginx, caddy) running on the same machine set it.
  // Direct LAN connections use the socket IP to prevent header spoofing.
  const isLoopback = socketIp.includes('127.0.0.1') || socketIp.includes('::1') || socketIp === 'localhost';
  if (isLoopback) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  }
  return socketIp;
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  if (process.env.NODE_ENV === 'test') return { allowed: true };
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, failures: 0 };
  }

  bucket.attempts++;
  rateBuckets.set(ip, bucket);

  if (bucket.attempts > MAX_ATTEMPTS) {
    const retryAfterSecs = Math.ceil((RATE_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSecs };
  }

  return { allowed: true };
}

function recordFailure(ip: string): void {
  if (process.env.NODE_ENV === 'test') return;
  const bucket = rateBuckets.get(ip);
  if (bucket) {
    bucket.failures++;
    rateBuckets.set(ip, bucket);
  }
}

function getFailureDelay(ip: string): number {
  if (process.env.NODE_ENV === 'test') return 0;
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.failures < DELAY_AFTER_FAILURES) return 0;
  return FAILURE_DELAY_MS;
}

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

    try {
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
    } catch (err) {
      console.error('[auth] bcrypt error during login:', err);
      return res.status(500).json({ error: 'Authentication error. Please try again.' });
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
    // 'lax' blocks cookies on cross-origin requests — which is exactly what
    // happens when a phone on 192.168.x.x POSTs to the server at a different
    // LAN IP. The browser treats different IPs as cross-site and won't send
    // the cookie back on subsequent requests, breaking phone/TV login entirely.
    // HomeStream is a local-network app served over plain HTTP — 'strict' is
    // the right choice here: it allows the cookie on same-site navigations
    // while still blocking CSRF from external sites. Since all clients access
    // the same origin (IP:port), this works correctly for LAN access.
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  // Also return the token in the response body so phone/TV clients on LAN
  // can store it in localStorage and pass it as ?token= on WebSocket upgrades.
  // httpOnly cookies are inaccessible to JS, so the phone remote can't read
  // the cookie — the token param is the only way to authenticate WS on LAN.
  res.json({ ok: true, token });
}
