/**
 * session-store.test.ts
 *
 * Unit tests for src/server/sessionStore.ts
 *
 * sessionStore is the authentication backbone — every single authenticated
 * request calls isValidSession(). Bugs here mean either:
 *   (a) valid users get logged out unexpectedly, or
 *   (b) expired/deleted sessions are still accepted (security hole)
 *
 * Strategy: mock fs entirely so no disk I/O occurs, then exercise the
 * public API (createSession, isValidSession, deleteSession, clearAllSessions,
 * getSessionCount) with controlled time via vi.useFakeTimers().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory fs mock ─────────────────────────────────────────────────────────
// We need a mutable in-memory store that the module can read/write.

let memStore: Record<string, number> = {};
let fileExists = false;

vi.mock('fs', () => ({
  default: {
    existsSync: () => fileExists,
    readFileSync: () => JSON.stringify(memStore),
    writeFileSync: (_path: string, data: string) => {
      memStore = JSON.parse(data) as Record<string, number>;
      fileExists = true;
    },
  },
  existsSync: () => fileExists,
  readFileSync: () => JSON.stringify(memStore),
  writeFileSync: (_path: string, data: string) => {
    memStore = JSON.parse(data) as Record<string, number>;
    fileExists = true;
  },
}));

// dataDir mock — return a stable path so the module initialises cleanly
vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/tmp/test-${name}`,
}));

// ── Import AFTER mocks are registered ─────────────────────────────────────────
const {
  createSession,
  isValidSession,
  deleteSession,
  clearAllSessions,
  getSessionCount,
  SESSION_TTL_MS,
} = await import('../../server/sessionStore.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore() {
  memStore = {};
  fileExists = false;
  // Reset the module-level cache by clearing all sessions
  clearAllSessions();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionStore — createSession()', () => {
  beforeEach(resetStore);

  it('returns a non-empty hex string', () => {
    const token = createSession();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different token on each call', () => {
    const t1 = createSession();
    const t2 = createSession();
    expect(t1).not.toBe(t2);
  });

  it('increments session count', async () => {
    clearAllSessions();
    await new Promise(r => setTimeout(r, 10)); // let write queue flush
    createSession();
    await new Promise(r => setTimeout(r, 10));
    expect(getSessionCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('sessionStore — isValidSession()', () => {
  beforeEach(resetStore);

  it('returns true for a freshly created session', async () => {
    const token = createSession();
    await new Promise(r => setTimeout(r, 10));
    expect(isValidSession(token)).toBe(true);
  });

  it('returns false for an unknown token', () => {
    expect(isValidSession('deadbeef')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidSession('')).toBe(false);
  });

  it('returns false for an expired session', async () => {
    vi.useFakeTimers();
    const token = createSession();
    await Promise.resolve(); // flush write queue microtask
    // Advance time past TTL (7 days + 1ms)
    vi.advanceTimersByTime(SESSION_TTL_MS + 1);
    expect(isValidSession(token)).toBe(false);
    vi.useRealTimers();
  });

  it('returns true for a session that has NOT yet expired', async () => {
    vi.useFakeTimers();
    const token = createSession();
    await Promise.resolve();
    // Advance to just before expiry
    vi.advanceTimersByTime(SESSION_TTL_MS - 1000);
    expect(isValidSession(token)).toBe(true);
    vi.useRealTimers();
  });
});

describe('sessionStore — deleteSession()', () => {
  beforeEach(resetStore);

  it('makes a previously valid session invalid', async () => {
    const token = createSession();
    await new Promise(r => setTimeout(r, 10));
    expect(isValidSession(token)).toBe(true);
    deleteSession(token);
    await new Promise(r => setTimeout(r, 10));
    expect(isValidSession(token)).toBe(false);
  });

  it('does not throw when deleting a non-existent token', () => {
    expect(() => deleteSession('nonexistent')).not.toThrow();
  });

  it('only removes the targeted session, not others', async () => {
    const t1 = createSession();
    const t2 = createSession();
    await new Promise(r => setTimeout(r, 10));
    deleteSession(t1);
    await new Promise(r => setTimeout(r, 10));
    expect(isValidSession(t1)).toBe(false);
    expect(isValidSession(t2)).toBe(true);
  });
});

describe('sessionStore — clearAllSessions()', () => {
  beforeEach(resetStore);

  it('invalidates all existing sessions', async () => {
    const t1 = createSession();
    const t2 = createSession();
    await new Promise(r => setTimeout(r, 10));
    clearAllSessions();
    await new Promise(r => setTimeout(r, 10));
    expect(isValidSession(t1)).toBe(false);
    expect(isValidSession(t2)).toBe(false);
  });

  it('resets session count to 0', async () => {
    createSession();
    createSession();
    await new Promise(r => setTimeout(r, 10));
    clearAllSessions();
    await new Promise(r => setTimeout(r, 10));
    expect(getSessionCount()).toBe(0);
  });
});

describe('sessionStore — getSessionCount()', () => {
  beforeEach(resetStore);

  it('returns 0 when no sessions exist', async () => {
    clearAllSessions();
    await new Promise(r => setTimeout(r, 10));
    expect(getSessionCount()).toBe(0);
  });

  it('counts only non-expired sessions in the store', async () => {
    clearAllSessions();
    await new Promise(r => setTimeout(r, 10));
    createSession();
    createSession();
    await new Promise(r => setTimeout(r, 10));
    expect(getSessionCount()).toBe(2);
  });
});

describe('sessionStore — SESSION_TTL_MS', () => {
  it('is 7 days in milliseconds', () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
