/**
 * health-check-names.test.ts
 *
 * Health check name contract test.
 *
 * GET /api/health/full returns a `checks` array. The Debug Panel in the UI
 * renders each entry by name. If a subsystem is renamed, removed, or its
 * name is misspelled, the panel silently shows a blank entry or loses a row.
 *
 * This test asserts:
 *   1. Every expected subsystem name is present in the response
 *   2. No check has an empty or undefined name
 *   3. No check has an undefined status
 *   4. No check has an undefined message
 *   5. The set of names exactly matches EXPECTED_CHECK_NAMES (no extras, no missing)
 *
 * HOW TO ADD A NEW SUBSYSTEM
 * ──────────────────────────
 * 1. Add the subsystem check function in src/server/api/health/full/GET.ts
 * 2. Add its name to EXPECTED_CHECK_NAMES below
 * 3. Run this test — it will fail until the name matches exactly
 *
 * This forces the contract to be updated consciously rather than silently
 * drifting out of sync with the UI.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';

// ── The canonical list of subsystem names the Debug Panel expects ─────────────
//
// Keep this in sync with the UI component that renders the health panel.
// Names are case-sensitive and must match exactly what the handler returns.

const EXPECTED_CHECK_NAMES = new Set([
  'Media Library',
  'Configuration',
  'qBittorrent',
  'Real-Debrid',
  'TMDB',
  'Ollama',
  'Torrentio',
  'Download Queue',
  'FFmpeg',
]);

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({
    mediaDir:          '/media',
    qbitUrl:           'http://localhost:8080',
    tmdbApiKey:        '',
    ollamaUrl:         '',
    ollamaModel:       'llama3',
    realDebridApiKey:  '',
    aiProvider:        'gemini',
  }),
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => [],
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: () => Promise.resolve(false),
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs: () => [],
}));

vi.mock('../../server/realDebridClient.js', () => ({
  isConfigured: () => Promise.resolve(false),
  getUser:      vi.fn(),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown) => true,
}));

vi.mock('child_process', () => ({
  spawn: () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const proc = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill:   vi.fn(),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(cb);
        // Simulate ffmpeg not found — fires 'error' immediately
        if (event === 'error') setTimeout(() => cb(new Error('ENOENT')), 0);
      },
    };
    return proc;
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync:  vi.fn().mockReturnValue(true),
    statSync:    vi.fn().mockReturnValue({ size: 1024 * 1024 * 1024 }),
    readdirSync: vi.fn().mockReturnValue([]),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type CheckEntry = { name: string; status: string; message: string };
type HealthBody = { checks: CheckEntry[]; overall: string; timestamp: string };

function makeReqRes() {
  const req = { cookies: { session: 'tok' } } as unknown as Request;
  let body: HealthBody | undefined;
  const res = {
    json: vi.fn((data: unknown) => { body = data as HealthBody; }),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res, getBody: () => body! };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/health/full — check name contract', () => {

  it('returns exactly the expected set of subsystem names — no extras, no missing', async () => {
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    const body = getBody();
    expect(body).toBeDefined();
    expect(body.checks).toBeDefined();

    const returnedNames = new Set(body.checks.map(c => c.name));

    // Find any names in the response that aren't in our expected set
    const unexpected = [...returnedNames].filter(n => !EXPECTED_CHECK_NAMES.has(n));
    // Find any expected names missing from the response
    const missing = [...EXPECTED_CHECK_NAMES].filter(n => !returnedNames.has(n));

    const errors: string[] = [];
    if (unexpected.length > 0) {
      errors.push(
        `Unexpected subsystem name(s) in response: ${unexpected.join(', ')}\n` +
        `Add them to EXPECTED_CHECK_NAMES in this test file.`,
      );
    }
    if (missing.length > 0) {
      errors.push(
        `Expected subsystem name(s) missing from response: ${missing.join(', ')}\n` +
        `Either the handler was changed or EXPECTED_CHECK_NAMES is out of date.`,
      );
    }

    if (errors.length > 0) {
      throw new Error('\n\n' + errors.join('\n\n'));
    }
  });

  it('every check has a non-empty name', async () => {
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    for (const check of getBody().checks) {
      expect(check.name, 'check.name must not be empty').toBeTruthy();
    }
  });

  it('every check has a valid status (ok | warn | error | unknown)', async () => {
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    const VALID_STATUSES = new Set(['ok', 'warn', 'error', 'unknown']);
    for (const check of getBody().checks) {
      expect(
        VALID_STATUSES.has(check.status),
        `check "${check.name}" has invalid status: "${check.status}"`,
      ).toBe(true);
    }
  });

  it('every check has a non-empty message', async () => {
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    for (const check of getBody().checks) {
      expect(
        typeof check.message === 'string' && check.message.length > 0,
        `check "${check.name}" has empty or missing message`,
      ).toBe(true);
    }
  });

  it('response includes overall status and timestamp', async () => {
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    const body = getBody();
    expect(body.overall).toMatch(/^(ok|warn|error)$/);
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it('overall is error when at least one check is error', async () => {
    // FFmpeg is mocked to fail (ENOENT) — so FFmpeg check will be error
    const { default: handler } = await import('../../server/api/health/full/GET.js');
    const { req, res, getBody } = makeReqRes();
    await (handler as Function)(req, res);

    const body = getBody();
    const hasError = body.checks.some(c => c.status === 'error');
    if (hasError) {
      expect(body.overall).toBe('error');
    }
  });
});
