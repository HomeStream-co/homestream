/**
 * GET /api/admin/status
 *
 * Developer-only endpoint. Returns the current ownership lock state so you
 * can verify that secrets were seeded correctly after deployment.
 *
 * Requires authentication (admin session cookie).
 *
 * Response:
 * {
 *   developerLocked: boolean,   // true if DEVELOPER_LOCK=true is set
 *   hasAdminPassword: boolean,  // true if a password is stored in config
 *   hasTmdbKey: boolean,        // true if TMDB key is stored
 *   hasGoogleAiKey: boolean,    // true if Google AI key is stored
 *   setupComplete: boolean,     // true if setup wizard has been completed
 *   sessionCount: number,       // number of active sessions
 * }
 *
 * Usage (from browser console or curl):
 *   curl -b "hs_session=<token>" https://your-app.com/api/admin/status
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig, isSetupComplete } from '../../../configStore.js';
import { isDeveloperLocked } from '../../../ownershipSeed.js';
import { getSessionCount } from '../../auth/login/POST.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const cfg = readConfig();

  res.json({
    developerLocked: isDeveloperLocked(),
    hasAdminPassword: !!cfg.adminPassword,
    hasTmdbKey: !!cfg.tmdbApiKey,
    hasGoogleAiKey: !!cfg.googleAiApiKey,
    setupComplete: isSetupComplete(),
    sessionCount: getSessionCount(),
  });
}
