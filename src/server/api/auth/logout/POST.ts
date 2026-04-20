/**
 * POST /api/auth/logout
 * Clears the session cookie and removes the token from the persistent store.
 */
import type { Request, Response } from 'express';
import { deleteSession } from '../../../sessionStore.js';

export default async function handler(req: Request, res: Response) {
  const token = req.cookies?.hs_session as string | undefined;
  if (token) deleteSession(token);
  res.clearCookie('hs_session', { path: '/' });
  res.json({ ok: true });
}
