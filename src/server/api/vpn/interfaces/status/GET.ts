/**
 * GET /api/vpn/interfaces/status
 *
 * Checks whether the currently configured VPN interface is still up.
 * Used by the kill-switch monitor and the UI status badge.
 *
 * Response: { bound: boolean, interface: string|null, address: string|null, up: boolean }
 */
import type { Request, Response } from 'express';
import os from 'os';
import { readConfig } from '../../../../configStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const cfg = readConfig();
  const boundIface = cfg.vpnInterface ?? null;

  if (!boundIface) {
    res.json({ bound: false, interface: null, address: null, up: false });
    return;
  }

  const raw = os.networkInterfaces();
  const addrs = raw[boundIface];
  const ipv4 = addrs?.find(a => a.family === 'IPv4');

  res.json({
    bound: true,
    interface: boundIface,
    address: ipv4?.address ?? null,
    up: !!ipv4,
  });
}
