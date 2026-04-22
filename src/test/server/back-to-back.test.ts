/**
 * back-to-back.test.ts
 *
 * Back-to-back (concurrent + sequential stress) tests for HomeStream.
 * Verifies no race conditions, no state bleed, no double-writes.
 *
 * Groups:
 *   - Rate limiter: sequential/concurrent burst, IP isolation, failure delays
 *   - Download job store: 50 sequential upserts, 20 concurrent, duplicate detection
 *   - Session store: 100 unique tokens, bulk validity, clearAll
 *   - Config store: sequential partial writes merge, no field loss
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Rate limiter ──────────────────────────────────────────────────────────────

describe('Rate limiter — back-to-back login attempts', () => {
  let checkRateLimit:  (ns: string, ip: string, opts: { maxAttempts: number; windowMs: number }) => { allowed: boolean; retryAfterSecs?: number };
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

  it('10 sequential attempts from same IP → all allowed (boundary)', () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('login', ip, OPTS).allowed).toBe(true);
    }
  });

  it('11th attempt from same IP → 429', () => {
    const ip = '10.0.0.2';
    for (let i = 0; i < 10; i++) checkRateLimit('login', ip, OPTS);
    const r = checkRateLimit('login', ip, OPTS);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSecs).toBeGreaterThan(0);
  });

  it('concurrent burst of 15 attempts → at least one blocked', () => {
    const ip = '10.0.0.3';
    const results = Array.from({ length: 15 }, () => checkRateLimit('login', ip, OPTS));
    expect(results.filter(r => !r.allowed).length).toBeGreaterThanOrEqual(1);
  });

  it('different IPs do NOT share rate limit buckets', () => {
    const ip1 = '10.1.0.1';
    const ip2 = '10.1.0.2';
    for (let i = 0; i < 11; i++) checkRateLimit('login', ip1, OPTS);
    expect(checkRateLimit('login', ip2, OPTS).allowed).toBe(true);
  });

  it('failure counter increments correctly — delay kicks in at 5th failure', () => {
    const ip = '10.2.0.1';
    checkRateLimit('login', ip, OPTS);
    for (let i = 0; i < 4; i++) recordFailure('login', ip);
    expect(getFailureDelay('login', ip, DELAY_OPTS)).toBe(0);
    recordFailure('login', ip);
    expect(getFailureDelay('login', ip, DELAY_OPTS)).toBe(2000);
  });

  it('no delay before 5 failures', () => {
    const ip = '10.2.0.3';
    checkRateLimit('login', ip, OPTS);
    for (let i = 0; i < 4; i++) recordFailure('login', ip);
    expect(getFailureDelay('login', ip, DELAY_OPTS)).toBe(0);
  });

  it('different namespaces have independent buckets', () => {
    const ip = '10.3.0.1';
    for (let i = 0; i < 11; i++) checkRateLimit('login', ip, OPTS);
    expect(checkRateLimit('pin-verify', ip, OPTS).allowed).toBe(true);
  });
});

// ── Download job store — back-to-back upserts ─────────────────────────────────

describe('Download job store — back-to-back upserts', () => {
  let upsertJob:          (job: Record<string, unknown>) => void;
  let getJob:             (id: string) => Record<string, unknown> | undefined;
  let getAllJobs:          () => Record<string, unknown>[];
  let findJobByInfoHash:  (hash: string) => Record<string, unknown> | undefined;
  let markJobInterrupted: (id: string) => void;
  let getInterruptedJobs: () => Record<string, unknown>[];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/downloadJobStore.js');
    upsertJob          = mod.upsertJob          as typeof upsertJob;
    getJob             = mod.getJob             as typeof getJob;
    getAllJobs          = mod.getAllJobs          as typeof getAllJobs;
    findJobByInfoHash  = mod.findJobByInfoHash  as typeof findJobByInfoHash;
    markJobInterrupted = mod.markJobInterrupted as typeof markJobInterrupted;
    getInterruptedJobs = mod.getInterruptedJobs as typeof getInterruptedJobs;
  });

  it('50 sequential upserts to same jobId → final state is last write', async () => {
    const jobId = 'stress-job-1';
    for (let i = 0; i < 50; i++) {
      upsertJob({ jobId, infoHash: 'abc', title: `Title ${i}`, status: 'queued', addedAt: new Date().toISOString() });
      await Promise.resolve();
    }
    const job = getJob(jobId);
    expect(job).toBeDefined();
    expect((job as { title: string }).title).toBe('Title 49');
  });

  it('20 concurrent upserts to different jobIds → all 20 jobs exist', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `concurrent-job-${i}`);
    for (const id of ids) {
      upsertJob({ jobId: id, infoHash: `hash-${id}`, title: `Movie ${id}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await Promise.resolve();
    for (const id of ids) expect(getJob(id)).toBeDefined();
  });

  it('duplicate infoHash detection across rapid sequential adds', async () => {
    const hash = 'duplicate-hash-xyz';
    upsertJob({ jobId: 'job-a', infoHash: hash, title: 'Movie A', status: 'downloading', addedAt: new Date().toISOString() });
    await Promise.resolve();
    const found = findJobByInfoHash(hash);
    expect(found).toBeDefined();
    expect((found as { jobId: string }).jobId).toBe('job-a');
  });

  it('getInterruptedJobs returns only interrupted jobs after mixed upserts', async () => {
    upsertJob({ jobId: 'int-1', infoHash: 'h1', title: 'A', status: 'queued',      addedAt: new Date().toISOString() });
    upsertJob({ jobId: 'int-2', infoHash: 'h2', title: 'B', status: 'downloading', addedAt: new Date().toISOString() });
    upsertJob({ jobId: 'int-3', infoHash: 'h3', title: 'C', status: 'queued',      addedAt: new Date().toISOString() });
    await Promise.resolve();
    markJobInterrupted('int-1');
    markJobInterrupted('int-3');
    await Promise.resolve();
    const ids = getInterruptedJobs().map(j => (j as { jobId: string }).jobId);
    expect(ids).toContain('int-1');
    expect(ids).toContain('int-3');
    expect(ids).not.toContain('int-2');
  });

  it('markJobInterrupted is idempotent (calling twice does not corrupt state)', async () => {
    upsertJob({ jobId: 'idem-1', infoHash: 'hx', title: 'X', status: 'queued', addedAt: new Date().toISOString() });
    await Promise.resolve();
    markJobInterrupted('idem-1');
    markJobInterrupted('idem-1');
    await Promise.resolve();
    expect((getJob('idem-1') as { interrupted: boolean }).interrupted).toBe(true);
  });

  it('getAllJobs returns all upserted jobs', async () => {
    for (let i = 0; i < 5; i++) {
      upsertJob({ jobId: `bulk-${i}`, infoHash: `bh${i}`, title: `Bulk ${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await Promise.resolve();
    const all = getAllJobs();
    const bulkJobs = all.filter(j => (j as { jobId: string }).jobId.startsWith('bulk-'));
    expect(bulkJobs.length).toBe(5);
  });
});

// ── Session store — back-to-back session creation ─────────────────────────────

describe('Session store — back-to-back session creation', () => {
  let createSession:    () => string;
  let isValidSession:   (token: string) => boolean;
  let getSessionCount:  () => number;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/sessionStore.js');
    createSession    = mod.createSession;
    isValidSession   = mod.isValidSession;
    getSessionCount  = mod.getSessionCount;
    clearAllSessions = mod.clearAllSessions;
    clearAllSessions();
  });

  it('100 sequential createSession calls → 100 unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(createSession());
    expect(tokens.size).toBe(100);
  });

  it('all created sessions are valid immediately after creation', () => {
    const tokens: string[] = [];
    for (let i = 0; i < 20; i++) tokens.push(createSession());
    for (const t of tokens) expect(isValidSession(t)).toBe(true);
  });

  it('isValidSession returns false for unknown token', () => {
    createSession();
    expect(isValidSession('totally-fake-token-xyz')).toBe(false);
    expect(isValidSession('')).toBe(false);
  });

  it('getSessionCount reflects correct count after bulk creation', () => {
    for (let i = 0; i < 15; i++) createSession();
    expect(getSessionCount()).toBe(15);
  });

  it('clearAllSessions wipes all sessions created in bulk', () => {
    for (let i = 0; i < 30; i++) createSession();
    expect(getSessionCount()).toBe(30);
    clearAllSessions();
    expect(getSessionCount()).toBe(0);
  });
});

// ── Config store — back-to-back writes ───────────────────────────────────────
// Uses vi.doMock + vi.resetModules for full fs isolation per test.

describe('Config store — back-to-back writes', () => {
  let readConfig:  () => Record<string, unknown>;
  let writeConfig: (partial: Record<string, unknown>) => Record<string, unknown>;

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
    const mod = await import('../../server/configStore.js');
    readConfig  = mod.readConfig  as typeof readConfig;
    writeConfig = mod.writeConfig as typeof writeConfig;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('node:fs');
  });

  it('sequential partial writes merge correctly (no field loss)', () => {
    writeConfig({ mediaDir: '/media' });
    writeConfig({ tmdbApiKey: 'key123' });
    writeConfig({ preferredQuality: '4K' });
    const cfg = readConfig();
    expect(cfg.mediaDir).toBe('/media');
    expect(cfg.tmdbApiKey).toBe('key123');
    expect(cfg.preferredQuality).toBe('4K');
  });

  it('writeConfig with empty object is a no-op (no field deletion)', () => {
    writeConfig({ mediaDir: '/keep-me' });
    writeConfig({});
    expect((readConfig() as { mediaDir: string }).mediaDir).toBe('/keep-me');
  });

  it('readConfig always returns the latest written value', () => {
    writeConfig({ mediaDir: '/v1' });
    expect((readConfig() as { mediaDir: string }).mediaDir).toBe('/v1');
    writeConfig({ mediaDir: '/v2' });
    expect((readConfig() as { mediaDir: string }).mediaDir).toBe('/v2');
    writeConfig({ mediaDir: '/v3' });
    expect((readConfig() as { mediaDir: string }).mediaDir).toBe('/v3');
  });

  it('10 rapid sequential writes → config has all fields', () => {
    for (let i = 0; i < 10; i++) writeConfig({ [`field${i}`]: `value${i}` });
    const cfg = readConfig();
    for (let i = 0; i < 10; i++) expect(cfg[`field${i}`]).toBe(`value${i}`);
  });
});
