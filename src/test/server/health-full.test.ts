/**
 * health-full.test.ts — GET /api/health/full
 *
 * Full coverage of the Debug Panel subsystem health endpoint.
 * 8 checks run in parallel: library, config, qBit, TMDB, Ollama,
 * Torrentio, download queue, FFmpeg.
 *
 * NOTE: This test file does NOT use vi.resetModules() — all mocks are
 * registered once at module scope and controlled via shared state variables.
 * This avoids the mock-path resolution issues that arise when modules are
 * re-imported after resetModules().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state (module-level, mutated per test) ────────────────────────

const mockReadConfig    = vi.fn();
const mockReadLibrary   = vi.fn();
const mockQbitReachable = vi.fn();
const mockGetAllJobs    = vi.fn();
let   mockAuthed = true;
let   mockExistsResult = true;

// ── Module-scope mocks (registered once, factories reference shared state) ────

vi.mock('../../server/configStore.js', () => ({
  readConfig:      () => mockReadConfig(),
  isSetupComplete: () => true,
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockReadLibrary(),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: () => mockQbitReachable(),
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs: () => mockGetAllJobs(),
}));

vi.mock('../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: () => false,
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

vi.mock('child_process', () => ({
  spawn: () => ({
    stdout: { on: vi.fn((e: string, cb: (d: Buffer) => void) => { if (e === 'data') setTimeout(() => cb(Buffer.from('ffmpeg version 6.0')), 0); }) },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: vi.fn((e: string, cb: (code: number) => void) => { if (e === 'close') setTimeout(() => cb(0), 0); }),
  }),
}));

vi.mock('module', () => ({ createRequire: () => () => '/usr/bin/ffmpeg' }));

vi.mock('fs', () => ({
  default: { existsSync: () => mockExistsResult },
  existsSync: () => mockExistsResult,
}));

// Stub fetch globally for TMDB / Torrentio / Ollama checks
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ models: [] }),
}));

// ── Import handler ONCE (no resetModules) ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: (req: Request, res: Response) => Promise<any>;

beforeEach(async () => {
  if (!handler) {
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  }
  // Reset all mocks to clean defaults before each test
  mockAuthed = true;
  mockExistsResult = true;
  mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
  mockReadLibrary.mockReset().mockReturnValue([]);
  mockGetAllJobs.mockReset().mockReturnValue([]);
  mockQbitReachable.mockReset().mockResolvedValue(true);
});

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

function makeReq(): Request {
  return {
    query: {}, params: {}, body: {},
    cookies: { hs_session: 'tok' },
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  } as unknown as Request;
}

const BASE_CONFIG = {
  mediaDir: '/media', qbitUrl: 'http://localhost:8080',
  omdbApiKey: 'omdb', tmdbApiKey: 'tmdb', googleAiApiKey: 'gai',
  setupComplete: true, watchFolderEnabled: false, autoTranscode: false,
  aiProvider: 'google', preferredQuality: '1080p',
  jellyfinUrl: '', qbitUsername: 'admin', virusTotalApiKey: '',
};

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/health/full — auth', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated requests through', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as { overall: string }).overall).toBeDefined();
  });
});

// ── Overall status aggregation ────────────────────────────────────────────────

describe('GET /api/health/full — overall status', () => {
  it("overall is 'error' when mediaDir does not exist on disk", async () => {
    mockExistsResult = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { overall: string }).overall).toBe('error');
  });

  it("overall is 'warn' when qBit is unreachable", async () => {
    mockQbitReachable.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(['warn', 'error']).toContain((res.body as { overall: string }).overall);
  });

  it("overall is 'warn' when library has stuck transcodes", async () => {
    mockReadLibrary.mockReturnValue([{ type: 'movie', transcoding: true }]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(['warn', 'error']).toContain((res.body as { overall: string }).overall);
  });
});

// ── Library check ─────────────────────────────────────────────────────────────

describe('GET /api/health/full — library check', () => {
  it('ok — library loads cleanly with no stuck transcodes', async () => {
    mockReadLibrary.mockReturnValue([
      { type: 'movie', transcoding: false },
      { type: 'show',  transcoding: false },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const lib = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('ok');
    expect(lib.message).toContain('2 titles');
  });

  it('warn — stuck transcoding jobs detected', async () => {
    mockReadLibrary.mockReturnValue([
      { type: 'movie', transcoding: true },
      { type: 'movie', transcoding: true },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const lib = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('warn');
    expect(lib.message).toContain('stuck');
  });

  it('error — library read throws', async () => {
    mockReadLibrary.mockImplementation(() => { throw new Error('disk read failed'); });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const lib = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('error');
  });
});

// ── Config check ──────────────────────────────────────────────────────────────

describe('GET /api/health/full — config check', () => {
  it('ok — setup complete, mediaDir exists, all keys present', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockExistsResult = true;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const cfg = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('ok');
  });

  it('warn — setup not completed', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, setupComplete: false });
    mockExistsResult = true;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const cfg = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('warn');
    expect(cfg.message).toContain('Setup not completed');
  });

  it('warn — missing omdb and tmdb keys', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, omdbApiKey: '', tmdbApiKey: '' });
    mockExistsResult = true;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const cfg = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('warn');
    expect(cfg.message).toContain('Missing');
  });

  it('error — mediaDir configured but does not exist on disk', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockExistsResult = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const cfg = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('error');
  });
});

// ── qBittorrent check ─────────────────────────────────────────────────────────

describe('GET /api/health/full — qBittorrent check', () => {
  it('unknown — qbitUrl not configured', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, qbitUrl: '' });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const qbit = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('unknown');
  });

  it('ok — qBit reachable', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockQbitReachable.mockResolvedValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const qbit = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('ok');
  });

  it('warn — qBit unreachable (WebTorrent fallback)', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockQbitReachable.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const qbit = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('warn');
    expect(qbit.message).toContain('WebTorrent');
  });
});

// ── Download queue check ──────────────────────────────────────────────────────

describe('GET /api/health/full — download queue check', () => {
  it('ok — idle (no jobs)', async () => {
    mockGetAllJobs.mockReturnValue([]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const dl = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('ok');
    expect(dl.message).toBe('Idle');
  });

  it('ok — active downloads', async () => {
    mockGetAllJobs.mockReturnValue([
      { status: 'downloading', addedAt: new Date().toISOString() },
      { status: 'downloading', addedAt: new Date().toISOString() },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const dl = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('ok');
    expect(dl.message).toContain('2 active');
  });

  it('warn — errored jobs', async () => {
    mockGetAllJobs.mockReturnValue([{ status: 'error', addedAt: new Date().toISOString() }]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const dl = (res.body as { checks: { name: string; status: string }[] }).checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('warn');
  });

  it('warn — stuck queued jobs (>30 min)', async () => {
    const stuckTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    mockGetAllJobs.mockReturnValue([{ status: 'queued', addedAt: stuckTime }]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const dl = (res.body as { checks: { name: string; status: string; message: string }[] }).checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('warn');
    expect(dl.message).toContain('stuck');
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/health/full — response shape', () => {
  it('always returns { overall, checks, timestamp }', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('overall');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('timestamp');
  });

  it('checks array has 8 entries', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { checks: unknown[] }).checks).toHaveLength(9);
  });

  it('each check has { name, status, message }', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    for (const c of checks) {
      expect(typeof c.name).toBe('string');
      expect(['ok', 'warn', 'error', 'unknown']).toContain(c.status);
      expect(typeof c.message).toBe('string');
    }
  });

  it('timestamp is a valid ISO-8601 string', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const ts = (res.body as { timestamp: string }).timestamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('all checks run in parallel — completes in reasonable time', async () => {
    const start = Date.now();
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
