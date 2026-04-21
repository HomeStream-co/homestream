/**
 * GET /api/jellyfin/System/Info/Public
 *
 * Jellyfin-compatible server info endpoint.
 * TV apps call this first to verify they're talking to a Jellyfin-compatible server
 * and to get the server name and version.
 */
import type { Request, Response } from 'express';
import os from 'os';

const SERVER_ID = 'homestream-server-001';

export default function handler(_req: Request, res: Response) {
  res.json({
    LocalAddress: `http://${getLocalIp()}:3000`,
    ServerName: 'HomeStream',
    Version: '10.8.0', // Jellyfin version we're compatible with
    ProductName: 'HomeStream Media Server',
    OperatingSystem: os.platform(),
    Id: SERVER_ID,
    StartupWizardCompleted: true,
  });
}

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}
