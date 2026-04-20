/**
 * POST /api/setup/test-keys
 *
 * Validates API keys server-side so the setup wizard doesn't need to make
 * cross-origin requests from the browser. This also works correctly when
 * the user is on a local network where the browser might have different
 * DNS/proxy settings than the server.
 *
 * Body: { key: 'tmdb' | 'omdb' | 'googleai', value: string }
 * Returns: { ok: boolean, message: string }
 */
import type { Request, Response } from 'express';

interface TestBody {
  key: 'tmdb' | 'omdb' | 'googleai';
  value: string;
}

async function testTmdb(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.themoviedb.org/3/configuration', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { ok: true, message: 'Key is valid — TMDB connected!' };
    const body = await res.json() as { status_message?: string };
    return { ok: false, message: body.status_message ?? `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch') || msg.includes('ENOTFOUND') || msg.includes('timeout')) {
      return { ok: false, message: 'Cannot reach TMDB — check your internet connection' };
    }
    return { ok: false, message: `Connection error: ${msg}` };
  }
}

async function testOmdb(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&t=inception`, {
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.json() as { Response: string; Error?: string; Title?: string };
    if (body.Response === 'True') return { ok: true, message: `Key is valid — fetched "${body.Title}" successfully` };
    return { ok: false, message: body.Error ?? 'Invalid key' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch') || msg.includes('ENOTFOUND') || msg.includes('timeout')) {
      return { ok: false, message: 'Cannot reach OMDB — check your internet connection' };
    }
    return { ok: false, message: `Connection error: ${msg}` };
  }
}

async function testGoogleAi(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { ok: true, message: 'Key is valid — Gemini API connected!' };
    const body = await res.json() as { error?: { message?: string } };
    return { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch') || msg.includes('ENOTFOUND') || msg.includes('timeout')) {
      return { ok: false, message: 'Cannot reach Google AI — check your internet connection' };
    }
    return { ok: false, message: `Connection error: ${msg}` };
  }
}

export default async function handler(req: Request, res: Response) {
  const { key, value } = req.body as TestBody;

  if (!key || !value?.trim()) {
    res.status(400).json({ ok: false, message: 'Missing key or value' });
    return;
  }

  try {
    let result: { ok: boolean; message: string };
    switch (key) {
      case 'tmdb':     result = await testTmdb(value.trim()); break;
      case 'omdb':     result = await testOmdb(value.trim()); break;
      case 'googleai': result = await testGoogleAi(value.trim()); break;
      default:
        res.status(400).json({ ok: false, message: `Unknown key type: ${key}` });
        return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: `Test failed: ${String(err)}` });
  }
}
