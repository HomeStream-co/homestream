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
// Max 10 attempts per IP per 15-minute window. After 5 failures, responses
// are delayed by 2 s to slow brute-force attacks.
//
// Rate-limit state is persisted to homestream-ratelimit.json so it survives
// server restarts — an attacker can't reset their bucket by restarting the
// server.
//
// X-Forwarded-For is only trusted when the TCP connection comes from localhost
// (a reverse proxy on the same machine). Direct LAN connections use the socket
// IP to prevent header spoofing.

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
// Buckets are persisted to homestream-ratelimit.json so rate-limit state
// survives server restarts. An attacker who triggers a restart gets at most
// one extra 15-minute window of attempts — acceptable for a home server.
//
// In the Vitest environment (process.env.VITEST === 'true') all disk I/O is
// skipped so tests don't bleed state across runs and don't write to disk.

/** True when running inside Vitest — used to skip disk I/O in tests. */
const IS_TEST = process.env.VITEST === 'true';

const RATELIMIT_PATH = dataPath('homestream-ratelimit.json');

const rateBuckets = new Map<string, RateBucket>();

function loadPersistedRateLimits(): void {
  if (IS_TEST) return;
  try {
    if (!fs.existsSync(RATELIMIT_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(RATELIMIT_PATH, 'utf-8')) as Record<string, RateBucket>;
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, bucket] of Object.entries(raw)) {
      if (bucket.windowStart > cutoff) rateBuckets.set(ip, bucket);
    }
    if (rateBuckets.size > 0) {
      console.log(`[auth] Restored ${rateBuckets.size} rate-limit bucket(s) from disk`);
    }
  } catch {
    // Non-fatal — start with empty buckets if the file is corrupt
  }
}

loadPersistedRateLimits();

/**
 * Reset all rate-limit buckets. FOR TESTING ONLY.
 * Call this in beforeEach so rate-limit state doesn't bleed between tests.
 * Also re-enables the failure delay so tests that need it work correctly.
 */
export function _resetRateLimitsForTesting(): void {
  rateBuckets.clear();
  _testDelayDisabled = false; // always restore delay on reset
}

/**
 * Disable the failure delay (the 2s setTimeout after 5 bad attempts).
 * FOR TESTING ONLY — call once in beforeAll for rate-limit test suites
 * so exhaust() loops complete instantly without fake-timer gymnastics.
 */
let _testDelayDisabled = false;
export function _disableFailureDelayForTesting(): void { _testDelayDisabled = true; }
export function _enableFailureDelayForTesting(): void  { _testDelayDisabled = false; }

function persistRateLimits(): void {
  if (IS_TEST) return;
  const data: Record<string, RateBucket> = {};
  for (const [ip, bucket] of rateBuckets) data[ip] = bucket;
  const tmp = RATELIMIT_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, RATELIMIT_PATH);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// Prune expired buckets every 30 minutes and persist.
// Skipped in Vitest — fake timers would fire this and wipe buckets mid-test.
if (!IS_TEST) {
  setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, bucket] of rateBuckets) {
      if (bucket.windowStart < cutoff) rateBuckets.delete(ip);
    }
    persistRateLimits();
  }, 30 * 60 * 1000).unref();
}

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
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, failures: 0 };
  }

  bucket.attempts++;
  rateBuckets.set(ip, bucket);
  persistRateLimits();

  if (bucket.attempts > MAX_ATTEMPTS) {
    const retryAfterSecs = Math.ceil((RATE_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSecs };
  }

  return { allowed: true };
}

function recordFailure(ip: string): void {
  const bucket = rateBuckets.get(ip);
  if (bucket) {
    bucket.failures++;
    rateBuckets.set(ip, bucket);
    persistRateLimits();
  }
}

function getFailureDelay(ip: string): number {
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
      if (delay > 0 && !_testDelayDisabled) {
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

  // FIX (🟡): Previously the token was always returned in the response body.
  // Browser clients that stored it in localStorage would make it XSS-accessible,
  // defeating the purpose of the httpOnly cookie.
  //
  // Detection heuristic: a browser always sends a Cookie header on same-origin
  // requests (even if empty, the header is present). Phone/TV clients on LAN
  // access the server cross-origin (different IP) so the browser suppresses the
  // Cookie header — making its absence a reliable signal for non-browser clients.
  //
  // We also check for an explicit X-HS-Client: tv header that phone/TV clients
  // can send to opt in to the body token regardless of Cookie header presence.
  //
  // The token is still needed by phone/TV clients for WebSocket auth (WS upgrades
  // cannot send cookies cross-origin) — so we only omit it for browser clients.
  const hasCookieHeader = typeof req.headers.cookie === 'string';
  const isTvClient = req.headers['x-hs-client'] === 'tv';
  const isBrowserClient = hasCookieHeader && !isTvClient;

  if (isBrowserClient) {
    // Browser: token is in the httpOnly cookie — don't expose it in the body
    res.json({ ok: true });
  } else {
    // Phone/TV/non-browser: return token so client can store it for WS auth
    res.json({ ok: true, token });
  }
}
