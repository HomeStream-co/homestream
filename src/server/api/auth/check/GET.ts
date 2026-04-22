/**
 * GET /api/auth/check
 * Returns { authenticated: boolean, requiresPassword: boolean }
 * Used by the frontend to decide whether to show the login gate.
 */
import type { Request, Response } from 'express';
import { readConfig } from '../../../configStore.js';
import { isValidSession } from '../login/POST.js';

export default async function handler(req: Request, res: Response) {
  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || '';
  const requiresPassword = !!adminPassword;

  const token = req.cookies?.hs_session as string | undefined;
  const authenticated = !requiresPassword || (!!token && isValidSession(token));

  res.json({ authenticated, requiresPassword });
}
