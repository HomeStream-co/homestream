/**
 * POST /api/auth/login — stub for authMiddleware import.
 * Full implementation to be provided in a later batch.
 */
import type { Request, Response } from 'express';

/** Returns true if the given session token string is valid. */
export function isValidSession(token: string): boolean {
  return typeof token === 'string' && token.length > 0;
}

export default async function handler(req: Request, res: Response) {
  res.status(501).json({ error: 'Not implemented' });
}
