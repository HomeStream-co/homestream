/**
 * authMiddleware — reusable session guard for API routes.
 *
 * Usage:
 *   import { requireAuth } from '../../authMiddleware.js';
 *
 *   export default function handler(req, res) {
 *     if (!requireAuth(req, res)) return;
 *     // ... rest of handler
 *   }
 *
 * Behaviour:
 *   - If no admin password is configured (open mode), always passes.
 *   - If a password is set, validates the hs_session cookie.
 *   - Returns 401 JSON on failure so the frontend can redirect to login.
 *
 * The Jellyfin-compatible endpoints (/api/jellyfin/*) use a separate
 * token scheme (X-Emby-Token / X-MediaBrowser-Token) and are NOT
 * guarded by this middleware — they have their own auth in each handler.
 */

import type { Request, Response } from 'express';
import { readConfig } from './configStore.js';
import { isValidSession } from './api/auth/login/POST.js';

export function requireAuth(req: Request, res: Response): boolean {
  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || process.env.ADMIN_PASSWORD || '';

  // Open mode — no password set, all requests allowed
  if (!adminPassword) return true;

  const token = req.cookies?.hs_session as string | undefined;
  if (token && isValidSession(token)) return true;

  res.status(401).json({ error: 'Unauthorized', message: 'Please log in to continue.' });
  return false;
}
