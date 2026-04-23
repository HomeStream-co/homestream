/**
 * session-store-ttl.test.ts
 *
 * Tests for src/server/sessionStore.ts — the file-backed session layer.
 *
 * What we verify:
 *   - createSession returns a 64-char hex token and persists it
 *   - isValidSession returns true for a live token
 *   - isValidSession returns false for an unknown token
 *   - isValidSession returns false for an expired token (lazy delete)
 *   - isValidSession lazily deletes expired tokens from the store
 *   - deleteSession removes the token
 *   - clearAllSessions wipes every token
 *   - getSessionCount reflects the live count
 *   - Expired sessions are pruned on module load (prune-on-load)
 *   - Write-through cache: isValidSession reads from memory, not disk
 *   - Atomic write: tmp+rename pattern used for every write
 *
 * Error codes produced when these tests fail:
 *   SESSION_CREATE       — createSession didn't return a valid token
 *   SESSION_VALID        — isValidSession returned wrong result for live token
 *   SESSION_EXPIRED      — isValidSession didn't reject an expired token
 *   SESSION_LAZY_DELETE  — expired token wasn't lazily removed from store
 *   SESSION_DELETE       — deleteSession didn't remove the token
 *   SESSION_CLEAR        — clearAllSessions didn't wipe all tokens
 *   SESSION_COUNT        — getSessionCount returned wrong value
 *   SESSION_PRUNE        — expired sessions not pruned on load
 *   SESSION_CACHE        — write-through cache not working (disk reads on hot path)
 *   SESSION_ATOMIC       — write didn't use tmp+rename pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Fake timers ───────────────────────────────────────────────────────────────
// We need to control Date.now() to simulate token expiry.

vi.useFakeTimers();

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockFiles: Record<string, string> = {};
const mockRenameSync = vi.fn((src: string, dst: string) => {
  if (mockFiles[src] !== undefined) {
    mockFiles[dst] = mockFiles[src];
    delete mockFiles[src];
  }
});
const mockUnlinkSync = vi.fn((p: string) => { delete mockFiles[p]; });
let readCount = 0; // tracks how many times readFileSync is called

vi.mock('fs', () => ({
  default: {
    existsSync:    (p: string) => p in mockFiles,
    readFileSync:  (p: string) => {
      readCount++;
      if (!(p in mockFiles)) throw new Error(`ENOENT: ${p}`);
      return mockFiles[p];
    },
    writeFileSync: (p: string, data: string) => { mockFiles[p] = data; },
    renameSync:    mockRenameSync,
    unlinkSync:    mockUnlinkSync,
  },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/data/${name}`,
}));

const SESSIONS_PATH = '/data/homestream-sessions.json';
const TMP_PATH      = SESSIONS_PATH + '.tmp';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seed the sessions file with a pre-built map of token→expiry */
function seedSessions(sessions: Record<string, number>) {
  mockFiles[SESSIONS_PATH] = JSON.stringify(sessions);
}

/** Flush the write queue by waiting a tick */
async function flushQueue() {
  await new Promise<void>(resolve => process.nextTick(resolve));
  await new Promise<void>(resolve => process.nextTick(resolve));
}

// ── Import after mocks ────────────────────────────────────────────────────────
// Re-import fresh for each test group by resetting modules.

let createSession: () => string;
let isValidSession: (t: string) => boolean;
let deleteSession: (t: string) => void;
let clearAllSessions: () => void;
let getSessionCount: () => number;

