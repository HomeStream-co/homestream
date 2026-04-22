/**
 * redundancy.test.ts
 *
 * Failover and fallback path tests for HomeStream.
 * Every subsystem must degrade gracefully when its primary dependency fails.
 *
 * Groups:
 *   - Crash logger: storage failover, corrupt JSON, MAX_ENTRIES cap, idempotent handlers
 *   - Config store: corrupt file recovery, empty file, write after corrupt read
 *   - Download job store: missing job graceful handling
 *   - Session store: expired session, unknown token
 *   - Auth middleware: missing/empty/invalid cookie
 *   - Rate limiter: edge-case IPs, unknown namespace
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

function makeReq(cookieToken?: string): Request {
  return {
    query: {}, params: {}, body: {},
    cookies: cookieToken ? { hs_session: cookieToken } : {},
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  } as unknown as Request;
}

// ── Crash logger — storage failover ──────────────────────────────────────────

describe('Crash logger — storage failover', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.HOMESTREAM_DATA = process.env.HOMESTREAM_DATA;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedEnv.HOMESTREAM_DATA === undefined) delete process.env.HOMESTREAM_DATA;
    else process.env.HOMESTREAM_DATA = savedEnv.HOMESTREAM_DATA;
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('getCrashLog returns [] when log file does not exist', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => { throw new Error('ENOENT'); }, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { getCrashLog } = await import('../../server/crashLogger.js');
    expect(getCrashLog()).toEqual([]);
  });

  it('getCrashLog returns [] when log file contains invalid JSON', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => 'NOT_VALID_JSON{{{', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { getCrashLog } = await import('../../server/crashLogger.js');
    expect(getCrashLog()).toEqual([]);
  });

  it('logCrash never throws even when all write paths fail', async () => {
    vi.doMock('fs', () => ({
      default: {
        existsSync: () => false,
        readFileSync: () => '[]',
        writeFileSync: () => { throw new Error('disk full'); },
        mkdirSync: () => { throw new Error('permission denied'); },
      },
      existsSync: () => false,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    expect(() => logCrash('manual', new Error('test error'))).not.toThrow();
  });

  it('logCrash accepts non-Error objects (strings, numbers, null)', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => '[]', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    expect(() => logCrash('manual', 'string error')).not.toThrow();
    expect(() => logCrash('manual', 42)).not.toThrow();
    expect(() => logCrash('manual', null)).not.toThrow();
    expect(() => logCrash('manual', { code: 'ERR_CUSTOM' })).not.toThrow();
  });

  it('clearCrashLog is a no-op when log file does not exist', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => { throw new Error('ENOENT'); }, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { clearCrashLog } = await import('../../server/crashLogger.js');
    expect(() => clearCrashLog()).not.toThrow();
  });

  it('logCrash caps log at 100 entries — oldest entries dropped', async () => {
    const mockWrite = vi.fn();
    const existing = Array.from({ length: 100 }, (_, i) => ({
      id: `old-${i}`, timestamp: new Date().toISOString(),
      type: 'manual', message: `old error ${i}`,
      nodeVersion: 'v20', platform: 'linux', uptime: i,
    }));
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => JSON.stringify(existing), writeFileSync: mockWrite, mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    logCrash('manual', new Error('new error'));
    const written = JSON.parse(mockWrite.mock.calls[0][1] as string) as unknown[];
    expect(written).toHaveLength(100);
    expect((written[0] as { message: string }).message).toBe('new error');
  });

  it('installCrashHandlers is idempotent (calling twice does not add duplicate listeners)', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => '[]', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { installCrashHandlers } = await import('../../server/crashLogger.js');
    const before = process.listenerCount('uncaughtException');
    installCrashHandlers();
    installCrashHandlers();
    const after = process.listenerCount('uncaughtException');
    expect(after - before).toBeLessThanOrEqual(1);
  });
});

// ── Config store — file corruption recovery ───────────────────────────────────

describe('Config store — file corruption recovery', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.doUnmock('fs'); vi.doUnmock('node:fs'); });

  it('readConfig returns default config when file does not exist', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => { throw new Error('ENOENT'); }, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { readConfig } = await import('../../server/configStore.js');
    expect(() => readConfig()).not.toThrow();
    expect(readConfig()).toBeDefined();
  });

  it('readConfig returns default config when file contains invalid JSON', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => '{{CORRUPT}}', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { readConfig } = await import('../../server/configStore.js');
    expect(() => readConfig()).not.toThrow();
    expect(readConfig()).toBeDefined();
  });

  it('readConfig returns default config when file is empty string', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => '', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { readConfig } = await import('../../server/configStore.js');
    expect(() => readConfig()).not.toThrow();
  });

  it('writeConfig still works after a readConfig from corrupt file', async () => {
    const mockWrite = vi.fn();
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => 'CORRUPT', writeFileSync: mockWrite, mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { readConfig, writeConfig } = await import('../../server/configStore.js');
    readConfig();
    expect(() => writeConfig({ mediaDir: '/media' })).not.toThrow();
  });
});

// ── Download job store — missing job graceful handling ────────────────────────

describe('Download job store — missing job graceful handling', () => {
  let getPersistedJob:    (id: string) => unknown;
  let getAllPersistedJobs: () => unknown[];
  let findJobByInfoHash:  (hash: string) => unknown;
  let markJobInterrupted: (id: string) => void;
  let getInterruptedJobs: () => unknown[];

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '[]'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '[]'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    vi.doMock('node:fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '[]'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '[]'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    const mod = await import('../../server/downloadJobStore.js');
    getPersistedJob    = mod.getPersistedJob    as typeof getPersistedJob;
    getAllPersistedJobs = mod.getAllPersistedJobs as typeof getAllPersistedJobs;
    findJobByInfoHash  = mod.findJobByInfoHash  as typeof findJobByInfoHash;
    markJobInterrupted = mod.markJobInterrupted as typeof markJobInterrupted;
    getInterruptedJobs = mod.getInterruptedJobs as typeof getInterruptedJobs;
  });

  afterEach(() => { vi.doUnmock('fs'); vi.doUnmock('node:fs'); });

  it('getPersistedJob returns undefined for unknown jobId (no throw)', () => {
    expect(() => getPersistedJob('nonexistent-job-id')).not.toThrow();
    expect(getPersistedJob('nonexistent-job-id')).toBeUndefined();
  });

  it('markJobInterrupted on unknown jobId is a no-op (no throw)', () => {
    expect(() => markJobInterrupted('ghost-job-id')).not.toThrow();
  });

  it('findJobByInfoHash returns undefined when no matching job', () => {
    expect(() => findJobByInfoHash('abc123')).not.toThrow();
    expect(findJobByInfoHash('abc123')).toBeUndefined();
  });

  it('getInterruptedJobs returns [] when no jobs are interrupted', () => {
    const result = getInterruptedJobs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('getAllPersistedJobs returns an array (empty or populated)', () => {
    expect(Array.isArray(getAllPersistedJobs())).toBe(true);
  });
});

// ── Session store — expired session handling ──────────────────────────────────
// sessionStore uses a write-through cache. We mock fs and flush the async
// write queue with Promise.resolve() chains before asserting.

describe('Session store — expired session handling', () => {
  let createSession:    () => string;
  let isValidSession:   (token: string) => boolean;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    vi.doMock('node:fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    const mod = await import('../../server/sessionStore.js');
    createSession    = mod.createSession;
    isValidSession   = mod.isValidSession;
    clearAllSessions = mod.clearAllSessions;
    // Flush startup prune write
    await Promise.resolve();
    await Promise.resolve();
    clearAllSessions();
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('isValidSession returns false for expired session (past TTL)', async () => {
    const token = createSession();
    await Promise.resolve();
    await Promise.resolve();
    expect(isValidSession(token)).toBe(true);
    vi.useFakeTimers();
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); // 8 days
    expect(isValidSession(token)).toBe(false);
  });

  it('isValidSession returns true for session within TTL', async () => {
    const token = createSession();
    await Promise.resolve();
    await Promise.resolve();
    expect(isValidSession(token)).toBe(true);
  });

  it('isValidSession returns false for completely unknown token', () => {
    expect(isValidSession('not-a-real-token')).toBe(false);
  });

  it('isValidSession returns false for empty string', () => {
    expect(isValidSession('')).toBe(false);
  });
});

// ── Auth middleware — missing cookie / malformed header ───────────────────────
// authMiddleware reads configStore + sessionStore. We mock both so
// ADMIN_PASSWORD env var doesn't interfere, and sessions are in-memory only.

describe('Auth middleware — missing cookie / malformed header', () => {
  let requireAuth:      (req: Request, res: Response) => boolean;
  let createSession:    () => string;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();
    // Mock fs for both sessionStore and configStore
    vi.doMock('fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    vi.doMock('node:fs', () => ({
      default: { existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    // Set a known admin password so auth is enforced
    const savedPw = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = 'test-password-for-auth-tests';
    // Mock configStore to return a config with adminPassword set
    vi.doMock('../../server/configStore.js', () => ({
      readConfig: () => ({ adminPassword: 'test-password-for-auth-tests' }),
      writeConfig: vi.fn(),
      isSetupComplete: () => true,
    }));
    // Mock the login POST isValidSession (used by authMiddleware)
    const sessionMod = await import('../../server/sessionStore.js');
    vi.doMock('../../server/api/auth/login/POST.js', () => ({
      isValidSession: sessionMod.isValidSession,
    }));
    const authMod = await import('../../server/authMiddleware.js');
    requireAuth      = authMod.requireAuth;
    createSession    = sessionMod.createSession;
    clearAllSessions = sessionMod.clearAllSessions;
    // Flush startup prune
    await Promise.resolve();
    await Promise.resolve();
    clearAllSessions();
    await Promise.resolve();
    // Restore env after setup
    if (savedPw === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = savedPw;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
    vi.doUnmock('../../server/configStore.js');
    vi.doUnmock('../../server/api/auth/login/POST.js');
  });

  it('requireAuth returns false + 401 when no cookie present', () => {
    const res = makeRes();
    expect(requireAuth(makeReq(), res as unknown as Response)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns false + 401 when cookie value is empty string', () => {
    const res = makeRes();
    expect(requireAuth(makeReq(''), res as unknown as Response)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns false + 401 when cookie is invalid token', () => {
    const res = makeRes();
    expect(requireAuth(makeReq('fake-invalid-token-xyz'), res as unknown as Response)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns true when valid session cookie is present', async () => {
    const token = createSession();
    await Promise.resolve();
    await Promise.resolve();
    const res = makeRes();
    expect(requireAuth(makeReq(token), res as unknown as Response)).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});

// ── Rate limiter — edge cases ─────────────────────────────────────────────────

describe('Rate limiter — edge cases', () => {
  let checkRateLimit:  (ns: string, ip: string, opts: { maxAttempts: number; windowMs: number }) => { allowed: boolean };
  let recordFailure:   (ns: string, ip: string) => void;
  let getFailureDelay: (ns: string, ip: string, opts: { delayAfter: number; delayMs: number }) => number;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/rateLimiter.js');
    checkRateLimit  = mod.checkRateLimit;
    recordFailure   = mod.recordFailure;
    getFailureDelay = mod.getFailureDelay;
  });

  const OPTS = { maxAttempts: 10, windowMs: 15 * 60 * 1000 };
  const DELAY_OPTS = { delayAfter: 5, delayMs: 2000 };

  it('checkRateLimit handles empty string IP gracefully', () => {
    expect(() => checkRateLimit('login', '', OPTS)).not.toThrow();
    expect(typeof checkRateLimit('login', '', OPTS).allowed).toBe('boolean');
  });

  it('checkRateLimit handles "unknown" IP gracefully', () => {
    expect(() => checkRateLimit('login', 'unknown', OPTS)).not.toThrow();
  });

  it('recordFailure on unknown namespace is a no-op (no throw)', () => {
    expect(() => recordFailure('nonexistent-namespace', '1.2.3.4')).not.toThrow();
  });

  it('getFailureDelay on unknown namespace returns 0 (no throw)', () => {
    expect(() => getFailureDelay('nonexistent-namespace', '1.2.3.4', DELAY_OPTS)).not.toThrow();
    expect(getFailureDelay('nonexistent-namespace', '1.2.3.4', DELAY_OPTS)).toBe(0);
  });

  it('getFailureDelay returns 0 for IP with no recorded failures', () => {
    checkRateLimit('login', '5.5.5.5', OPTS);
    expect(getFailureDelay('login', '5.5.5.5', DELAY_OPTS)).toBe(0);
  });
});
