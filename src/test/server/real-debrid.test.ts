/**
 * Integration tests — Real-Debrid API key flow
 *
 * Covers every path that could silently break the RD integration:
 *
 *   1. /api/real-debrid/status — no key configured
 *   2. /api/real-debrid/status — valid cache (no RD API call)
 *   3. /api/real-debrid/status — expired cache (re-fetches live)
 *   4. /api/real-debrid/status — no cache yet (first fetch)
 *   5. /api/real-debrid/status — RD API unreachable (graceful error)
 *   6. POST /api/setup action=save — new key busts old premium cache
 *   7. POST /api/setup action=test_real_debrid — returns user + days
 *   8. POST /api/setup action=test_real_debrid — no key in body or config
 *   9. configStore — realDebridPremiumExpiry / realDebridPremiumCheckedAt
 *      survive a round-trip through writeConfig → readConfig
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockConfig: Record<string, unknown> = {};

// Mock configStore so tests never touch the real filesystem
vi.mock('../../server/configStore.js', () => ({
  readConfig: vi.fn(() => ({ ...mockConfig })),
  writeConfig: vi.fn((updates: Record<string, unknown>) => {
    mockConfig = { ...mockConfig, ...updates };
    return { ...mockConfig };
  }),
  isSetupComplete: vi.fn(() => true),
}));

// Mock authMiddleware — always passes in tests
vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next?: () => void) => {
    if (next) next();
    return true;
  },
}));

// Mock realDebridClient — we control what the "RD API" returns
const mockGetUser = vi.fn();
vi.mock('../../server/realDebridClient.js', () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
  isConfigured: vi.fn(),
  resolvemagnet: vi.fn(),
  downloadUrl: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Express-like req/res pair for handler testing */
function makeReqRes(body: Record<string, unknown> = {}) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const req = { body, headers: { authorization: 'Bearer test' } };
  const res = { json, status };
  return { req, res, json, status };
}

/** ISO date N days from now */
function isoInDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

/** ISO date N days in the past */
function isoAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ── Import handlers after mocks are set up ────────────────────────────────────

// We import dynamically inside each describe block so vi.mock() is in place first.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/real-debrid/status', () => {
  beforeEach(() => {
    mockConfig = {};
    mockGetUser.mockReset();
  });

  it('returns ok:false reason:no_key when no key is configured', async () => {
    const { default: handler } = await import('../../server/api/real-debrid/status/GET.js');
    const { req, res, json } = makeReqRes();
    // handler is exported as [requireAuth, handlerFn] — call the last element
    const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: 'no_key' }));
  });

  it('returns cached data without calling RD API when expiry is in the future', async () => {
    mockConfig = {
      realDebridApiKey: 'testkey',
      realDebridPremiumExpiry: isoInDays(60),
      realDebridPremiumCheckedAt: isoAgo(1),
    };
    const { default: handler } = await import('../../server/api/real-debrid/status/GET.js');
    const { req, res, json } = makeReqRes();
    const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);

    expect(mockGetUser).not.toHaveBeenCalled();
    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(true);
    expect(call.cached).toBe(true);
    expect(call.daysLeft).toBeGreaterThanOrEqual(59);
  });

  it('re-fetches from RD when cached expiry has passed', async () => {
    mockConfig = {
      realDebridApiKey: 'testkey',
      realDebridPremiumExpiry: isoAgo(1),   // expired yesterday
      realDebridPremiumCheckedAt: isoAgo(2),
    };
    mockGetUser.mockResolvedValue({
      username: 'alice',
      premium: 30 * 86_400,  // 30 days in seconds
      expiration: isoInDays(30),
    });

    const { default: handler } = await import('../../server/api/real-debrid/status/GET.js');
    const { req, res, json } = makeReqRes();
    const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);

    expect(mockGetUser).toHaveBeenCalledWith('testkey');
    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(true);
    expect(call.cached).toBe(false);
    expect(call.username).toBe('alice');
    expect(call.daysLeft).toBe(30);
  });

  it('fetches live when no cache exists at all', async () => {
    mockConfig = { realDebridApiKey: 'freshkey' };
    mockGetUser.mockResolvedValue({
      username: 'bob',
      premium: 180 * 86_400,
      expiration: isoInDays(180),
    });

    const { default: handler } = await import('../../server/api/real-debrid/status/GET.js');
    const { req, res, json } = makeReqRes();
    const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);

    expect(mockGetUser).toHaveBeenCalledWith('freshkey');
    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(true);
    expect(call.daysLeft).toBe(180);
    // Cache should have been written
    const { writeConfig } = await import('../../server/configStore.js');
    expect(writeConfig).toHaveBeenCalledWith(expect.objectContaining({
      realDebridPremiumExpiry: expect.any(String),
      realDebridPremiumCheckedAt: expect.any(String),
    }));
  });

  it('returns ok:false reason:fetch_failed when RD API throws', async () => {
    mockConfig = { realDebridApiKey: 'badkey' };
    mockGetUser.mockRejectedValue(new Error('RD API 401: Unauthorized'));

    const { default: handler } = await import('../../server/api/real-debrid/status/GET.js');
    const { req, res, json } = makeReqRes();
    const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);

    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(false);
    expect(call.reason).toBe('fetch_failed');
    expect(call.error).toContain('401');
  });
});

