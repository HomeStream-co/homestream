/**
 * stremio-stream-multi-source.test.ts
 *
 * Tests for POST /api/stremio/stream — multi-source parallel fetch.
 *
 * Covers:
 *   - Returns 401 when not authenticated
 *   - Returns 400 when imdbId or type is missing
 *   - Torrentio results returned and labelled correctly
 *   - Prowlarr results returned when configured
 *   - Nyaa results returned and labelled correctly
 *   - Deduplication by infoHash (case-insensitive)
 *   - Sort by seed count descending
 *   - Prowlarr skipped when not configured (no URL/key)
 *   - Torrentio timeout handled gracefully (returns partial results)
 *   - Prowlarr HTTP error handled gracefully
 *   - Series episode stream ID built correctly (imdbId:season:episode)
 *   - Source counts reported in response
 *   - Results capped at 40
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockAuthed = true;
let mockConfig = {
  prowlarrUrl: '',
  prowlarrApiKey: '',
};

// Per-test fetch handler
type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ ...mockConfig }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return {
    body,
    cookies: { session: 'tok' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

/** Build a minimal Torrentio stream response */
function torrentioResponse(streams: Array<{ infoHash: string; seeds?: number; name?: string }>) {
  return {
    streams: streams.map(s => ({
      name: s.name ?? 'Torrentio',
      title: `1080p BluRay\n💾 4.5 GB 👤 ${s.seeds ?? 100}`,
      infoHash: s.infoHash,
      sources: [`tracker:udp://tracker.opentrackr.org:1337/announce`],
    })),
  };
}

/** Build a minimal Prowlarr search response */
function prowlarrResponse(results: Array<{ infoHash: string; seeders?: number; title?: string }>) {
  return {
    results: results.map(r => ({
      title: r.title ?? 'Prowlarr Result 1080p',
      magnetUrl: `magnet:?xt=urn:btih:${r.infoHash}&dn=test`,
      infoHash: r.infoHash,
      seeders: r.seeders ?? 50,
      size: 4_000_000_000,
    })),
  };
}

/** Build a minimal Nyaa response */
function nyaaResponse(items: Array<{ hash: string; seeders?: number; title?: string }>) {
  return items.map(i => ({
    id: 1,
    title: i.title ?? 'Anime 1080p',
    magnet: `magnet:?xt=urn:btih:${i.hash}`,
    seeders: i.seeders ?? 30,
    leechers: 5,
    size: '1.2 GiB',
    hash: i.hash,
  }));
}

// ── Setup global fetch mock ───────────────────────────────────────────────────

const originalFetch = global.fetch;

beforeEach(() => {
  mockAuthed = true;
  mockConfig = { prowlarrUrl: '', prowlarrApiKey: '' };
  vi.resetModules();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(handler: ((url: string) => Promise<Response>) | ((url: string, init?: RequestInit) => Promise<Response>)) {
  global.fetch = vi.fn(handler as FetchHandler) as unknown as typeof fetch;
}

// ── Import handler (after mocks) ──────────────────────────────────────────────

async function getHandler() {
  const mod = await import('../../server/api/stremio/stream/POST.js');
  return mod.default;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/stream — auth', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/stremio/stream — validation', () => {
  it('returns 400 when imdbId is missing', async () => {
    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ type: 'movie' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/imdbId/i);
  });

  it('returns 400 when type is missing', async () => {
    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/type/i);
  });
});

describe('POST /api/stremio/stream — Torrentio source', () => {
  it('returns streams from Torrentio labelled as torrentio', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse([{ infoHash: 'aabbcc001122334455667788990011223344556677' }])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    const body = res.body as { streams: Array<{ source: string; infoHash: string }> };
    expect(body.streams.length).toBeGreaterThan(0);
    expect(body.streams[0].source).toBe('torrentio');
    expect(body.streams[0].infoHash).toBe('aabbcc001122334455667788990011223344556677');
  });

  it('builds correct stream URL for series episodes', async () => {
    let torrentioUrl = '';
    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        torrentioUrl = url as string;
        return new Response(JSON.stringify(torrentioResponse([{ infoHash: 'aa11bb22cc33dd44ee55ff6677889900aabbccdd' }])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt0903747', type: 'series', season: 2, episode: 4 }), res);

    // Torrentio URL should contain imdbId:season:episode
    expect(torrentioUrl).toContain('tt0903747:2:4');
  });

  it('handles Torrentio HTTP error gracefully (returns empty, no crash)', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    // Should not crash — returns empty streams
    expect(res.statusCode).toBe(200);
    const body = res.body as { streams: unknown[] };
    expect(Array.isArray(body.streams)).toBe(true);
  });

  it('handles Torrentio network timeout gracefully', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        // Simulate abort
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { streams: unknown[] };
    expect(Array.isArray(body.streams)).toBe(true);
  });
});

