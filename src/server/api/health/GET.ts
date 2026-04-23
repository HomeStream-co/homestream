import type { Request, Response } from 'express';
import { createRequire } from 'module';

/**
 * GET /api/health
 * Lightweight liveness probe used by Docker healthcheck and load balancers.
 * Returns 200 immediately — no subsystem checks (use /api/health/full for that).
 * Intentionally open (no auth) — see auth-audit.test.ts allowlist.
 *
 * no-try/catch: intentional — pure in-memory read of package.json (loaded at
 * startup). Nothing here can throw at request time.
 */

const _require = createRequire(import.meta.url);
const pkg = _require('../../../../../package.json') as { version: string };

export default function handler(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    app: 'HomeStream',
    version: pkg.version,
    timestamp: new Date().toISOString(),
  });
}
