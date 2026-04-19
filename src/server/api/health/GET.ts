import type { Request, Response } from 'express';

/**
 * GET /api/health
 * Lightweight liveness probe used by Docker healthcheck and load balancers.
 * Returns 200 immediately — no subsystem checks (use /api/health/full for that).
 */
export default function handler(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    app: 'HomeStream',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
