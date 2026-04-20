/**
 * demoGuard — protects expensive API keys (TMDB, Google AI) when HomeStream
 * is running in open/unauthenticated mode (no admin password set).
 *
 * In a real local install the user sets an admin password during setup, so
 * this guard is effectively a no-op. In the cloud demo (no password, no
 * setup wizard run) it prevents strangers from burning through API quotas.
 *
 * Strategy:
 *   - Per-IP sliding window: max 20 calls per 10 minutes to guarded routes
 *   - Returns 429 with a friendly message when the limit is hit
 *   - Automatically clears stale buckets every 10 minutes to avoid memory leak
 */

import { readConfig } from './configStore.js';

// ── Config ────────────────────────────────────────────────────────────────────
const WINDOW_MS   = 10 * 60 * 1000; // 10 minutes
const MAX_CALLS   = 20;              // per IP per window

// Routes that touch paid API keys
const GUARDED_PREFIXES = [
  '/api/tmdb',
  '/api/chat',
  '/api/enrich',
];

// ── In-memory store: ip → { count, windowStart } ─────────────────────────────
const buckets = new Map();

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function isGuarded(path) {
  return GUARDED_PREFIXES.some(p => path.startsWith(p));
}

// Sweep stale buckets every 10 minutes so the map doesn't grow forever
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(ip);
  }
}, WINDOW_MS);
if (sweepTimer.unref) sweepTimer.unref();

// ── Middleware factory ────────────────────────────────────────────────────────
export function demoGuard(req, res, next) {
  // Only active when no admin password is configured (open/demo mode)
  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || process.env.ADMIN_PASSWORD || '';
  if (adminPassword) return next(); // real install — skip entirely

  if (!isGuarded(req.path)) return next();

  const ip  = getIp(req);
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
  }

  bucket.count += 1;
  buckets.set(ip, bucket);

  if (bucket.count > MAX_CALLS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'This is a demo instance. Please download HomeStream and run it locally for unlimited access.',
    });
  }

  next();
}
