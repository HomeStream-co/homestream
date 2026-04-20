import type { Request, Response } from 'express';
import { readQuarantineLog } from '../../../security/threatScanner.js';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(_req: Request, res: Response) {
  if (!requireAuth(_req, res)) return;
  const entries = readQuarantineLog();
  res.json({ entries, count: entries.length });
}
