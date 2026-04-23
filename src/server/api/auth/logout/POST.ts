/**
 * POST /api/auth/logout
 * Clears the session cookie and removes the token from the persistent store.
 * Intentionally open (no auth required) — a logged-out user must be able to
 * call this to clear a stale cookie.
 *
 * no-try/catch: intentional — deleteSession() is a pure Map delete; clearCookie
 * writes a response header. Neither can throw.
 */
import type { Request, Response } from 'express';
import { deleteSession } from '../../../sessionStore.js';

export default async function handler(req: Request, res: Response) {
  const token = req.cookies?.hs_session as string | undefined;
  if (token) deleteSession(token);
  res.clearCookie('hs_session', { path: '/' });
  res.json({ ok: true });
}
