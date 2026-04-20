/**
 * POST /api/vpn
 * Actions: connect | disconnect | save | test
 *
 * VPN is download-only — connecting here is for manual testing/status.
 * Actual download-time connect/disconnect is handled by the download endpoint.
 */
import type { Request, Response } from 'express';
import { readConfig, writeConfig } from '../../configStore.js';
import { connectVPN, disconnectVPN, testVPNConfig } from '../../vpnService.js';
import type { VPNConfig, VPNProtocol, VPNProviderType } from '../../vpnService.js';
import { requireAuth } from '../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const { action, ...payload } = req.body as {
      action: 'connect' | 'disconnect' | 'save' | 'test';
      protocol?: VPNProtocol;
      provider?: VPNProviderType;
      configContent?: string;
      username?: string;
      password?: string;
      autoConnect?: boolean;
      enabled?: boolean;
    };

    const config = await readConfig() as unknown as Record<string, unknown>;

    if (action === 'save') {
      const existing = (config.vpn ?? {}) as Partial<VPNConfig>;
      const vpnConfig: VPNConfig = {
        enabled: payload.enabled ?? existing.enabled ?? true,
        downloadOnly: true,
        protocol: payload.protocol ?? existing.protocol ?? 'wireguard',
        provider: payload.provider ?? existing.provider ?? 'custom',
        // Only update configContent if provided (don't wipe existing)
        configContent: payload.configContent !== undefined
          ? payload.configContent
          : (existing.configContent ?? ''),
        // Only update credentials if provided
        username: payload.username !== undefined ? payload.username : existing.username,
        password: payload.password !== undefined ? payload.password : existing.password,
        autoConnect: payload.autoConnect ?? existing.autoConnect ?? false,
      };
      config.vpn = vpnConfig;
      await writeConfig(config);
      return res.json({ ok: true });
    }

    if (action === 'test') {
      const result = await testVPNConfig(
        payload.protocol ?? 'wireguard',
        payload.configContent ?? '',
        payload.username,
        payload.password,
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
      if (vpnCfg) await disconnectVPN(vpnCfg);
      return res.json({ ok: true });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
