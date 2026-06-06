/**
 * GET /api/jellyfin/System
 * Jellyfin-compatible system info endpoint.
 * Returns server identity info so Jellyfin clients can connect.
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  res.json({
    ServerName: 'HomeStream',
    Version: '10.8.0',
    ProductName: 'HomeStream Media Server',
    OperatingSystem: process.platform,
    Id: 'homestream-server',
    StartupWizardCompleted: true,
  });
}
