/**
 * GET /api/vpn/fastest-server
 * Runs the fastest-server probe for the currently configured VPN provider
 * and returns the result. Used by the Settings → VPN panel to show which
 * server would be chosen and its measured latency.
 *
 * This is a read-only probe — it does NOT connect the VPN.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';
import { pickFastestServer } from '../../../vpnServerRanker.js';
import type { VPNConfig } from '../../../vpnService.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const config = readConfig() as unknown as Record<string, unknown>;
    const vpnCfg = config.vpn as VPNConfig | undefined;

    if (!vpnCfg?.enabled) {
      res.status(400).json({ error: 'VPN is not configured' });
      return;
    }

    const result = await pickFastestServer(vpnCfg);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
