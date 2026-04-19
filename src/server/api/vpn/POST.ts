/**
 * POST /api/vpn
 * Actions: connect | disconnect | save | test
 */
import type { Request, Response } from 'express';
import { readConfig, writeConfig } from '../../configStore.js';
import { connectVPN, disconnectVPN, testVPNConfig } from '../../vpnService.js';
import type { VPNConfig, VPNProtocol } from '../../vpnService.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { action, ...payload } = req.body as {
      action: 'connect' | 'disconnect' | 'save' | 'test';
      protocol?: VPNProtocol;
      provider?: string;
      configContent?: string;
      killSwitch?: boolean;
      autoConnect?: boolean;
      enabled?: boolean;
    };

    const config = await readConfig() as unknown as Record<string, unknown>;

    if (action === 'save') {
      const vpnConfig: VPNConfig = {
        enabled: payload.enabled ?? true,
        protocol: payload.protocol ?? 'wireguard',
        provider: payload.provider ?? 'Custom',
        configContent: payload.configContent ?? '',
        killSwitch: payload.killSwitch ?? false,
        autoConnect: payload.autoConnect ?? false,
      };
      config.vpn = vpnConfig;
      await writeConfig(config);
      return res.json({ ok: true });
    }

    if (action === 'test') {
      const result = await testVPNConfig(
        payload.protocol ?? 'wireguard',
        payload.configContent ?? ''
      );
      return res.json(result);
    }

    if (action === 'connect') {
      const vpnCfg = config.vpn as VPNConfig | undefined;
      if (!vpnCfg) return res.status(400).json({ error: 'No VPN config saved' });
      const result = await connectVPN(vpnCfg);
      return res.json(result);
    }

    if (action === 'disconnect') {
      const vpnCfg = config.vpn as VPNConfig | undefined;
      await disconnectVPN(vpnCfg?.protocol ?? 'wireguard');
      return res.json({ ok: true });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
