/**
 * GET /api/vpn
 * Returns current VPN status and safe config (no passwords/keys).
 */
import type { Request, Response } from 'express';
import { readConfig } from '../../configStore.js';
import { getVPNStatus, VPN_PROVIDERS } from '../../vpnService.js';
import type { VPNConfig } from '../../vpnService.js';

export default async function handler(_req: Request, res: Response) {
  try {
    const config = await readConfig();
    const vpnCfg = (config as unknown as Record<string, unknown>).vpn as VPNConfig | undefined;
    const status = await getVPNStatus(vpnCfg);

    // Return config without sensitive fields
    const safeConfig = vpnCfg ? {
      enabled: vpnCfg.enabled,
      downloadOnly: true,
      protocol: vpnCfg.protocol,
      provider: vpnCfg.provider,
      autoConnect: vpnCfg.autoConnect,
      hasConfig: !!vpnCfg.configContent,
      hasCredentials: !!(vpnCfg.username && vpnCfg.password),
    } : null;

    res.json({ status, config: safeConfig, providers: VPN_PROVIDERS });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
