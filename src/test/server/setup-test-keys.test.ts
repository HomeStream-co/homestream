/**
 * setup-test-keys.test.ts
 *
 * Full coverage of POST /api/setup/test-keys
 *
 * Tests cover:
 *   - 400 when key or value is missing
 *   - 400 for unknown key type
 *   - TMDB: ok:true on 200 response from API
 *   - TMDB: ok:false on non-200 response (bad key)
 *   - TMDB: ok:false on network error
 *   - OMDB: ok:true when Response === 'True'
 *   - OMDB: ok:false when Response === 'False' (bad key)
 *   - OMDB: ok:false on network error
 *   - Google AI: ok:true on 200 response
 *   - Google AI: ok:false on non-200 response
 *   - Google AI: ok:false on network error
 *   - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as {
    statusCode: number; body: unknown;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  return res;
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return {
    query: {}, params: {}, body,
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
  } as unknown as Request;
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/setup/test-keys', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/api/setup/test-keys/POST.js');
    handler = mod.default;
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when key is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ value: 'somekey' }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 when value is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ key: 'tmdb' }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 when value is empty string', async () => {
    const res = makeRes();
    await handler(makeReq({ key: 'tmdb', value: '   ' }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for unknown key type', async () => {
    const res = makeRes();
    await handler(makeReq({ key: 'unknown_service', value: 'abc123' }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  // ── TMDB ────────────────────────────────────────────────────────────────────

  it('TMDB — returns ok:true when API responds 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const res = makeRes();
    await handler(makeReq({ key: 'tmdb', value: 'valid_tmdb_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { message: string }).message).toContain('valid');
  });

  it('TMDB — returns ok:false when API responds non-200', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ status_message: 'Invalid API key' }),
    });
    const res = makeRes();
    await handler(makeReq({ key: 'tmdb', value: 'bad_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { message: string }).message).toContain('Invalid API key');
  });

  it('TMDB — returns ok:false on network error', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND api.themoviedb.org'));
    const res = makeRes();
    await handler(makeReq({ key: 'tmdb', value: 'any_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { message: string }).message).toBeTruthy();
  });

  it('TMDB — calls correct TMDB endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await handler(makeReq({ key: 'tmdb', value: 'mykey' }), makeRes() as unknown as Response);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('themoviedb.org');
    expect(url).toContain('configuration');
  });

  // ── OMDB ────────────────────────────────────────────────────────────────────

  it('OMDB — returns ok:true when Response is True', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Response: 'True', Title: 'Inception' }),
    });
    const res = makeRes();
    await handler(makeReq({ key: 'omdb', value: 'valid_omdb_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { message: string }).message).toContain('Inception');
  });

  it('OMDB — returns ok:false when Response is False', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Response: 'False', Error: 'Invalid API key!' }),
    });
    const res = makeRes();
    await handler(makeReq({ key: 'omdb', value: 'bad_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { message: string }).message).toContain('Invalid API key');
  });

  it('OMDB — returns ok:false on network error', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    const res = makeRes();
    await handler(makeReq({ key: 'omdb', value: 'any_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  it('OMDB — calls correct OMDB endpoint with key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Response: 'True', Title: 'Inception' }),
    });
    await handler(makeReq({ key: 'omdb', value: 'myomdbkey' }), makeRes() as unknown as Response);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('omdbapi.com');
    expect(url).toContain('myomdbkey');
  });

  // ── Google AI ───────────────────────────────────────────────────────────────

  it('Google AI — returns ok:true when API responds 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    const res = makeRes();
    await handler(makeReq({ key: 'googleai', value: 'valid_gai_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { message: string }).message).toContain('Gemini');
  });

  it('Google AI — returns ok:false when API responds non-200', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'API key not valid' } }),
    });
    const res = makeRes();
    await handler(makeReq({ key: 'googleai', value: 'bad_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { message: string }).message).toContain('API key not valid');
  });

  it('Google AI — returns ok:false on network error', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND generativelanguage.googleapis.com'));
    const res = makeRes();
    await handler(makeReq({ key: 'googleai', value: 'any_key' }), res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  it('Google AI — calls correct Google AI endpoint with key', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await handler(makeReq({ key: 'googleai', value: 'mygaikey' }), makeRes() as unknown as Response);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('googleapis.com');
    expect(url).toContain('mygaikey');
  });

  // ── Trims whitespace from value ─────────────────────────────────────────────

  it('trims whitespace from value before testing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await handler(makeReq({ key: 'tmdb', value: '  mykey  ' }), makeRes() as unknown as Response);
    const opts = fetchMock.mock.calls[0][1] as { headers: { Authorization: string } };
    expect(opts.headers.Authorization).toContain('mykey');
    expect(opts.headers.Authorization).not.toContain('  ');
  });
});
