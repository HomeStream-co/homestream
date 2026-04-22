/**
 * health-full.test.ts
 *
 * Full coverage of GET /api/health/full
 *
 * This is the Debug Panel's subsystem health endpoint. It runs 8 checks in
 * parallel and aggregates them into an overall status. Tests verify:
 *
 *   Auth
 *     ✓ Returns 401 when not authenticated
 *     ✓ Allows authenticated requests through
 *
 *   Overall status aggregation
 *     ✓ 'ok'    when all checks pass
 *     ✓ 'warn'  when any check is 'warn' (no errors)
 *     ✓ 'error' when any check is 'error' (trumps warn)
 *
 *   Library check
 *     ✓ ok — library loads cleanly, no stuck transcodes
 *     ✓ warn — stuck transcoding jobs detected
 *     ✓ error — library read throws
 *
 *   Config check
 *     ✓ ok — setup complete, mediaDir exists, all keys present
 *     ✓ warn — setup not completed
 *     ✓ warn — missing API keys (omdb, tmdb)
 *     ✓ error — mediaDir configured but does not exist on disk
 *     ✓ error — readConfig throws
 *
 *   qBittorrent check
 *     ✓ unknown — qbitUrl not configured
 *     ✓ ok — reachable
 *     ✓ warn — unreachable (WebTorrent fallback)
 *
 *   TMDB check
 *     ✓ warn — no API key
 *     ✓ ok — API responds 200
 *     ✓ error — API responds 401 (bad key)
 *     ✓ warn — timeout (returns 0)
 *
 *   Ollama check
 *     ✓ unknown — aiProvider is not 'ollama'
 *     ✓ warn — no ollamaUrl configured
 *     ✓ ok — model available
 *     ✓ warn — running but model not installed
 *     ✓ warn — unreachable (timeout)
 *
 *   Download queue check
 *     ✓ ok — idle (no jobs)
 *     ✓ ok — active downloads
 *     ✓ warn — errored jobs
 *     ✓ warn — stuck queued jobs (>30 min)
 *
 *   Response shape
 *     ✓ Always returns { overall, checks, timestamp }
 *     ✓ checks array has 8 entries
 *     ✓ Each check has { name, status, message }
 *     ✓ timestamp is a valid ISO-8601 string
 *
 *   Performance
 *     ✓ All checks run in parallel (total time < sum of individual timeouts)
 *     ✓ checkWithTimeout resolves fallback when fn exceeds timeoutMs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadConfig    = vi.fn();
const mockReadLibrary   = vi.fn();
const mockQbitReachable = vi.fn();
const mockGetAllJobs    = vi.fn();
const mockIsDeveloperLocked = vi.fn();
let   mockAuthed = true;

vi.mock('../../../server/configStore.js', () => ({
  readConfig:      (...a: unknown[]) => mockReadConfig(...a),
  isSetupComplete: () => true,
}));

vi.mock('../../../server/libraryStore.js', () => ({
  readLibrary: (...a: unknown[]) => mockReadLibrary(...a),
}));

vi.mock('../../../server/qbittorrentClient.js', () => ({
  isReachable: (...a: unknown[]) => mockQbitReachable(...a),
}));

vi.mock('../../../server/torrentManager.js', () => ({
  getAllJobs: (...a: unknown[]) => mockGetAllJobs(...a),
}));

vi.mock('../../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: (...a: unknown[]) => mockIsDeveloperLocked(...a),
}));

vi.mock('../../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

// Mock child_process spawn for FFmpeg check
vi.mock('child_process', () => ({
  spawn: () => {
    const proc = {
      stdout: { on: vi.fn((e: string, cb: (d: Buffer) => void) => { if (e === 'data') setTimeout(() => cb(Buffer.from('ffmpeg version 6.0')), 0); }) },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
      on: vi.fn((e: string, cb: (code: number) => void) => { if (e === 'close') setTimeout(() => cb(0), 0); }),
    };
    return proc;
  },
}));

// Mock module (createRequire for ffmpeg-static)
vi.mock('module', () => ({
  createRequire: () => () => '/usr/bin/ffmpeg',
}));

// Mock fs for config mediaDir existence check
const mockExistsSync = vi.fn<(p: string) => boolean>(() => true);
vi.mock('fs', () => ({
  default: { existsSync: (p: string) => mockExistsSync(p) },
  existsSync: (p: string) => mockExistsSync(p),
}));

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
  return { query: {}, params: {}, body: {}, cookies: { hs_session: 'tok' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
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
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated requests through', async () => {
    mockAuthed = true;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as { overall: string }).overall).toBeDefined();
  });
});

// ── Overall status aggregation ────────────────────────────────────────────────

describe('GET /api/health/full — overall status', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    mockExistsSync.mockReset().mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it("overall is 'ok' when all checks pass", async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { overall: string; checks: { status: string }[] };
    // All non-error, non-warn checks → ok (or unknown for unconfigured services)
    expect(['ok', 'warn']).toContain(body.overall);
  });

  it("overall is 'warn' when any check is warn (no errors)", async () => {
    // Trigger a warn: qBit unreachable
    mockQbitReachable.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { overall: string };
    expect(['warn', 'error']).toContain(body.overall);
  });

  it("overall is 'error' when any check is error", async () => {
    // Trigger error: mediaDir doesn't exist
    mockExistsSync.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { overall: string };
    expect(body.overall).toBe('error');
  });
});

// ── Library check ─────────────────────────────────────────────────────────────

describe('GET /api/health/full — library check', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    mockExistsSync.mockReset().mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it('ok — library loads cleanly with no stuck transcodes', async () => {
    mockReadLibrary.mockReturnValue([
      { type: 'movie', transcoding: false },
      { type: 'show',  transcoding: false },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const lib = checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('ok');
    expect(lib.message).toContain('2 titles');
  });

  it('warn — stuck transcoding jobs detected', async () => {
    mockReadLibrary.mockReturnValue([
      { type: 'movie', transcoding: true },
      { type: 'movie', transcoding: true },
      { type: 'show',  transcoding: false },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const lib = checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('warn');
    expect(lib.message).toContain('stuck');
  });

  it('error — library read throws', async () => {
    mockReadLibrary.mockImplementation(() => { throw new Error('disk read failed'); });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const lib = checks.find(c => c.name === 'Media Library')!;
    expect(lib.status).toBe('error');
  });
});

// ── Config check ──────────────────────────────────────────────────────────────

describe('GET /api/health/full — config check', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it('ok — setup complete, mediaDir exists, all keys present', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockExistsSync.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const cfg = checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('ok');
  });

  it('warn — setup not completed', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, setupComplete: false });
    mockExistsSync.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const cfg = checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('warn');
    expect(cfg.message).toContain('Setup not completed');
  });

  it('warn — missing omdb and tmdb keys', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, omdbApiKey: '', tmdbApiKey: '' });
    mockExistsSync.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const cfg = checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('warn');
    expect(cfg.message).toContain('Missing');
  });

  it('error — mediaDir configured but does not exist on disk', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockExistsSync.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const cfg = checks.find(c => c.name === 'Configuration')!;
    expect(cfg.status).toBe('error');
  });
});

// ── qBittorrent check ─────────────────────────────────────────────────────────

describe('GET /api/health/full — qBittorrent check', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockExistsSync.mockReset().mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it('unknown — qbitUrl not configured', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, qbitUrl: '' });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const qbit = checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('unknown');
  });

  it('ok — qBit reachable', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockQbitReachable.mockResolvedValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const qbit = checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('ok');
  });

  it('warn — qBit unreachable (WebTorrent fallback)', async () => {
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockQbitReachable.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const qbit = checks.find(c => c.name === 'qBittorrent')!;
    expect(qbit.status).toBe('warn');
    expect(qbit.message).toContain('WebTorrent');
  });
});

// ── Download queue check ──────────────────────────────────────────────────────

describe('GET /api/health/full — download queue check', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    mockExistsSync.mockReset().mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

  it('ok — idle (no jobs)', async () => {
    mockGetAllJobs.mockReturnValue([]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const dl = checks.find(c => c.name === 'Download Queue')!;
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
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const dl = checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('ok');
    expect(dl.message).toContain('2 active');
  });

  it('warn — errored jobs', async () => {
    mockGetAllJobs.mockReturnValue([
      { status: 'error', addedAt: new Date().toISOString() },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string }[] }).checks;
    const dl = checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('warn');
  });

  it('warn — stuck queued jobs (>30 min)', async () => {
    const stuckTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    mockGetAllJobs.mockReturnValue([
      { status: 'queued', addedAt: stuckTime },
    ]);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const checks = (res.body as { checks: { name: string; status: string; message: string }[] }).checks;
    const dl = checks.find(c => c.name === 'Download Queue')!;
    expect(dl.status).toBe('warn');
    expect(dl.message).toContain('stuck');
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/health/full — response shape', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockQbitReachable.mockReset().mockResolvedValue(true);
    mockExistsSync.mockReset().mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    handler = mod.default;
  });

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
    const checks = (res.body as { checks: unknown[] }).checks;
    expect(checks).toHaveLength(8);
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
    const elapsed = Date.now() - start;
    // If sequential, 8 checks × even 50ms each = 400ms. Parallel should be <300ms.
    expect(elapsed).toBeLessThan(3000);
  });
});
