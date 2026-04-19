/**
 * GET /api/vpn
 * Returns current VPN status and config (without sensitive keys).
 */
import type { Request, Response } from 'express';
import { readConfig } from '../../configStore.js';
import { getVPNStatus } from '../../vpnService.js';

export default async function handler(_req: Request, res: Response) {
  try {
    const config = await readConfig();
    const vpnCfg = (config as unknown as Record<string, unknown>).vpn as Parameters<typeof getVPNStatus>[0] | undefined;
    const status = await getVPNStatus(vpnCfg);

    // Return config without the raw config file content (security)
    const safeConfig = vpnCfg ? {
      enabled: vpnCfg.enabled,
      protocol: vpnCfg.protocol,
      provider: vpnCfg.provider,
      killSwitch: vpnCfg.killSwitch,
      autoConnect: vpnCfg.autoConnect,
      hasConfig: !!vpnCfg.configContent,
    } : null;

    res.json({ status, config: safeConfig });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
