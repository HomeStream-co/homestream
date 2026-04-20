/**
 * rateLimiter — shared in-memory rate limiter for sensitive endpoints.
 *
 * Usage:
 *   import { checkRateLimit, recordFailure, getFailureDelay } from '../../rateLimiter.js';
 *
 *   const result = checkRateLimit('pin-verify', ip, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
 *   if (!result.allowed) return res.status(429).json({ error: '...', retryAfterSecs: result.retryAfterSecs });
 *
 *   // On failure:
 *   recordFailure('pin-verify', ip);
 *   const delay = getFailureDelay('pin-verify', ip, { delayAfter: 3, delayMs: 1500 });
 *   if (delay > 0) await new Promise(r => setTimeout(r, delay));
 */

interface Bucket {
  attempts: number;
  windowStart: number;
  failures: number;
}

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

interface DelayOptions {
  delayAfter: number;
  delayMs: number;
}

// namespace → ip → bucket
const store = new Map<string, Map<string, Bucket>>();

function getBucket(ns: string, ip: string, windowMs: number): Bucket {
  if (!store.has(ns)) store.set(ns, new Map());
  const nsMap = store.get(ns)!;
  const now = Date.now();
  let bucket = nsMap.get(ip);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { attempts: 0, windowStart: now, failures: 0 };
    nsMap.set(ip, bucket);
  }
  return bucket;
}

export function checkRateLimit(
  ns: string,
  ip: string,
  opts: RateLimitOptions,
): { allowed: boolean; retryAfterSecs?: number } {
  const bucket = getBucket(ns, ip, opts.windowMs);
  bucket.attempts++;
  if (bucket.attempts > opts.maxAttempts) {
    const retryAfterSecs = Math.ceil((opts.windowMs - (Date.now() - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSecs: Math.max(1, retryAfterSecs) };
  }
  return { allowed: true };
}

export function recordFailure(ns: string, ip: string): void {
  const nsMap = store.get(ns);
  if (!nsMap) return;
  const bucket = nsMap.get(ip);
  if (bucket) bucket.failures++;
}

export function getFailureDelay(ns: string, ip: string, opts: DelayOptions): number {
  const nsMap = store.get(ns);
  if (!nsMap) return 0;
  const bucket = nsMap.get(ip);
  if (!bucket || bucket.failures < opts.delayAfter) return 0;
  return opts.delayMs;
}

// Clean up stale buckets every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const nsMap of store.values()) {
    for (const [ip, bucket] of nsMap) {
      if (bucket.windowStart < cutoff) nsMap.delete(ip);
    }
  }
}, 30 * 60 * 1000);
