/**
 * POST /api/auth/logout-all
 * Invalidates ALL active sessions — security escape hatch.
 * Useful if a session token is compromised or you want a clean slate.
 *
 * no-try/catch: intentional — clearAllSessions() is a pure Map clear;
 * clearCookie writes a response header. Neither can throw.
 */
import type { Request, Response } from 'express';
import { clearAllSessions } from '../../../../../sessionStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  clearAllSessions();
  res.clearCookie('hs_session', { path: '/' });
  res.json({ ok: true, message: 'All sessions invalidated. Please log in again.' });
}
