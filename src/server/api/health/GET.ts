import type { Request, Response } from 'express';
import { isSetupComplete, readConfig } from '../../configStore.js';

/**
 * GET /api/health
 * Lightweight liveness probe used by Docker healthcheck and load balancers.
 * Returns 200 immediately — no subsystem checks (use /api/health/full for that).
 * Intentionally open (no auth) — see auth-audit.test.ts allowlist.
 *
 * Also used by /tv and /remote gate checks so they don't need an auth cookie
 * to determine whether setup is complete.
 *
 * no-try/catch: intentional — pure in-memory read (loaded at startup).
 * Nothing here can throw at request time.
 */

// Version is baked in at build time via Vite's define — no runtime file read needed.
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '0.0.0';

export default function handler(_req: Request, res: Response) {
  const cfg = readConfig();
  res.json({
    status: 'ok',
    app: 'HomeStream',
    version: APP_VERSION,
    setupComplete: isSetupComplete(),
    // Tells the /remote page whether a password is required so it can show
    // the login gate before attempting the WebSocket connection.
    // Does NOT expose the password itself — just whether one is set.
    passwordSet: !!(cfg.adminPassword),
    timestamp: new Date().toISOString(),
  });
}
