/**
 * GET /api/real-debrid/status
 *
 * Returns cached RD subscription expiry. Re-fetches from the RD API only when:
 *   1. No cached data exists, OR
 *   2. The cached expiry has already passed (subscription renewed or expired)
 *
 * This means a single RD API call per subscription period — never hammers RD.
 */

import type { Request, Response } from 'express';
import { readConfig, writeConfig } from '../../../configStore.js';
import { getUser } from '../../../realDebridClient.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const config = readConfig();

  if (!config.realDebridApiKey) {
    res.json({ ok: false, reason: 'no_key' });
    return;
  }

  const now = Date.now();

  // Use cache if we have an expiry that hasn't passed yet
  if (config.realDebridPremiumExpiry) {
    const expiryMs = new Date(config.realDebridPremiumExpiry).getTime();
    if (expiryMs > now) {
      const daysLeft = Math.floor((expiryMs - now) / (1000 * 60 * 60 * 24));
      res.json({
        ok: true,
        cached: true,
        premiumExpiry: config.realDebridPremiumExpiry,
        checkedAt: config.realDebridPremiumCheckedAt ?? null,
        daysLeft,
      });
      return;
    }
  }

  // Cache miss or expired — fetch live from RD
  try {
    const user = await getUser(config.realDebridApiKey);

    // RD returns `premium` as seconds of premium time remaining
    const premiumSeconds: number = typeof user.premium === 'number' ? user.premium : 0;
    const expiryDate = new Date(now + premiumSeconds * 1000).toISOString();
    const checkedAt  = new Date(now).toISOString();
    const daysLeft   = Math.floor(premiumSeconds / 86400);

    writeConfig({
      realDebridPremiumExpiry:   expiryDate,
      realDebridPremiumCheckedAt: checkedAt,
    });

    res.json({
      ok: true,
      cached: false,
      username: user.username as string | undefined,
      premiumExpiry: expiryDate,
      checkedAt,
      daysLeft,
    });
  } catch (err) {
    res.json({
      ok: false,
      reason: 'fetch_failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
