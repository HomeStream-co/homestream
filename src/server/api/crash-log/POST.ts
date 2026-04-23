/**
 * POST /api/crash-log
 * Receives crash reports from the React frontend (AppErrorBoundary).
 * Writes them to the same persistent crash log as server-side crashes.
 */
import type { Request, Response } from 'express';
import { logCrash } from '../../crashLogger.js';

interface CrashPayload {
  type?: string;
  message?: string;
  stack?: string;
  context?: string;
}

export default function handler(req: Request, res: Response) {
  try {
    const body = req.body as CrashPayload;
    const type = (body.type as 'reactError') ?? 'manual';
    const err = Object.assign(new Error(body.message ?? 'Unknown frontend error'), {
      stack: body.stack,
    });
    logCrash(type as 'manual', err, body.context);
    res.json({ ok: true });
  } catch {
    // Never let a crash-logger failure surface as a 500 — the client doesn't
    // need to know the log write failed; just acknowledge receipt.
    res.json({ ok: true });
  }
}
