/**
 * GET /api/crash-log
 * Returns the persistent crash log for display in the Debug Panel.
 * Also accepts ?clear=1 to wipe the log after copying.
 */
import type { Request, Response } from 'express';
import { getCrashLog, clearCrashLog } from '../../crashLogger.js';

export default function handler(req: Request, res: Response) {
  if (req.query.clear === '1') {
    clearCrashLog();
    return res.json({ cleared: true });
  }
  const entries = getCrashLog();
  res.json({ entries, count: entries.length });
}