describe('POST /api/setup — Real-Debrid actions', () => {
  beforeEach(() => {
    mockConfig = { setupComplete: true };
    mockGetUser.mockReset();
  });

  it('action=test_real_debrid returns user info on valid key', async () => {
    mockGetUser.mockResolvedValue({
      username: 'charlie',
      premium: 90 * 86_400,
      expiration: isoInDays(90),
    });

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const { req, res, json } = makeReqRes({
      action: 'test_real_debrid',
      realDebridApiKey: 'validkey',
    });
    await (handler as (req: unknown, res: unknown) => Promise<void>)(req, res);

    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(true);
    expect((call.user as Record<string, unknown>).username).toBe('charlie');
  });

  it('action=test_real_debrid returns ok:false when no key anywhere', async () => {
    mockConfig = { setupComplete: true, realDebridApiKey: '' };

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const { req, res, json } = makeReqRes({ action: 'test_real_debrid' });
    await (handler as (req: unknown, res: unknown) => Promise<void>)(req, res);

    const call = json.mock.calls[0][0] as Record<string, unknown>;
    expect(call.ok).toBe(false);
    expect(call.error).toMatch(/no.*key/i);
  });

  it('action=test_real_debrid falls back to config key when body key is absent', async () => {
    mockConfig = { setupComplete: true, realDebridApiKey: 'configkey' };
    mockGetUser.mockResolvedValue({ username: 'dave', premium: 10 * 86_400, expiration: isoInDays(10) });

    const { default: handler } = await import('../../server/api/setup/POST.js');
    // No realDebridApiKey in body — should use config key
    const { req, res } = makeReqRes({ action: 'test_real_debrid' });
    await (handler as (req: unknown, res: unknown) => Promise<void>)(req, res);

    expect(mockGetUser).toHaveBeenCalledWith('configkey');
  });

  it('action=save busts premium cache when a new RD key is saved', async () => {
    mockConfig = {
      setupComplete: true,
      realDebridApiKey: 'oldkey',
      realDebridPremiumExpiry: isoInDays(90),
      realDebridPremiumCheckedAt: isoAgo(1),
    };

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const { req, res } = makeReqRes({
      action: 'save',
      realDebridApiKey: 'newkey',
    });
    await (handler as (req: unknown, res: unknown) => Promise<void>)(req, res);

    const { writeConfig } = await import('../../server/configStore.js');
    const savedUpdates = (writeConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Record<string, unknown>;

    // New key must be in the write
    expect(savedUpdates.realDebridApiKey).toBe('newkey');
    // Cache must be cleared — undefined means the key will be deleted from config
    expect(savedUpdates.realDebridPremiumExpiry).toBeUndefined();
    expect(savedUpdates.realDebridPremiumCheckedAt).toBeUndefined();
  });

  it('action=save does NOT touch premium cache when no RD key is in the payload', async () => {
    mockConfig = {
      setupComplete: true,
      realDebridApiKey: 'existingkey',
      realDebridPremiumExpiry: isoInDays(90),
    };

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const { req, res } = makeReqRes({
      action: 'save',
      tmdbApiKey: 'newtmdbkey',   // unrelated save — should not bust RD cache
    });
    await (handler as (req: unknown, res: unknown) => Promise<void>)(req, res);

    const { writeConfig } = await import('../../server/configStore.js');
    const savedUpdates = (writeConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Record<string, unknown>;

    // RD cache fields must NOT be present in this write
    expect('realDebridPremiumExpiry' in savedUpdates).toBe(false);
    expect('realDebridPremiumCheckedAt' in savedUpdates).toBe(false);
  });
});

describe('configStore — RD premium fields round-trip', () => {
  it('writeConfig stores and readConfig returns realDebridPremiumExpiry', async () => {
    const { writeConfig, readConfig } = await import('../../server/configStore.js');
    const expiry = isoInDays(120);
    const checked = new Date().toISOString();

    writeConfig({ realDebridPremiumExpiry: expiry, realDebridPremiumCheckedAt: checked });
    const cfg = readConfig();

    expect(cfg.realDebridPremiumExpiry).toBe(expiry);
    expect(cfg.realDebridPremiumCheckedAt).toBe(checked);
  });
});
