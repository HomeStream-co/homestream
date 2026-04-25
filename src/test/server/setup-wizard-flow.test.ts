/**
 * setup-wizard-flow.test.ts
 *
 * Setup wizard full flow E2E test.
 *
 * Walks the complete 5-step wizard in sequence using the real POST /api/setup
 * handler (with mocked I/O). Verifies that at the end:
 *
 *   1. setupComplete is written as true
 *   2. adminPassword is hashed (not stored in plaintext)
 *   3. mediaDir is persisted
 *   4. API keys are persisted
 *   5. The final response is { ok: true }
 *   6. /api/health returns setupComplete: true after the flow
 *
 * WHY THIS EXISTS
 * ───────────────
 * The unit tests in setup-wizard.test.ts mock writeConfig and test each step
 * in isolation. This test uses a real in-memory config store (mocked fs) so
 * that state actually accumulates across steps — catching bugs where a later
 * step overwrites an earlier step's data, or where the final 'complete' action
 * fails to set setupComplete because an intermediate step corrupted the config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── In-memory config store ────────────────────────────────────────────────────
//
// We use a real in-memory store (not mocked writeConfig) so state accumulates
// across steps exactly as it would on real hardware.

let diskConfig: Record<string, unknown> = {};

vi.mock('fs', () => ({
  default: {
    existsSync:    (p: string) => p.includes('homestream-config') ? Object.keys(diskConfig).length > 0 : true,
    readFileSync:  (p: string) => {
      if (p.includes('homestream-config')) return JSON.stringify(diskConfig);
      throw new Error(`ENOENT: ${p}`);
    },
    writeFileSync: (_p: string, data: string) => {
      // Capture the config written to disk
      try { diskConfig = JSON.parse(data) as Record<string, unknown>; } catch { /* ignore */ }
    },
    renameSync:    vi.fn(),
    unlinkSync:    vi.fn(),
    mkdirSync:     vi.fn(),
    statSync:      vi.fn().mockReturnValue({ isDirectory: () => true }),
  },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/data/${name}`,
}));

// bcrypt — use a fast synchronous fake so tests don't take 1s per hash
vi.mock('bcryptjs', () => ({
  default: {
    hash:    (_pw: string, _rounds: number) => Promise.resolve(`hashed:${_pw}`),
    compare: (_pw: string, hash: string)    => Promise.resolve(hash === `hashed:${_pw}`),
  },
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth:    (_req: unknown, _res: unknown) => true,
  isValidSession: vi.fn().mockReturnValue(true),
}));

vi.mock('../../server/folderWatcher.js', () => ({
  startWatcher: vi.fn(),
  stopWatcher:  vi.fn(),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  testConnection: vi.fn().mockResolvedValue({ ok: true, version: '5.0.0' }),
  isReachable:    vi.fn().mockResolvedValue(true),
}));

vi.mock('../../server/developerLock.js', () => ({
  isDeveloperLocked: vi.fn().mockReturnValue(false),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: Record<string, unknown>, authed = true) {
  const req = {
    body,
    cookies: authed ? { session: 'tok' } : {},
  } as unknown as Request;

  let responseBody: unknown;
  let statusCode = 200;

  const res = {
    status: vi.fn().mockImplementation((code: number) => { statusCode = code; return res; }),
    json:   vi.fn().mockImplementation((data: unknown) => { responseBody = data; }),
    end:    vi.fn(),
  } as unknown as Response;

  return {
    req,
    res,
    getBody:   () => responseBody as Record<string, unknown>,
    getStatus: () => statusCode,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Setup wizard — full 5-step flow', () => {
  beforeEach(() => {
    diskConfig = {};
    vi.resetModules();
  });

  it('completes the full wizard flow and writes setupComplete:true', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const fn = handler as Function;

    // ── Step 1: Set admin password ────────────────────────────────────────────
    {
      const { req, res, getBody } = makeReqRes(
        { action: 'save', adminPassword: 'MySecurePass123!' },
        false,  // not yet authed — wizard is open before setup complete
      );
      await fn(req, res);
      expect(getBody().ok).toBe(true);
    }

    // ── Step 2: Set media directory ───────────────────────────────────────────
    {
      const { req, res, getBody } = makeReqRes(
        { action: 'save', mediaDir: '/mnt/media' },
        false,
      );
      await fn(req, res);
      expect(getBody().ok).toBe(true);
    }

    // ── Step 3: Save API keys ─────────────────────────────────────────────────
    {
      const { req, res, getBody } = makeReqRes(
        {
          action:       'save',
          tmdbApiKey:   'tmdb-key-abc',
          omdbApiKey:   'omdb-key-xyz',
          googleAiApiKey: 'google-key-123',
        },
        false,
      );
      await fn(req, res);
      expect(getBody().ok).toBe(true);
    }

    // ── Step 4: Complete setup ────────────────────────────────────────────────
    {
      const { req, res, getBody } = makeReqRes(
        { action: 'complete' },
        false,
      );
      await fn(req, res);
      expect(getBody().ok).toBe(true);
    }

    // ── Verify final config state ─────────────────────────────────────────────
    expect(diskConfig.setupComplete).toBe(true);
    expect(diskConfig.mediaDir).toBe('/mnt/media');
    expect(diskConfig.tmdbApiKey).toBe('tmdb-key-abc');
    expect(diskConfig.omdbApiKey).toBe('omdb-key-xyz');
    expect(diskConfig.googleAiApiKey).toBe('google-key-123');

    // Password must be hashed — never stored in plaintext
    expect(diskConfig.adminPassword).not.toBe('MySecurePass123!');
    expect(typeof diskConfig.adminPassword).toBe('string');
    expect((diskConfig.adminPassword as string).length).toBeGreaterThan(0);

    // setupCompletedAt must be a valid ISO timestamp
    expect(new Date(diskConfig.setupCompletedAt as string).getTime()).not.toBeNaN();
  });

  it('each step preserves data written by previous steps', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const fn = handler as Function;

    // Step 1 — password
    await fn(...Object.values(makeReqRes({ action: 'save', adminPassword: 'pass1' }, false)).slice(0, 2));

    // Step 2 — mediaDir
    await fn(...Object.values(makeReqRes({ action: 'save', mediaDir: '/mnt/data' }, false)).slice(0, 2));

    // After step 2, the password written in step 1 must still be present
    expect(diskConfig.adminPassword).toBeTruthy();
    expect(diskConfig.mediaDir).toBe('/mnt/data');

    // Step 3 — API keys
    await fn(...Object.values(makeReqRes({ action: 'save', tmdbApiKey: 'tmdb-123' }, false)).slice(0, 2));

    // After step 3, mediaDir and password must still be present
    expect(diskConfig.adminPassword).toBeTruthy();
    expect(diskConfig.mediaDir).toBe('/mnt/data');
    expect(diskConfig.tmdbApiKey).toBe('tmdb-123');
  });

  it('setupComplete is false until the complete action is called', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const fn = handler as Function;

    await fn(...Object.values(makeReqRes({ action: 'save', adminPassword: 'pass' }, false)).slice(0, 2));
    expect(diskConfig.setupComplete).toBeFalsy();

    await fn(...Object.values(makeReqRes({ action: 'save', mediaDir: '/mnt/media' }, false)).slice(0, 2));
    expect(diskConfig.setupComplete).toBeFalsy();

    await fn(...Object.values(makeReqRes({ action: 'complete' }, false)).slice(0, 2));
    expect(diskConfig.setupComplete).toBe(true);
  });

  it('adminPassword is never stored in plaintext', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const fn = handler as Function;

    const plaintext = 'SuperSecret99!';
    await fn(...Object.values(makeReqRes({ action: 'save', adminPassword: plaintext }, false)).slice(0, 2));

    expect(diskConfig.adminPassword).not.toBe(plaintext);
    expect(diskConfig.adminPassword).toBeTruthy();
  });

  it('/api/health returns setupComplete:true after wizard completes', async () => {
    const { default: setupHandler } = await import('../../server/api/setup/POST.js');
    const fn = setupHandler as Function;

    // Run through the wizard
    await fn(...Object.values(makeReqRes({ action: 'save', adminPassword: 'pw' }, false)).slice(0, 2));
    await fn(...Object.values(makeReqRes({ action: 'complete' }, false)).slice(0, 2));

    // Now check /api/health
    const { default: healthHandler } = await import('../../server/api/health/GET.js');
    const req = { cookies: {} } as unknown as Request;
    let healthBody: Record<string, unknown> = {};
    const res = {
      json: vi.fn((d: unknown) => { healthBody = d as Record<string, unknown>; }),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await (healthHandler as Function)(req, res);
    expect(healthBody.setupComplete).toBe(true);
  });
});