describe('POST /api/stremio/stream — Prowlarr source', () => {
  it('skips Prowlarr when prowlarrUrl is not configured', async () => {
    mockConfig = { prowlarrUrl: '', prowlarrApiKey: '' };
    let prowlarrCalled = false;

    mockFetch(async (url: string) => {
      if (url.includes('prowlarr') || url.includes('9696')) {
        prowlarrCalled = true;
        return new Response(JSON.stringify(prowlarrResponse([])), { status: 200 });
      }
      return new Response(JSON.stringify(torrentioResponse([])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    expect(prowlarrCalled).toBe(false);
    const body = res.body as { sources: { prowlarrConfigured: boolean } };
    expect(body.sources.prowlarrConfigured).toBe(false);
  });

  it('queries Prowlarr when configured and returns labelled results', async () => {
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'testkey123' };

    mockFetch(async (url: string) => {
      if (url.includes('9696')) {
        return new Response(JSON.stringify(prowlarrResponse([
          { infoHash: 'ff00112233445566778899aabbccddeeff001122', seeders: 80 },
        ])), { status: 200 });
      }
      return new Response(JSON.stringify(torrentioResponse([])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Test Movie' }), res);

    const body = res.body as { streams: Array<{ source: string }>; sources: { prowlarr: number; prowlarrConfigured: boolean } };
    const prowlarrStreams = body.streams.filter(s => s.source === 'prowlarr');
    expect(prowlarrStreams.length).toBe(1);
    expect(body.sources.prowlarrConfigured).toBe(true);
    expect(body.sources.prowlarr).toBe(1);
  });

  it('sends X-Api-Key header to Prowlarr', async () => {
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'secret-key-xyz' };
    let capturedHeaders: Record<string, string> = {};

    mockFetch(async (url: string, init?: RequestInit) => {
      if (url.includes('9696')) {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(JSON.stringify(prowlarrResponse([])), { status: 200 });
      }
      return new Response(JSON.stringify(torrentioResponse([])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Test' }), res);

    expect(capturedHeaders['X-Api-Key']).toBe('secret-key-xyz');
  });

  it('handles Prowlarr HTTP error gracefully', async () => {
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'key' };

    mockFetch(async (url: string) => {
      if (url.includes('9696')) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(JSON.stringify(torrentioResponse([
        { infoHash: 'aa11223344556677889900aabbccddeeff001122', seeds: 50 },
      ])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    // Should still return Torrentio results
    expect(res.statusCode).toBe(200);
    const body = res.body as { streams: unknown[]; sources: { prowlarr: number } };
    expect(body.sources.prowlarr).toBe(0);
    expect(body.streams.length).toBeGreaterThan(0);
  });
});

describe('POST /api/stremio/stream — Nyaa source', () => {
  it('returns Nyaa results labelled as nyaa', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('nyaa.si')) {
        return new Response(JSON.stringify(nyaaResponse([
          { hash: 'ee99aabbccddeeff0011223344556677889900aa', seeders: 25 },
        ])), { status: 200 });
      }
      return new Response(JSON.stringify(torrentioResponse([])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Spirited Away' }), res);

    const body = res.body as { streams: Array<{ source: string }>; sources: { nyaa: number } };
    const nyaaStreams = body.streams.filter(s => s.source === 'nyaa');
    expect(nyaaStreams.length).toBe(1);
    expect(body.sources.nyaa).toBe(1);
  });

  it('handles Nyaa network error gracefully', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('nyaa.si')) {
        throw new Error('Network error');
      }
      return new Response(JSON.stringify(torrentioResponse([
        { infoHash: 'bb22334455667788990011aabbccddeeff001122', seeds: 100 },
      ])), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { sources: { nyaa: number } };
    expect(body.sources.nyaa).toBe(0);
  });
});

describe('POST /api/stremio/stream — deduplication & sorting', () => {
  it('deduplicates streams with the same infoHash across sources', async () => {
    const SHARED_HASH = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'key' };

    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse([{ infoHash: SHARED_HASH, seeds: 100 }])), { status: 200 });
      }
      if (url.includes('9696')) {
        return new Response(JSON.stringify(prowlarrResponse([{ infoHash: SHARED_HASH, seeders: 80 }])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Test' }), res);

    const body = res.body as { streams: Array<{ infoHash: string }> };
    const matching = body.streams.filter(s => s.infoHash.toLowerCase() === SHARED_HASH.toLowerCase());
    expect(matching.length).toBe(1); // deduplicated
  });

  it('deduplicates case-insensitively (upper vs lower infoHash)', async () => {
    const HASH_LOWER = 'cccc1111dddd2222eeee3333ffff4444aaaa5555';
    const HASH_UPPER = HASH_LOWER.toUpperCase();
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'key' };

    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse([{ infoHash: HASH_LOWER, seeds: 100 }])), { status: 200 });
      }
      if (url.includes('9696')) {
        return new Response(JSON.stringify(prowlarrResponse([{ infoHash: HASH_UPPER, seeders: 80 }])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Test' }), res);

    const body = res.body as { streams: unknown[] };
    expect(body.streams.length).toBe(1);
  });

  it('sorts results by seed count descending', async () => {
    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse([
          { infoHash: 'aaaa0000111122223333444455556666777788881', seeds: 10 },
          { infoHash: 'bbbb0000111122223333444455556666777788882', seeds: 500 },
          { infoHash: 'cccc0000111122223333444455556666777788883', seeds: 200 },
        ])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    const body = res.body as { streams: Array<{ seeds: string }> };
    const seeds = body.streams.map(s => parseInt(s.seeds) || 0);
    for (let i = 0; i < seeds.length - 1; i++) {
      expect(seeds[i]).toBeGreaterThanOrEqual(seeds[i + 1]);
    }
  });

  it('caps results at 40 entries', async () => {
    // Generate 50 unique hashes
    const streams = Array.from({ length: 50 }, (_, i) => ({
      infoHash: `${i.toString(16).padStart(40, '0')}`,
      seeds: i,
    }));

    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse(streams)), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie' }), res);

    const body = res.body as { streams: unknown[] };
    expect(body.streams.length).toBeLessThanOrEqual(40);
  });
});

describe('POST /api/stremio/stream — source counts', () => {
  it('reports correct source counts in response', async () => {
    mockConfig = { prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'key' };

    mockFetch(async (url: string) => {
      if (url.includes('torrentio')) {
        return new Response(JSON.stringify(torrentioResponse([
          { infoHash: 'aaaa1111222233334444555566667777888899991' },
          { infoHash: 'aaaa1111222233334444555566667777888899992' },
        ])), { status: 200 });
      }
      if (url.includes('9696')) {
        return new Response(JSON.stringify(prowlarrResponse([
          { infoHash: 'bbbb1111222233334444555566667777888899991' },
        ])), { status: 200 });
      }
      if (url.includes('nyaa.si')) {
        return new Response(JSON.stringify(nyaaResponse([
          { hash: 'cccc1111222233334444555566667777888899991' },
          { hash: 'cccc1111222233334444555566667777888899992' },
          { hash: 'cccc1111222233334444555566667777888899993' },
        ])), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const handler = await getHandler();
    const res = makeRes();
    await handler(makeReq({ imdbId: 'tt1234567', type: 'movie', title: 'Test' }), res);

    const body = res.body as {
      sources: { torrentio: number; prowlarr: number; nyaa: number; prowlarrConfigured: boolean };
    };
    expect(body.sources.torrentio).toBe(2);
    expect(body.sources.prowlarr).toBe(1);
    expect(body.sources.nyaa).toBe(3);
    expect(body.sources.prowlarrConfigured).toBe(true);
  });
});