async function loadModule() {
  vi.resetModules();
  const mod = await import('../../server/sessionStore.js');
  createSession    = mod.createSession;
  isValidSession   = mod.isValidSession;
  deleteSession    = mod.deleteSession;
  clearAllSessions = mod.clearAllSessions;
  getSessionCount  = mod.getSessionCount;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionStore', () => {
  beforeEach(async () => {
    mockFiles = {};
    readCount = 0;
    mockRenameSync.mockClear();
    mockUnlinkSync.mockClear();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await loadModule();
    await flushQueue(); // let prune-on-load write settle
  });

  // ── createSession ───────────────────────────────────────────────────────────

  it('[SESSION_CREATE] returns a 64-char hex token', async () => {
    const token = createSession();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[SESSION_CREATE] persists the token with correct expiry', async () => {
    const before = Date.now();
    const token = createSession();
    await flushQueue();

    const sessions = JSON.parse(mockFiles[SESSIONS_PATH]) as Record<string, number>;
    expect(sessions[token]).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
  });

  it('[SESSION_CREATE] each call returns a unique token', () => {
    const t1 = createSession();
    const t2 = createSession();
    expect(t1).not.toBe(t2);
  });

  // ── isValidSession ──────────────────────────────────────────────────────────

  it('[SESSION_VALID] returns true for a live token', async () => {
    const token = createSession();
    await flushQueue();
    expect(isValidSession(token)).toBe(true);
  });

  it('[SESSION_VALID] returns false for an unknown token', () => {
    expect(isValidSession('deadbeef'.repeat(8))).toBe(false);
  });

  it('[SESSION_EXPIRED] returns false for a token past its expiry', async () => {
    const token = createSession();
    await flushQueue();

    // Advance time past TTL
    vi.advanceTimersByTime(SESSION_TTL_MS + 1000);

    expect(isValidSession(token)).toBe(false);
  });

  it('[SESSION_LAZY_DELETE] lazily removes expired token from the store', async () => {
    const token = createSession();
    await flushQueue();

    vi.advanceTimersByTime(SESSION_TTL_MS + 1000);

    isValidSession(token); // triggers lazy delete
    await flushQueue();

    const sessions = JSON.parse(mockFiles[SESSIONS_PATH] ?? '{}') as Record<string, number>;
    expect(sessions[token]).toBeUndefined();
  });

  // ── deleteSession ───────────────────────────────────────────────────────────

  it('[SESSION_DELETE] removes the token so it is no longer valid', async () => {
    const token = createSession();
    await flushQueue();

    deleteSession(token);
    await flushQueue();

    expect(isValidSession(token)).toBe(false);
  });

  it('[SESSION_DELETE] is a no-op for a non-existent token (no crash)', async () => {
    expect(() => deleteSession('nonexistent')).not.toThrow();
    await flushQueue();
  });

  // ── clearAllSessions ────────────────────────────────────────────────────────

  it('[SESSION_CLEAR] wipes all tokens', async () => {
    createSession();
    createSession();
    createSession();
    await flushQueue();

    clearAllSessions();
    await flushQueue();

    expect(getSessionCount()).toBe(0);
  });

  // ── getSessionCount ─────────────────────────────────────────────────────────

  it('[SESSION_COUNT] returns 0 when no sessions exist', () => {
    expect(getSessionCount()).toBe(0);
  });

  it('[SESSION_COUNT] increments after createSession', async () => {
    createSession();
    createSession();
    await flushQueue();
    expect(getSessionCount()).toBe(2);
  });

  it('[SESSION_COUNT] decrements after deleteSession', async () => {
    const t1 = createSession();
    createSession();
    await flushQueue();

    deleteSession(t1);
    await flushQueue();

    expect(getSessionCount()).toBe(1);
  });

  // ── Prune on load ───────────────────────────────────────────────────────────

  it('[SESSION_PRUNE] expired sessions in the file are pruned on module load', async () => {
    const now = Date.now();
    const expiredToken = 'expired'.padEnd(64, '0');
    const liveToken    = 'live'.padEnd(64, '0');

    seedSessions({
      [expiredToken]: now - 1000,           // already expired
      [liveToken]:    now + SESSION_TTL_MS, // still live
    });

    // Reload the module — prune-on-load should fire
    await loadModule();
    await flushQueue();

    const sessions = JSON.parse(mockFiles[SESSIONS_PATH]) as Record<string, number>;
    expect(sessions[expiredToken]).toBeUndefined();
    expect(sessions[liveToken]).toBeDefined();
  });

  // ── Write-through cache ─────────────────────────────────────────────────────

  it('[SESSION_CACHE] isValidSession does not re-read from disk on repeated calls', async () => {
    const token = createSession();
    await flushQueue();

    // Reset read counter after initial load
    readCount = 0;

    // Call isValidSession multiple times
    isValidSession(token);
    isValidSession(token);
    isValidSession(token);

    // Cache should serve all reads — disk should NOT be read again
    expect(readCount).toBe(0);
  });

  // ── Atomic write ────────────────────────────────────────────────────────────

  it('[SESSION_ATOMIC] writes use tmp+rename pattern', async () => {
    createSession();
    await flushQueue();

    expect(mockRenameSync).toHaveBeenCalledWith(TMP_PATH, SESSIONS_PATH);
  });
});
