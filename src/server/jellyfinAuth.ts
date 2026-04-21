/**
 * jellyfinAuth — shared auth guard for Jellyfin-compatible API endpoints.
 *
 * Jellyfin TV apps authenticate via:
 *   1. X-Emby-Token header (most common)
 *   2. X-MediaBrowser-Token header (older clients)
 *   3. ?api_key= query param (some clients)
 *
 * Tokens are issued by POST /api/jellyfin/Users/AuthenticateByName.
 *
 * If no admin password is configured (open mode), all requests pass through
 * so TV apps work out-of-the-box on a local network without any setup.
 *
 * Usage:
 *   import { requireJellyfinAuth } from '../../../jellyfinAuth.js';
 *   if (!requireJellyfinAuth(req, res)) return;
 */

import type { Request, Response } from 'express';
import { readConfig } from './configStore.js';
import { jellyfinTokens } from './api/jellyfin/Users/AuthenticateByName/POST.js';

export function requireJellyfinAuth(req: Request, res: Response): boolean {
  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || process.env.ADMIN_PASSWORD || '';

  // Open mode — no password set, all requests allowed
  if (!adminPassword) return true;

  // Extract token from header or query param
  const token =
    (req.headers['x-emby-token'] as string | undefined) ||
    (req.headers['x-mediabrowser-token'] as string | undefined) ||
    (req.query.api_key as string | undefined) ||
    (req.query.ApiKey as string | undefined);

  if (token) {
    const session = jellyfinTokens.get(token);
    if (session && session.expiresAt > Date.now()) return true;
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'Provide a valid X-Emby-Token. Authenticate via POST /api/jellyfin/Users/AuthenticateByName.',
  });
  return false;
}
