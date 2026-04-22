/**
 * POST /api/vpn/bind
 *
 * Saves the chosen VPN network interface and pushes the binding to
 * qBittorrent via its Web API so all torrent traffic is locked to
 * that adapter. If the adapter goes down, the kill-switch monitor
 * (vpnKillSwitch.ts) will pause all active downloads automatically.
 *
 * Body: { interface: string | null }
 *   Pass null to clear the binding (disable VPN enforcement).
 *
 * Response: { ok: boolean, message: string, qbitUpdated: boolean }
 */
import type { Request, Response } from 'express';
import os from 'os';
import { readConfig, writeConfig } from '../../../configStore.js';
import { requireAuth } from '../../../authMiddleware.js';

interface BindBody {
  interface: string | null;
}

async function pushToQbit(
  qbitUrl: string,
  username: string,
  password: string,
  networkInterface: string,
): Promise<boolean> {
  try {
    // 1. Log in to qBittorrent Web UI
    const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!loginRes.ok) return false;
    const cookie = loginRes.headers.get('set-cookie') ?? '';

    // 2. Set network interface preference
    // qBittorrent uses the interface name (e.g. "Norton Secure VPN")
    const prefRes = await fetch(`${qbitUrl}/api/v2/app/setPreferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: new URLSearchParams({
        json: JSON.stringify({
          // Bind all outgoing traffic to this interface
          network_interface: networkInterface,
          // Also bind listening port to this interface
          listen_interface: networkInterface,
        }),
      }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    return prefRes.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;  const { interface: iface } = req.body as BindBody;

  // Validate the interface exists if one was provided
  if (iface !== null && iface !== undefined) {
    const raw = os.networkInterfaces();
    if (!raw[iface]) {
      res.status(400).json({ ok: false, message: `Interface "${iface}" not found on this machine`, qbitUpdated: false });
      return;
    }
  }

  // Save to config
  writeConfig({
    vpnInterface: iface ?? undefined,
    vpnKillSwitch: iface ? true : false,
  });

  // Push to qBittorrent if configured
  const cfg = readConfig();
  let qbitUpdated = false;
  if (cfg.qbitUrl && cfg.qbitUsername) {
    if (iface) {
      qbitUpdated = await pushToQbit(cfg.qbitUrl, cfg.qbitUsername, cfg.qbitPassword ?? '', iface);
    } else {
      // Clear the interface binding in qBittorrent
      qbitUpdated = await pushToQbit(cfg.qbitUrl, cfg.qbitUsername, cfg.qbitPassword ?? '', '');
    }
  }

  const action = iface ? `bound to "${iface}"` : 'cleared (no VPN enforcement)';
  res.json({
    ok: true,
    message: `VPN interface ${action}${qbitUpdated ? ' — qBittorrent updated' : ' — qBittorrent not reachable, update it manually'}`,
    qbitUpdated,
  });
}
