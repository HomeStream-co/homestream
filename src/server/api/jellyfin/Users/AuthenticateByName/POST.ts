/**
 * Jellyfin-compatible auth endpoint stub.
 * jellyfinAuth.ts imports `jellyfinTokens` from here — a Map of active tokens.
 */
import type { Request, Response } from 'express';

export interface JellyfinSession {
  userId: string;
  expiresAt: number;
}

/** Active Jellyfin session tokens: token → session */
export const jellyfinTokens = new Map<string, JellyfinSession>();

export default async function handler(req: Request, res: Response) {
  res.status(501).json({ error: 'Not implemented' });
}
