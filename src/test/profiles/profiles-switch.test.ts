/**
 * Unit tests for POST /api/profiles/switch
 *
 * Tests:
 *   - Clear active profile (empty profileId)
 *   - Switch to a profile without a PIN
 *   - Switch to a profile with a PIN (correct / wrong / missing)
 *   - 404 for unknown profile
 *   - 500 on unexpected store error
 *   - Cookie is set with correct attributes on success
 *   - Cookie is cleared on empty profileId
 *
 * Strategy: vi.mock() profilesStore so no disk I/O. The mock `res` captures
 * cookie calls via a `cookies` map so we can assert name/value/options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReq } from '../jellyfin/helpers';
import type { Request, Response } from 'express';

// ── Extend MockRes with cookie tracking ───────────────────────────────────────

interface MockRes {
  statusCode: number;
  body: unknown;
  ended: boolean;
  cookies: Record<string, { value: string; options?: Record<string, unknown> }>;
  clearedCookies: string[];
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    ended: false,
    cookies: {},
    clearedCookies: [],
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };

  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });

  res.json.mockImplementation((data: unknown) => {
    res.body = data;
    res.ended = true;
    return res;
  });

  res.cookie.mockImplementation(
    (name: string, value: string, options?: Record<string, unknown>) => {
      res.cookies[name] = { value, options };
      return res;
    },
  );

  res.clearCookie.mockImplementation((name: string) => {
    res.clearedCookies.push(name);
    return res;
  });

  return res;
}

// ── Mock profilesStore ────────────────────────────────────────────────────────

const ADULT_NO_PIN = {
  id: 'adult',
  name: 'Adult',
  avatar: '🎬',
  color: 'ring-primary',
  restricted: false,
  isBuiltIn: true,
  isAdmin: true,
  pinHash: undefined,
  maxRating: undefined,
  createdAt: new Date(0).toISOString(),
};

const KIDS_NO_PIN = {
  id: 'kids',
  name: 'Kids',
  avatar: '🧒',
  color: 'ring-yellow-400',
  restricted: true,
  isBuiltIn: true,
  isAdmin: false,
  pinHash: undefined,
  maxRating: undefined,
  createdAt: new Date(0).toISOString(),
};

const ALICE_WITH_PIN = {
  id: 'profile_alice',
  name: 'Alice',
  avatar: '🦊',
  color: 'ring-red-400',
  restricted: false,
  isBuiltIn: false,
  isAdmin: false,
  pinHash: '$2b$10$hashedpin',   // non-empty → has a PIN
  maxRating: undefined,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const store = {
  getProfile: vi.fn(),
  verifyPin: vi.fn(),
  toPublic: vi.fn((p: object) => ({ ...p, hasPin: false })),
};

vi.mock('../../server/profilesStore', () => store);
vi.mock('../../server/profilesStore.js', () => store);

vi.mock('../../server/authMiddleware', () => ({ requireAuth: () => true }));
vi.mock('../../server/authMiddleware.js', () => ({ requireAuth: () => true }));

// Import handler AFTER mocks are registered
const { default: switchHandler } = await import(
  '../../server/api/profiles/switch/POST'
);

afterEach(() => { vi.clearAllMocks(); });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/profiles/switch — clear profile', () => {
  it('clears the hs-profile cookie when profileId is empty string', async () => {
    const req = mockReq({ body: { profileId: '' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.clearedCookies).toContain('hs-profile');
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { profileId: null }).profileId).toBeNull();
  });

  it('clears the cookie when profileId is whitespace only', async () => {
    const req = mockReq({ body: { profileId: '   ' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.clearedCookies).toContain('hs-profile');
  });

  it('clears the cookie when profileId is absent', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.clearedCookies).toContain('hs-profile');
  });
});

describe('POST /api/profiles/switch — no-PIN profile', () => {
  beforeEach(() => {
    store.getProfile.mockReturnValue(ADULT_NO_PIN);
    store.toPublic.mockImplementation((p: object) => ({ ...p, hasPin: false }));
  });

  it('returns 200 and sets hs-profile cookie', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.cookies['hs-profile'].value).toBe('adult');
  });

  it('sets cookie as httpOnly', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.cookies['hs-profile'].options?.httpOnly).toBe(true);
  });

  it('sets cookie sameSite to strict', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.cookies['hs-profile'].options?.sameSite).toBe('strict');
  });

  it('sets cookie maxAge to 30 days in ms', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    const maxAge = res.cookies['hs-profile'].options?.maxAge as number;
    expect(maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('returns the public profile in the response body', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    const body = res.body as { ok: boolean; profile: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.profile.id).toBe('adult');
  });

  it('does not call verifyPin when profile has no PIN', async () => {
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(store.verifyPin).not.toHaveBeenCalled();
  });

  it('switches to a restricted kids profile without PIN', async () => {
    store.getProfile.mockReturnValue(KIDS_NO_PIN);
    const req = mockReq({ body: { profileId: 'kids' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.cookies['hs-profile'].value).toBe('kids');
  });
});

describe('POST /api/profiles/switch — PIN-protected profile', () => {
  beforeEach(() => {
    store.getProfile.mockReturnValue(ALICE_WITH_PIN);
    store.toPublic.mockImplementation((p: object) => ({ ...p, hasPin: true }));
  });

  it('returns 401 requiresPin when no PIN provided', async () => {
    const req = mockReq({ body: { profileId: 'profile_alice' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(401);
    expect((res.body as { requiresPin: boolean }).requiresPin).toBe(true);
  });

  it('returns 401 when PIN is wrong', async () => {
    store.verifyPin.mockResolvedValue(false);
    const req = mockReq({ body: { profileId: 'profile_alice', pin: '0000' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(401);
    expect((res.body as { requiresPin: boolean }).requiresPin).toBe(true);
  });

  it('sets cookie and returns 200 when PIN is correct', async () => {
    store.verifyPin.mockResolvedValue(true);
    const req = mockReq({ body: { profileId: 'profile_alice', pin: '1234' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.cookies['hs-profile'].value).toBe('profile_alice');
  });

  it('calls verifyPin with correct profileId and pin', async () => {
    store.verifyPin.mockResolvedValue(true);
    const req = mockReq({ body: { profileId: 'profile_alice', pin: '5678' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(store.verifyPin).toHaveBeenCalledWith('profile_alice', '5678');
  });

  it('does NOT set cookie when PIN is wrong', async () => {
    store.verifyPin.mockResolvedValue(false);
    const req = mockReq({ body: { profileId: 'profile_alice', pin: '0000' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.cookies['hs-profile']).toBeUndefined();
  });
});

describe('POST /api/profiles/switch — error cases', () => {
  it('returns 404 when profile does not exist', async () => {
    store.getProfile.mockReturnValue(undefined);
    const req = mockReq({ body: { profileId: 'ghost' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected store error', async () => {
    store.getProfile.mockImplementation(() => { throw new Error('disk error'); });
    const req = mockReq({ body: { profileId: 'adult' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 when verifyPin rejects unexpectedly', async () => {
    store.getProfile.mockReturnValue(ALICE_WITH_PIN);
    store.verifyPin.mockRejectedValue(new Error('bcrypt crash'));
    const req = mockReq({ body: { profileId: 'profile_alice', pin: '1234' } });
    const res = mockRes();
    await switchHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(500);
  });
});
