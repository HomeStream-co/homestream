import type { Request, Response } from 'express';
import { readQuarantineLog } from '../../../security/threatScanner.js';

export default function handler(_req: Request, res: Response) {
  const entries = readQuarantineLog();
  res.json({ entries, count: entries.length });
}
