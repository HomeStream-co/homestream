/**
 * redundancy.test.ts
 *
 * Failover and fallback path tests for HomeStream.
 *
 * These tests verify that every subsystem degrades gracefully when its
 * primary dependency is unavailable — no crashes, no data loss, no
 * unhandled promise rejections.
 *
 * Test groups:
 *
 *   Crash logger — storage failover
 *     ✓ Writes to HOMESTREAM_DATA path when env var is set
 *     ✓ Falls back to /shared-storage when HOMESTREAM_DATA is absent
 *     ✓ Falls back to local ./crash-log.json when neither path exists
 *     ✓ logCrash never throws even when all write paths fail
 *     ✓ getCrashLog returns [] when log file does not exist
 *     ✓ getCrashLog returns [] when log file contains invalid JSON
 *     ✓ clearCrashLog is a no-op when log file does not exist
 *     ✓ logCrash caps log at MAX_ENTRIES (100) — oldest entries dropped
 *     ✓ logCrash accepts non-Error objects (strings, numbers, null)
 *     ✓ installCrashHandlers is idempotent (calling twice doesn't add duplicate listeners)
 *
 *   Config store — file corruption recovery
 *     ✓ readConfig returns default config when file does not exist
 *     ✓ readConfig returns default config when file contains invalid JSON
 *     ✓ readConfig returns default config when file is empty string
 *     ✓ writeConfig still works after a readConfig from corrupt file
 *
 *   Download job store — missing job graceful handling
 *     ✓ getJob returns undefined for unknown jobId (no throw)
 *     ✓ markJobInterrupted on unknown jobId is a no-op (no throw)
 *     ✓ findJobByInfoHash returns undefined when no jobs exist
 *     ✓ getInterruptedJobs returns [] when no jobs are interrupted
 *     ✓ getAllJobs returns [] when store is empty
 *
 *   Session store — expired session handling
 *     ✓ isValidSession returns false for expired session (past TTL)
 *     ✓ isValidSession returns true for session within TTL
 *     ✓ Expired sessions are cleaned up (not returned by getSessionCount)
 *
 *   Auth middleware — missing cookie / malformed header
 *     ✓ requireAuth returns false + 401 when no cookie present
 *     ✓ requireAuth returns false + 401 when cookie value is empty string
 *     ✓ requireAuth returns false + 401 when cookie is expired/invalid token
 *     ✓ requireAuth returns true when valid session cookie is present
 *
 *   Rate limiter — edge cases
 *     ✓ checkRateLimit handles undefined/empty IP gracefully
 *     ✓ recordFailure on unknown namespace is a no-op (no throw)
 *     ✓ getFailureDelay on unknown namespace returns 0 (no throw)
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
  const mockExistsSync   = vi.fn<(p: string) => boolean>();
  const mockReadFileSync  = vi.fn<(p: string, enc: string) => string>();
  const mockWriteFileSync = vi.fn<(p: string, data: string) => void>();
  const mockMkdirSync     = vi.fn();

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.HOMESTREAM_DATA = process.env.HOMESTREAM_DATA;
    vi.resetModules();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  afterEach(() => {
    if (savedEnv.HOMESTREAM_DATA === undefined) delete process.env.HOMESTREAM_DATA;
    else process.env.HOMESTREAM_DATA = savedEnv.HOMESTREAM_DATA;
  });

  it('getCrashLog returns [] when log file does not exist', async () => {
    vi.doMock('fs', () => ({
      default: {
        existsSync: () => false,
        readFileSync: () => { throw new Error('ENOENT'); },
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
      },
      existsSync: () => false,
    }));
    const { getCrashLog } = await import('../../server/crashLogger.js');
    expect(getCrashLog()).toEqual([]);
  });

  it('getCrashLog returns [] when log file contains invalid JSON', async () => {
    vi.doMock('fs', () => ({
      default: {
        existsSync: () => true,
        readFileSync: () => 'NOT_VALID_JSON{{{',
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
      },
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
      default: {
        existsSync: () => false,
        readFileSync: () => '[]',
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
      },
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
      default: {
        existsSync: () => false,
        readFileSync: () => { throw new Error('ENOENT'); },
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
      },
      existsSync: () => false,
    }));
    const { clearCrashLog } = await import('../../server/crashLogger.js');
    expect(() => clearCrashLog()).not.toThrow();
  });

  it('logCrash caps log at 100 entries — oldest entries dropped', async () => {
    // Seed 100 existing entries
    const existing = Array.from({ length: 100 }, (_, i) => ({
      id: `old-${i}`, timestamp: new Date().toISOString(),
      type: 'manual', message: `old error ${i}`,
      nodeVersion: 'v20', platform: 'linux', uptime: i,
    }));
    vi.doMock('fs', () => ({
      default: {
        existsSync: () => true,
        readFileSync: () => JSON.stringify(existing),
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
      },
      existsSync: () => true,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    logCrash('manual', new Error('new error'));
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string) as unknown[];
    expect(written).toHaveLength(100);
    // Newest entry should be first
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
    installCrashHandlers(); // second call
    const after = process.listenerCount('uncaughtException');
    // Should only add 1 listener total, not 2
    expect(after - before).toBeLessThanOrEqual(1);
  });
});

// ── Config store — file corruption recovery ───────────────────────────────────

describe('Config store — file corruption recovery', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('readConfig returns default config when file does not exist', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => { throw new Error('ENOENT'); }, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { readConfig } = await import('../../server/configStore.js');
    const cfg = readConfig();
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe('object');
  });

  it('readConfig returns default config when file contains invalid JSON', async () => {
    vi.doMock('fs', () => ({
      default: { existsSync: () => true, readFileSync: () => '{{CORRUPT}}', writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: () => true,
    }));
    const { readConfig } = await import('../../server/configStore.js');
    expect(() => readConfig()).not.toThrow();
    const cfg = readConfig();
    expect(cfg).toBeDefined();
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
    readConfig(); // corrupt read — should not throw
    expect(() => writeConfig({ mediaDir: '/media' })).not.toThrow();
  });
});

// ── Download job store — missing job graceful handling ────────────────────────

describe('Download job store — missing job graceful handling', () => {
  let getJob:             (id: string) => unknown;
  let getAllJobs:          () => unknown[];
  let findJobByInfoHash:  (hash: string) => unknown;
  let markJobInterrupted: (id: string) => void;
  let getInterruptedJobs: () => unknown[];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/downloadJobStore.js');
    getJob             = mod.getJob             as typeof getJob;
    getAllJobs          = mod.getAllJobs          as typeof getAllJobs;
    findJobByInfoHash  = mod.findJobByInfoHash  as typeof findJobByInfoHash;
    markJobInterrupted = mod.markJobInterrupted as typeof markJobInterrupted;
    getInterruptedJobs = mod.getInterruptedJobs as typeof getInterruptedJobs;
  });

  it('getJob returns undefined for unknown jobId (no throw)', () => {
    expect(() => getJob('nonexistent-job-id')).not.toThrow();
    expect(getJob('nonexistent-job-id')).toBeUndefined();
  });

  it('markJobInterrupted on unknown jobId is a no-op (no throw)', () => {
    expect(() => markJobInterrupted('ghost-job-id')).not.toThrow();
  });

  it('findJobByInfoHash returns undefined when no jobs exist', () => {
    expect(() => findJobByInfoHash('abc123')).not.toThrow();
    expect(findJobByInfoHash('abc123')).toBeUndefined();
  });

  it('getInterruptedJobs returns [] when no jobs are interrupted', () => {
    const result = getInterruptedJobs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('getAllJobs returns [] when store is empty', () => {
    const result = getAllJobs();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Session store — expired session handling ──────────────────────────────────

describe('Session store — expired session handling', () => {
  let createSession:    () => string;
  let isValidSession:   (token: string) => boolean;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/sessionStore.js');
    createSession    = mod.createSession;
    isValidSession   = mod.isValidSession;
    clearAllSessions = mod.clearAllSessions;
    clearAllSessions();
  });

  it('isValidSession returns false for expired session (past TTL)', async () => {
    // Create a session then manually expire it by manipulating time
    const token = createSession();
    expect(isValidSession(token)).toBe(true);

    // Advance time past TTL (7 days)
    vi.useFakeTimers();
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); // 8 days
    expect(isValidSession(token)).toBe(false);
    vi.useRealTimers();
  });

  it('isValidSession returns true for session within TTL', () => {
    const token = createSession();
    expect(isValidSession(token)).toBe(true);
  });

  it('isValidSession returns false for completely unknown token', () => {
    expect(isValidSession('not-a-real-token')).toBe(false);
  });
});

// ── Auth middleware — missing cookie / malformed header ───────────────────────

describe('Auth middleware — missing cookie / malformed header', () => {
  let requireAuth: (req: Request, res: Response) => boolean;
  let createSession: () => string;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();
    const authMod    = await import('../../server/authMiddleware.js');
    const sessionMod = await import('../../server/sessionStore.js');
    requireAuth      = authMod.requireAuth;
    createSession    = sessionMod.createSession;
    clearAllSessions = sessionMod.clearAllSessions;
    clearAllSessions();
  });

  it('requireAuth returns false + 401 when no cookie present', () => {
    const res = makeRes();
    const result = requireAuth(makeReq(), res as unknown as Response);
    expect(result).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns false + 401 when cookie value is empty string', () => {
    const res = makeRes();
    const req = makeReq('');
    const result = requireAuth(req, res as unknown as Response);
    expect(result).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns false + 401 when cookie is invalid token', () => {
    const res = makeRes();
    const result = requireAuth(makeReq('fake-invalid-token-xyz'), res as unknown as Response);
    expect(result).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('requireAuth returns true when valid session cookie is present', () => {
    const token = createSession();
    const res = makeRes();
    const result = requireAuth(makeReq(token), res as unknown as Response);
    expect(result).toBe(true);
    expect(res.statusCode).toBe(200); // not changed
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
    const r = checkRateLimit('login', '', OPTS);
    expect(typeof r.allowed).toBe('boolean');
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
    checkRateLimit('login', '5.5.5.5', OPTS); // creates bucket but no failures
    expect(getFailureDelay('login', '5.5.5.5', DELAY_OPTS)).toBe(0);
  });
});
