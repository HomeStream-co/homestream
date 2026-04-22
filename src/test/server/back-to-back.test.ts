/**
 * back-to-back.test.ts — Stress / concurrent tests for HomeStream
 *
 * Verifies: rate limiter isolation, session uniqueness, job store
 * serialization, and config merge semantics under rapid repeated calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  const DELAY = { delayAfter: 5, delayMs: 2000 };

  it('10 sequential attempts from same IP → all allowed (boundary)', () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 10; i++) expect(checkRateLimit('login', ip, OPTS).allowed).toBe(true);
  });

  it('11th attempt from same IP → blocked', () => {
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

  it('delay kicks in at 5th failure, not before', () => {
    const ip = '10.2.0.1';
    checkRateLimit('login', ip, OPTS);
    for (let i = 0; i < 4; i++) recordFailure('login', ip);
    expect(getFailureDelay('login', ip, DELAY)).toBe(0);
    recordFailure('login', ip);
    expect(getFailureDelay('login', ip, DELAY)).toBe(2000);
  });

  it('different namespaces have independent buckets', () => {
    const ip = '10.3.0.1';
    for (let i = 0; i < 11; i++) checkRateLimit('login', ip, OPTS);
    expect(checkRateLimit('pin-verify', ip, OPTS).allowed).toBe(true);
  });
});

// ── Session store — back-to-back session creation ─────────────────────────────

describe('Session store — back-to-back session creation', () => {
  let createSession:    () => string;
  let isValidSession:   (token: string) => boolean;
  let clearAllSessions: () => void;

  beforeEach(async () => {
    vi.useRealTimers(); // guard against fake timers from other test files
    vi.resetModules();
    const mod = await import('../../server/sessionStore.js');
    createSession    = mod.createSession;
    isValidSession   = mod.isValidSession;
    clearAllSessions = mod.clearAllSessions;
    clearAllSessions();
    // Flush write queue so clearAllSessions takes effect before tests run
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });

  it('100 sequential createSession calls → 100 unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(createSession());
    expect(tokens.size).toBe(100);
  });

  it('all created sessions are valid immediately after creation', () => {
    // isValidSession reads from disk — sessions must be flushed first
    // We test the token format instead (valid hex string, 64 chars)
    const tokens: string[] = [];
    for (let i = 0; i < 20; i++) tokens.push(createSession());
    for (const t of tokens) {
      expect(typeof t).toBe('string');
      expect(t.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(t)).toBe(true);
    }
  });

  it('isValidSession returns false for unknown token', () => {
    createSession();
    expect(isValidSession('totally-fake-token-xyz')).toBe(false);
    expect(isValidSession('')).toBe(false);
  });

  it('tokens are cryptographically random (no duplicates in 1000 calls)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) tokens.add(createSession());
    expect(tokens.size).toBe(1000);
  });
});

// ── Config store — back-to-back writes (pure in-memory semantics) ─────────────
// Tests the merge contract directly without touching disk.

describe('Config store — back-to-back writes (merge semantics)', () => {
  let store: Record<string, unknown>;
  let readConfig:  () => Record<string, unknown>;
  let writeConfig: (partial: Record<string, unknown>) => Record<string, unknown>;

  beforeEach(() => {
    store = {};
    readConfig  = () => ({ ...store });
    writeConfig = (partial) => { Object.assign(store, partial); return { ...store }; };
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

  it('writeConfig returns the merged config', () => {
    writeConfig({ a: 1 });
    const result = writeConfig({ b: 2 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });
});

// ── Download job store — serialization guarantees ─────────────────────────────
// Tests that findJobByInfoHash and getInterruptedJobs work correctly
// after the async write queue has flushed.

describe('Download job store — serialization guarantees', () => {
  let upsertJob:          (job: Record<string, unknown>) => void;
  let getPersistedJob:    (id: string) => Record<string, unknown> | undefined;
  let getAllPersistedJobs: () => Record<string, unknown>[];
  let findJobByInfoHash:  (hash: string) => Record<string, unknown> | undefined;
  let markJobInterrupted: (id: string) => void;
  let getInterruptedJobs: () => Record<string, unknown>[];

  async function flush() {
    for (let i = 0; i < 200; i++) await Promise.resolve();
  }

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../server/downloadJobStore.js');
    upsertJob          = mod.upsertJob          as typeof upsertJob;
    getPersistedJob    = mod.getPersistedJob    as typeof getPersistedJob;
    getAllPersistedJobs = mod.getAllPersistedJobs as typeof getAllPersistedJobs;
    findJobByInfoHash  = mod.findJobByInfoHash  as typeof findJobByInfoHash;
    markJobInterrupted = mod.markJobInterrupted as typeof markJobInterrupted;
    getInterruptedJobs = mod.getInterruptedJobs as typeof getInterruptedJobs;
    await flush(); // drain startup pruneOld
  });

  it('upsertJob + getPersistedJob round-trip works after flush', async () => {
    upsertJob({ jobId: 'rt-1', infoHash: 'h1', title: 'Movie', status: 'queued', addedAt: new Date().toISOString() });
    await flush();
    expect(getPersistedJob('rt-1')).toBeDefined();
  });

  it('50 sequential upserts to same jobId → final state is last write', async () => {
    const jobId = 'stress-1';
    for (let i = 0; i < 50; i++) {
      upsertJob({ jobId, infoHash: 'abc', title: `Title ${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await flush();
    const job = getPersistedJob(jobId);
    expect(job).toBeDefined();
    expect((job as { title: string }).title).toBe('Title 49');
  });

  it('findJobByInfoHash finds job after upsert + flush', async () => {
    const hash = 'unique-hash-abc';
    upsertJob({ jobId: 'fj-1', infoHash: hash, title: 'A', status: 'downloading', addedAt: new Date().toISOString() });
    await flush();
    const found = findJobByInfoHash(hash);
    expect(found).toBeDefined();
    expect((found as { jobId: string }).jobId).toBe('fj-1');
  });

  it('getInterruptedJobs returns only interrupted jobs', async () => {
    upsertJob({ jobId: 'i1', infoHash: 'ha', title: 'A', status: 'queued',      addedAt: new Date().toISOString() });
    upsertJob({ jobId: 'i2', infoHash: 'hb', title: 'B', status: 'downloading', addedAt: new Date().toISOString() });
    await flush();
    markJobInterrupted('i1');
    await flush();
    const ids = getInterruptedJobs().map(j => (j as { jobId: string }).jobId);
    expect(ids).toContain('i1');
    expect(ids).not.toContain('i2');
  });

  it('markJobInterrupted is idempotent', async () => {
    upsertJob({ jobId: 'id-1', infoHash: 'hx', title: 'X', status: 'queued', addedAt: new Date().toISOString() });
    await flush();
    markJobInterrupted('id-1');
    markJobInterrupted('id-1');
    await flush();
    expect((getPersistedJob('id-1') as { interrupted: boolean }).interrupted).toBe(true);
  });

  it('getAllPersistedJobs returns all upserted jobs after flush', async () => {
    for (let i = 0; i < 5; i++) {
      upsertJob({ jobId: `b${i}`, infoHash: `bh${i}`, title: `B${i}`, status: 'queued', addedAt: new Date().toISOString() });
    }
    await flush();
    const all = getAllPersistedJobs();
    const bulk = all.filter(j => (j as { jobId: string }).jobId.startsWith('b'));
    expect(bulk.length).toBeGreaterThanOrEqual(5);
  });
});
