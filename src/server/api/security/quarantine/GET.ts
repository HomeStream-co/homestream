import type { Request, Response } from 'express';
import { readQuarantineLog } from '../../../security/threatScanner.js';
import { requireAuth } from '../../../authMiddleware.js';

/**
 * GET /api/security/quarantine
 * Returns the quarantine log entries.
 *
 * no-try/catch: intentional — readQuarantineLog() is internally guarded and
 * returns [] on any read error. Nothing here can throw at request time.
 */
export default function handler(_req: Request, res: Response) {
  if (!requireAuth(_req, res)) return;
  const entries = await readQuarantineLog();
  res.json({ entries, count: entries.length });
}
