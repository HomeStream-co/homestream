/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.clearCookie('hs_session', { path: '/' });
  res.json({ ok: true });
}
