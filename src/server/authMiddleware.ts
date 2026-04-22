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
 * Internal bypass:
 *   Server-to-server loopback calls (enrichment, caption fetch) send the
 *   X-Internal-Server-Call: homestream header. These are allowed through
 *   without a session cookie because they originate from this process only
 *   and never from the network (the header is not forwarded by browsers).
 *
 * The Jellyfin-compatible endpoints (/api/jellyfin/*) use a separate
 * token scheme (X-Emby-Token / X-MediaBrowser-Token) and are NOT
 * guarded by this middleware — they have their own auth in each handler.
 */

import type { Request, Response } from 'express';
import { readConfig } from './configStore.js';
import { isValidSession } from './api/auth/login/POST.js';

const INTERNAL_BYPASS_HEADER = 'x-internal-server-call';
const INTERNAL_BYPASS_VALUE  = 'homestream';

export function requireAuth(req: Request, res: Response): boolean {
  // Internal server-to-server calls (loopback only) bypass session auth.
  // We verify the request came from localhost to prevent external spoofing.
  if (req.headers[INTERNAL_BYPASS_HEADER] === INTERNAL_BYPASS_VALUE) {
    const ip = req.socket.remoteAddress ?? '';
    if (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost')) {
      return true;
    }
    // Non-localhost with bypass header — reject (spoofing attempt)
  }

  const cfg = readConfig();
  // Password comes from config file only (set by wizard). Never fall back to env.
  const adminPassword = cfg.adminPassword || '';

  // Open mode — no password set, all requests allowed
  if (!adminPassword) return true;

  const token = req.cookies?.hs_session as string | undefined;
  if (token && isValidSession(token)) return true;

  res.status(401).json({ error: 'Unauthorized', message: 'Please log in to continue.' });
  return false;
}
