/**
 * POST /api/stremio/login
 *
 * Server-side proxy for Stremio authentication.
 * Forwards credentials to https://api.strem.io/api/login and returns the
 * result, bypassing browser CORS restrictions that block direct calls to
 * the Stremio API from the client.
 *
 * Body: { email: string; password: string }
 *
 * Response mirrors the Stremio API shape:
 *   { result: { user: { email, avatar } } }  — on success
 *   { error: string }                         — on failure
 *
 * No auth required — this is the login endpoint itself.
 */
import type { Request, Response } from 'express';

const STREMIO_API = 'https://api.strem.io/api/login';
const TIMEOUT_MS  = 12_000;

interface StremioLoginBody {
  email?: string;
  password?: string;
}

interface StremioLoginResponse {
  result?: {
    user?: {
      email: string;
      avatar?: string;
      authKey?: string;
    };
  };
  error?: string;
}

export default async function handler(req: Request, res: Response) {
  const { email, password } = req.body as StremioLoginBody;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const upstream = await fetch(STREMIO_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HomeStream/1.5',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await upstream.json() as StremioLoginResponse;

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: data.error ?? `Stremio API returned HTTP ${upstream.status}`,
      });
      return;
    }

    // Forward the full response — client reads result.user
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timeout') || msg.includes('abort') || msg.includes('TimeoutError');
    res.status(502).json({
      error: isTimeout
        ? 'Stremio API timed out — try again'
        : 'Could not reach Stremio — check your server\'s internet connection',
    });
  }
}
