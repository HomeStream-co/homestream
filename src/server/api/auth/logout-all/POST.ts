/**
 * POST /api/auth/logout-all
 * Invalidates ALL active sessions — security escape hatch.
 * Useful if a session token is compromised or you want a clean slate.
 */
import type { Request, Response } from 'express';
import { clearAllSessions } from '../login/POST.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  clearAllSessions();
  res.clearCookie('hs_session', { path: '/' });
  res.json({ ok: true, message: 'All sessions invalidated. Please log in again.' });
}
