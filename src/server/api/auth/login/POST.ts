/**
 * POST /api/auth/login
 *
 * Validates the admin password and returns a session token stored in an
 * httpOnly cookie.  The token is a random hex string stored in memory
 * (restarts invalidate sessions — acceptable for a home server).
 *
 * Body: { password: string }
 * Response: { ok: true } | { error: string }
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { readConfig } from '../../../configStore.js';

// In-memory session store: token → expiry timestamp
const sessions = new Map<string, number>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isValidSession(token: string): boolean {
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  return true;
}

export default async function handler(req: Request, res: Response) {
  const { password } = req.body as { password?: string };
  if (!password) return res.status(400).json({ error: 'Password required' });

  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || process.env.ADMIN_PASSWORD || '';

  // If no admin password is set, allow any login (open mode)
  if (adminPassword && password !== adminPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);

  res.cookie('hs_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  res.json({ ok: true });
}
