import type { Request, Response } from 'express';

/**
 * GET /api/health
 * Lightweight liveness probe used by Docker healthcheck and load balancers.
 * Returns 200 immediately — no subsystem checks (use /api/health/full for that).
 * Intentionally open (no auth) — see auth-audit.test.ts allowlist.
 *
 * no-try/catch: intentional — pure in-memory read (loaded at startup).
 * Nothing here can throw at request time.
 */

// Version is baked in at build time via Vite's define — no runtime file read needed.
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '0.0.0';

export default function handler(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    app: 'HomeStream',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
}
