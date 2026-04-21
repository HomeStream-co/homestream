/**
 * GET /api/jellyfin/Users
 *
 * Returns the list of users. TV apps call this after login to get the user ID.
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  res.json([
    {
      Name: 'Admin',
      ServerId: 'homestream-server-001',
      Id: 'homestream-admin',
      HasPassword: true,
      HasConfiguredPassword: true,
      EnableAutoLogin: false,
      Policy: {
        IsAdministrator: true,
        EnableMediaPlayback: true,
        EnableAllFolders: true,
      },
    },
  ]);
}
