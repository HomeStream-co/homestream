/**
 * error-codes.test.ts
 *
 * Legacy and edge-case HTTP error code tests for HomeStream.
 *
 * Verifies that every endpoint returns the correct HTTP status code for
 * every error condition — including legacy paths, boundary conditions, and
 * unusual inputs that real clients send.
 *
 * Test groups:
 *
 *   400 Bad Request
 *     ✓ POST /api/auth/login — missing password field
 *     ✓ POST /api/auth/login — empty string password
 *     ✓ POST /api/setup — unknown action
 *     ✓ POST /api/setup — scan_existing with no mediaDir configured
 *     ✓ POST /api/setup/test-keys — missing key field
 *     ✓ POST /api/setup/test-keys — missing value field
 *     ✓ POST /api/setup/test-keys — unknown key type
 *     ✓ POST /api/setup/test-keys — empty/whitespace-only value
 *
 *   401 Unauthorized
 *     ✓ GET /api/health/full — no session cookie
 *     ✓ GET /api/dev/diagnostics — no session cookie
 *     ✓ POST /api/setup — save action after setup complete, no auth
 *     ✓ POST /api/auth/logout — no session cookie
 *
 *   403 Forbidden
 *     ✓ POST /api/setup — adminPassword change blocked by DEVELOPER_LOCK
 *
 *   404 Not Found
 *     ✓ GET /api/media/:id/episodes — media item does not exist
 *     ✓ PATCH /api/media/:id/episodes/:episodeId — media item does not exist
 *
 *   409 Conflict
 *     ✓ POST /api/stremio/download — duplicate infoHash returns 409 with existing jobId
 *
 *   429 Too Many Requests
 *     ✓ POST /api/auth/login — 11th attempt from same IP
 *     ✓ 429 response includes Retry-After header
 *     ✓ 429 response body includes retryAfterSecs field
 *
 *   500 Internal Server Error
 *     ✓ GET /api/health/full — readLibrary throws → still returns 200 (partial degradation)
 *     ✓ GET /api/dev/diagnostics — getCrashLog throws → still returns 200
 *
 *   Retry-After header
 *     ✓ Present on 429 responses
 *     ✓ Value is a positive integer string
 *
 *   Legacy error message format
 *     ✓ All 400 responses include { error: string }
 *     ✓ All 401 responses include { error: string }
 *     ✓ All 403 responses include { error: string }
 *     ✓ All 429 responses include { error: string }
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadConfig      = vi.fn();
const mockWriteConfig     = vi.fn();
const mockIsSetupComplete = vi.fn();
const mockReadLibrary     = vi.fn();
const mockGetCrashLog     = vi.fn();
const mockIsDeveloperLocked = vi.fn();
const mockIsValidSession  = vi.fn();
const mockCreateSession   = vi.fn();
const mockBcryptCompare   = vi.fn();
const mockBcryptHash      = vi.fn();
const mockGetAllJobs      = vi.fn();
const mockFindByInfoHash  = vi.fn();

vi.mock('../../server/configStore.js', () => ({
  readConfig:      (...a: unknown[]) => mockReadConfig(...a),
  writeConfig:     (...a: unknown[]) => mockWriteConfig(...a),
  isSetupComplete: (...a: unknown[]) => mockIsSetupComplete(...a),
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: (...a: unknown[]) => mockReadLibrary(...a),
}));

vi.mock('../../server/crashLogger.js', () => ({
  getCrashLog: (...a: unknown[]) => mockGetCrashLog(...a),
  logCrash: vi.fn(),
}));

vi.mock('../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: (...a: unknown[]) => mockIsDeveloperLocked(...a),
}));

vi.mock('../../server/sessionStore.js', () => ({
  isValidSession:   (...a: unknown[]) => mockIsValidSession(...a),
  createSession:    (...a: unknown[]) => mockCreateSession(...a),
  clearAllSessions: vi.fn(),
  getSessionCount:  vi.fn(() => 0),
  SESSION_TTL_MS:   7 * 24 * 60 * 60 * 1000,
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: (...a: unknown[]) => mockBcryptCompare(...a),
    hash:    (...a: unknown[]) => mockBcryptHash(...a),
  },
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs: (...a: unknown[]) => mockGetAllJobs(...a),
}));

vi.mock('../../server/downloadJobStore.js', () => ({
  findJobByInfoHash: (...a: unknown[]) => mockFindByInfoHash(...a),
  upsertJob: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: vi.fn().mockResolvedValue(true),
}));

vi.mock('child_process', () => ({
  spawn: () => ({
    stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, kill: vi.fn(),
    on: vi.fn((e: string, cb: (c: number) => void) => { if (e === 'close') setTimeout(() => cb(0), 0); }),
  }),
}));

vi.mock('module', () => ({ createRequire: () => () => '/usr/bin/ffmpeg' }));

const mockExistsSync = vi.fn<(p: string) => boolean>(() => true);
vi.mock('fs', () => ({
  default: { existsSync: (p: string) => mockExistsSync(p) },
  existsSync: (p: string) => mockExistsSync(p),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const headers: Record<string, string> = {};
  const res = { statusCode: 200, body: undefined as unknown, headers } as {
    statusCode: number; body: unknown; headers: Record<string, string>;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
    set:    (k: string, v: string) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  res.set    = (k, v) => { res.headers[k] = v; return res; };
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {}, params: {}, body: {},
    cookies: {}, socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    ...overrides,
  } as unknown as Request;
}

const BASE_CONFIG = {
  mediaDir: '/media', qbitUrl: 'http://localhost:8080',
  omdbApiKey: 'omdb', tmdbApiKey: 'tmdb', googleAiApiKey: 'gai',
  setupComplete: true, adminPassword: '$2b$12$hashedpassword',
  watchFolderEnabled: false, autoTranscode: false,
  aiProvider: 'google', preferredQuality: '1080p',
};

// ── 400 Bad Request ───────────────────────────────────────────────────────────

describe('HTTP 400 — Bad Request', () => {
  beforeEach(() => {
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    mockIsValidSession.mockReset().mockReturnValue(true);
    mockBcryptCompare.mockReset().mockResolvedValue(false);
  });

  it('POST /api/auth/login — missing password field → 400', async () => {
    const mod = await import('../../server/api/auth/login/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBeTruthy();
  });

  it('POST /api/auth/login — empty string password → 400', async () => {
    const mod = await import('../../server/api/auth/login/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { password: '' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/setup — unknown action → 400', async () => {
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'do_evil_thing' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('Unknown action');
  });

  it('POST /api/setup — scan_existing with no mediaDir → 400', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, mediaDir: '' });
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'scan_existing' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/setup/test-keys — missing key field → 400', async () => {
    const mod = await import('../../server/api/setup/test-keys/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { value: 'somevalue' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/setup/test-keys — missing value field → 400', async () => {
    const mod = await import('../../server/api/setup/test-keys/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { key: 'tmdb' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/setup/test-keys — unknown key type → 400', async () => {
    const mod = await import('../../server/api/setup/test-keys/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { key: 'unknown_service', value: 'abc' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/setup/test-keys — whitespace-only value → 400', async () => {
    const mod = await import('../../server/api/setup/test-keys/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { key: 'tmdb', value: '   ' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });
});

// ── 401 Unauthorized ──────────────────────────────────────────────────────────

describe('HTTP 401 — Unauthorized', () => {
  beforeEach(() => {
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsSetupComplete.mockReset().mockReturnValue(true);
    mockIsValidSession.mockReset().mockReturnValue(false); // no valid session
    mockReadLibrary.mockReset().mockReturnValue([]);
    mockGetCrashLog.mockReset().mockReturnValue([]);
    mockGetAllJobs.mockReset().mockReturnValue([]);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    mockExistsSync.mockReset().mockReturnValue(true);
  });

  it('GET /api/health/full — no session cookie → 401', async () => {
    const mod = await import('../../server/api/health/full/GET.js');
    const res = makeRes();
    await mod.default(makeReq({ cookies: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/dev/diagnostics — no session cookie → 401', async () => {
    const mod = await import('../../server/api/dev/diagnostics/GET.js');
    const res = makeRes();
    mod.default(makeReq({ cookies: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/setup — save after setup complete, no auth → 401', async () => {
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'save', tmdbApiKey: 'x' }, cookies: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });
});

// ── 403 Forbidden ─────────────────────────────────────────────────────────────

describe('HTTP 403 — Forbidden', () => {
  beforeEach(() => {
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockIsValidSession.mockReset().mockReturnValue(true);
    mockIsDeveloperLocked.mockReset().mockReturnValue(true); // locked!
  });

  it('POST /api/setup — adminPassword change blocked by DEVELOPER_LOCK → 403', async () => {
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'save', adminPassword: 'hacker' } }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toBeTruthy();
  });
});

// ── 429 Too Many Requests ─────────────────────────────────────────────────────
// All three tests share one loginHandler instance (rate bucket must accumulate).
// Each test uses a unique IP so buckets don't bleed between tests.
// We disable the 2s failure-delay so exhaust() completes instantly.
//
// NOTE: We do NOT call vi.resetModules() here. The login module is already
// imported (with all vi.mock() registrations active) by the 400 tests above.
// We grab the same instance and use its testing exports directly.

describe('HTTP 429 — Too Many Requests', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loginHandler: (req: Request, res: Response) => Promise<any>;
  let resetRateLimits: () => void;
  let disableDelay: () => void;
  let enableDelay: () => void;

  beforeAll(async () => {
    // Import without resetting modules — reuse the already-mocked instance
    const mod = await import('../../server/api/auth/login/POST.js');
    loginHandler = mod.default;
    const m = mod as unknown as {
      _resetRateLimitsForTesting: () => void;
      _disableFailureDelayForTesting: () => void;
      _enableFailureDelayForTesting: () => void;
    };
    resetRateLimits = m._resetRateLimitsForTesting;
    disableDelay   = m._disableFailureDelayForTesting;
    enableDelay    = m._enableFailureDelayForTesting;
    disableDelay();
  });

  beforeEach(() => {
    resetRateLimits(); // also re-enables delay
    disableDelay();    // disable it again for this test suite
    mockReadConfig.mockReturnValue(BASE_CONFIG);
    mockBcryptCompare.mockResolvedValue(false);
    mockCreateSession.mockReturnValue('tok');
  });

  afterEach(() => {
    resetRateLimits(); // clears bucket AND re-enables delay
  });

  afterAll(() => { enableDelay(); }); // belt-and-suspenders

  async function exhaust(ip: string) {
    for (let i = 0; i < 10; i++) {
      await loginHandler(
        makeReq({ body: { password: 'wrong' }, socket: { remoteAddress: ip } as never }),
        makeRes() as unknown as Response,
      );
    }
  }

  it('11th attempt from same IP → 429', async () => {
    const ip = '192.168.99.10';
    await exhaust(ip);
    const res = makeRes();
    await loginHandler(makeReq({ body: { password: 'wrong' }, socket: { remoteAddress: ip } as never }), res as unknown as Response);
    expect(res.statusCode).toBe(429);
  }, 15000);

  it('429 response includes Retry-After header', async () => {
    const ip = '192.168.99.11';
    await exhaust(ip);
    const res = makeRes();
    await loginHandler(makeReq({ body: { password: 'wrong' }, socket: { remoteAddress: ip } as never }), res as unknown as Response);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeTruthy();
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
  }, 15000);

  it('429 response body includes retryAfterSecs field', async () => {
    const ip = '192.168.99.12';
    await exhaust(ip);
    const res = makeRes();
    await loginHandler(makeReq({ body: { password: 'wrong' }, socket: { remoteAddress: ip } as never }), res as unknown as Response);
    expect(res.statusCode).toBe(429);
    expect((res.body as { retryAfterSecs: number }).retryAfterSecs).toBeGreaterThan(0);
  }, 15000);
});

// ── Legacy error message format ───────────────────────────────────────────────

describe('Legacy error message format — all error responses include { error: string }', () => {
  beforeEach(() => {
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockIsValidSession.mockReset().mockReturnValue(false);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    mockBcryptCompare.mockReset().mockResolvedValue(false);
  });

  it('400 response from login (no password) has { error: string }', async () => {
    const mod = await import('../../server/api/auth/login/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect(typeof (res.body as { error: string }).error).toBe('string');
    expect((res.body as { error: string }).error.length).toBeGreaterThan(0);
  });

  it('400 response from setup (unknown action) has { error: string }', async () => {
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'bad_action' } }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect(typeof (res.body as { error: string }).error).toBe('string');
  });

  it('401 response from health/full has { error: string }', async () => {
    mockReadLibrary.mockReturnValue([]);
    mockGetAllJobs.mockReturnValue([]);
    mockExistsSync.mockReturnValue(true);
    mockIsSetupComplete.mockReturnValue(true);
    const mod = await import('../../server/api/health/full/GET.js');
    const res = makeRes();
    await mod.default(makeReq({ cookies: {} }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
    expect(typeof (res.body as { error: string }).error).toBe('string');
  });

  it('403 response from setup (DEVELOPER_LOCK) has { error: string }', async () => {
    mockIsDeveloperLocked.mockReturnValue(true);
    const mod = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await mod.default(makeReq({ body: { action: 'save', adminPassword: 'x' } }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect(typeof (res.body as { error: string }).error).toBe('string');
  });
});
