/**
 * optimization.test.ts
 *
 * Performance and efficiency tests for HomeStream.
 * Validates that hot paths are fast, caches work, and no unnecessary
 * disk I/O or computation happens on repeated calls.
 *
 * Groups:
 *   - Session store: isValidSession hot-path speed (cache hit)
 *   - Config store: readConfig repeated calls (no repeated disk reads)
 *   - Rate limiter: checkRateLimit throughput under load
 *   - Download job store: upsert + lookup throughput
 *   - Library store: readLibrary repeated calls (write-through cache)
 *   - Crash logger: logCrash overhead (must be < 50ms per call)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Session store — isValidSession hot-path ───────────────────────────────────

describe('Session store — isValidSession hot-path performance', () => {
  let createSession:  () => string;
  let isValidSession: (token: string) => boolean;
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
    await Promise.resolve();
    await Promise.resolve();
    clearAllSessions();
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('1000 isValidSession calls on valid token complete in < 100ms (cache hit)', async () => {
    const token = createSession();
    await Promise.resolve();
    await Promise.resolve();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) isValidSession(token);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('1000 isValidSession calls on invalid token complete in < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) isValidSession('not-a-real-token');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('creating 500 sessions does not degrade lookup speed', async () => {
    for (let i = 0; i < 500; i++) createSession();
    await Promise.resolve();
    await Promise.resolve();
    const token = createSession();
    await Promise.resolve();
    await Promise.resolve();
    const start = performance.now();
    for (let i = 0; i < 200; i++) isValidSession(token);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Config store — repeated readConfig calls ──────────────────────────────────

describe('Config store — readConfig repeated call performance', () => {
  let readConfig:  () => Record<string, unknown>;
  let writeConfig: (p: Record<string, unknown>) => Record<string, unknown>;
  let mockReadFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockReadFileSync = vi.fn(() => '{}');
    vi.doMock('fs', () => ({
      default: { existsSync: vi.fn(() => true), readFileSync: mockReadFileSync, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => true), readFileSync: mockReadFileSync, writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    vi.doMock('node:fs', () => ({
      default: { existsSync: vi.fn(() => true), readFileSync: mockReadFileSync, writeFileSync: vi.fn(), mkdirSync: vi.fn() },
      existsSync: vi.fn(() => true), readFileSync: mockReadFileSync, writeFileSync: vi.fn(), mkdirSync: vi.fn(),
    }));
    const mod = await import('../../server/configStore.js');
    readConfig  = mod.readConfig  as typeof readConfig;
    writeConfig = mod.writeConfig as typeof writeConfig;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('500 readConfig calls complete in < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < 500; i++) readConfig();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('writeConfig returns the merged config synchronously', () => {
    const result = writeConfig({ mediaDir: '/fast' });
    expect(result).toBeDefined();
    expect((result as { mediaDir: string }).mediaDir).toBe('/fast');
  });

  it('100 writeConfig + readConfig cycles complete in < 200ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      writeConfig({ mediaDir: `/path-${i}` });
      readConfig();
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

// ── Rate limiter — throughput under load ──────────────────────────────────────

describe('Rate limiter — throughput under load', () => {
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

  it('10,000 checkRateLimit calls across 1000 unique IPs complete in < 500ms', () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      checkRateLimit('login', `192.168.${Math.floor(i / 256) % 256}.${i % 256}`, OPTS);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('1000 recordFailure calls complete in < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) recordFailure('login', `10.0.${i % 256}.1`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('1000 getFailureDelay calls complete in < 100ms', () => {
    const ip = '10.99.0.1';
    checkRateLimit('login', ip, OPTS);
    for (let i = 0; i < 5; i++) recordFailure('login', ip);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) getFailureDelay('login', ip, DELAY_OPTS);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('rate limiter correctly blocks after maxAttempts regardless of call speed', () => {
    const ip = '10.100.0.1';
    for (let i = 0; i < 10; i++) checkRateLimit('login', ip, OPTS);
    // 11th must be blocked
    expect(checkRateLimit('login', ip, OPTS).allowed).toBe(false);
  });
});

// ── Download job store — upsert + lookup throughput ───────────────────────────

describe('Download job store — upsert + lookup throughput', () => {
  let upsertJob:         (job: Record<string, unknown>) => void;
  let getPersistedJob:   (id: string) => unknown;
  let findJobByInfoHash: (hash: string) => unknown;

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
    upsertJob         = mod.upsertJob         as typeof upsertJob;
    getPersistedJob   = mod.getPersistedJob   as typeof getPersistedJob;
    findJobByInfoHash = mod.findJobByInfoHash as typeof findJobByInfoHash;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('200 upsertJob calls complete in < 200ms', async () => {
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      upsertJob({ jobId: `job-${i}`, infoHash: `hash-${i}`, title: `Movie ${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await Promise.resolve();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('getPersistedJob lookup is O(1)-ish — 1000 lookups in < 100ms', async () => {
    for (let i = 0; i < 100; i++) {
      upsertJob({ jobId: `perf-job-${i}`, infoHash: `ph-${i}`, title: `T${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await Promise.resolve();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) getPersistedJob(`perf-job-${i % 100}`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('findJobByInfoHash across 100 jobs completes in < 100ms for 500 lookups', async () => {
    for (let i = 0; i < 100; i++) {
      upsertJob({ jobId: `hash-job-${i}`, infoHash: `unique-hash-${i}`, title: `T${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await Promise.resolve();
    const start = performance.now();
    for (let i = 0; i < 500; i++) findJobByInfoHash(`unique-hash-${i % 100}`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Crash logger — logCrash overhead ─────────────────────────────────────────

describe('Crash logger — logCrash overhead', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.doUnmock('fs'); vi.doUnmock('node:fs'); });

  it('logCrash completes in < 50ms per call (no blocking I/O)', async () => {
    const mockWrite = vi.fn();
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => '[]', writeFileSync: mockWrite, mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    const start = performance.now();
    logCrash('manual', new Error('perf test'));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('10 rapid logCrash calls complete in < 200ms total', async () => {
    const mockWrite = vi.fn();
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => '[]', writeFileSync: mockWrite, mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    const start = performance.now();
    for (let i = 0; i < 10; i++) logCrash('manual', new Error(`error ${i}`));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('logCrash with non-Error types does not add overhead', async () => {
    const mockWrite = vi.fn();
    vi.doMock('fs', () => ({
      default: { existsSync: () => false, readFileSync: () => '[]', writeFileSync: mockWrite, mkdirSync: vi.fn() },
      existsSync: () => false,
    }));
    const { logCrash } = await import('../../server/crashLogger.js');
    const start = performance.now();
    logCrash('manual', 'string error');
    logCrash('manual', 42);
    logCrash('manual', null);
    logCrash('manual', { code: 'ERR_CUSTOM' });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
