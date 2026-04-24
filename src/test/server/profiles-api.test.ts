/**
 * profiles-api.test.ts
 *
 * Tests for the profiles API endpoints:
 *   POST   /api/profiles        — create profile
 *   DELETE /api/profiles/:id    — delete profile
 *   PATCH  /api/profiles/:id    — update profile
 *   POST   /api/profiles/:id/pin — set/verify/clear PIN
 *
 * These endpoints are the user-facing surface of profilesStore.
 * Bugs here mean users can delete built-in profiles, bypass PIN auth,
 * or create unlimited profiles.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock profilesStore ────────────────────────────────────────────────────────

const mockCreateProfile = vi.fn();
const mockDeleteProfile = vi.fn();
const mockUpdateProfile = vi.fn();
const mockVerifyPin     = vi.fn();
const mockSetPin        = vi.fn();
const mockClearPin      = vi.fn();
const mockHasPin        = vi.fn();
const mockToPublic      = vi.fn((p: Record<string, unknown>) => ({ ...p, hasPin: false }));

vi.mock('../../server/profilesStore.js', () => ({
  createProfile: (...args: unknown[]) => mockCreateProfile(...args),
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  verifyPin:     (...args: unknown[]) => mockVerifyPin(...args),
  setPin:        (...args: unknown[]) => mockSetPin(...args),
  clearPin:      (...args: unknown[]) => mockClearPin(...args),
  hasPin:        (...args: unknown[]) => mockHasPin(...args),
  toPublic:      (...args: unknown[]) => mockToPublic(...args as [Record<string, unknown>]),
  readProfiles:  () => [],
  getProfile:    () => undefined,
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// pin/POST.ts uses rateLimiter — mock it so PIN tests don't hit real rate limiting
vi.mock('../../server/rateLimiter.js', () => ({
  checkRateLimit: () => ({ allowed: true }),
  recordFailure:  () => undefined,
  getFailureDelay: () => 0,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown = {}, params: Record<string, string> = {}) {
  const req = {
    body,
    params,
    cookies: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

// ── Import handlers AFTER mocks ───────────────────────────────────────────────

const { default: createHandler } = await import('../../server/api/profiles/POST.js');
const { default: deleteHandler } = await import('../../server/api/profiles/[id]/DELETE.js');
const { default: updateHandler } = await import('../../server/api/profiles/[id]/PATCH.js');
const { default: pinHandler }    = await import('../../server/api/profiles/[id]/pin/POST.js');

// ── POST /api/profiles ────────────────────────────────────────────────────────

describe('POST /api/profiles — validation', () => {
  beforeEach(() => { mockCreateProfile.mockClear(); mockToPublic.mockClear(); });

  it('returns 400 when name is missing', () => {
    const { req, res } = makeReqRes({});
    createHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when name is empty string', () => {
    const { req, res } = makeReqRes({ name: '   ' });
    createHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/profiles — success', () => {
  beforeEach(() => {
    mockCreateProfile.mockClear();
    mockToPublic.mockClear();
    mockCreateProfile.mockReturnValue({
      id: 'profile_123',
      name: 'Alice',
      avatar: '🎭',
      color: 'ring-primary',
      restricted: false,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    });
  });

  it('returns 201 on successful creation', () => {
    const { req, res } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('calls createProfile with the provided name', () => {
    const { req, res } = makeReqRes({ name: 'Alice', avatar: '🎭', color: 'ring-blue-400', restricted: false });
    createHandler(req, res);
    expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }));
  });

  it('uses default avatar when not provided', () => {
    const { req, res } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatar: '🎭' }));
  });

  it('uses default color when not provided', () => {
    const { req, res } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ color: 'ring-primary' }));
  });

  it('uses default restricted:false when not provided', () => {
    const { req, res } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ restricted: false }));
  });

  it('calls toPublic to strip pinHash before returning', () => {
    const { req, res } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect(mockToPublic).toHaveBeenCalledOnce();
  });

  it('returns profile in response body', () => {
    const { req, res, data } = makeReqRes({ name: 'Alice' });
    createHandler(req, res);
    expect((data.json as { profile: unknown }).profile).toBeDefined();
  });
});

describe('POST /api/profiles — 400 on max profiles', () => {
  beforeEach(() => { mockCreateProfile.mockClear(); });

  it('returns 400 when Maximum profiles error is thrown', () => {
    mockCreateProfile.mockImplementation(() => { throw new Error('Maximum of 6 profiles reached'); });
    const { req, res } = makeReqRes({ name: 'TooMany' });
    createHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('includes the error message in the response', () => {
    mockCreateProfile.mockImplementation(() => { throw new Error('Maximum of 6 profiles reached'); });
    const { req, res, data } = makeReqRes({ name: 'TooMany' });
    createHandler(req, res);
    expect((data.json as { error: string }).error).toContain('Maximum');
  });
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────

describe('DELETE /api/profiles/:id', () => {
  beforeEach(() => { mockDeleteProfile.mockClear(); });

  it('calls deleteProfile with the id param', () => {
    mockDeleteProfile.mockReturnValue(undefined);
    const { req, res } = makeReqRes({}, { id: 'profile_123' });
    deleteHandler(req, res);
    expect(mockDeleteProfile).toHaveBeenCalledWith('profile_123');
  });

  it('returns ok:true on successful delete', () => {
    mockDeleteProfile.mockReturnValue(undefined);
    const { req, res, data } = makeReqRes({}, { id: 'profile_123' });
    deleteHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('returns 403 when trying to delete a built-in profile', () => {
    mockDeleteProfile.mockImplementation(() => { throw new Error('Built-in profiles cannot be deleted'); });
    const { req, res } = makeReqRes({}, { id: 'adult' });
    deleteHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when profile not found', () => {
    mockDeleteProfile.mockImplementation(() => { throw new Error('Profile not found'); });
    const { req, res } = makeReqRes({}, { id: 'nonexistent' });
    deleteHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── PATCH /api/profiles/:id ───────────────────────────────────────────────────

describe('PATCH /api/profiles/:id', () => {
  beforeEach(() => {
    mockUpdateProfile.mockClear();
    mockToPublic.mockClear();
    mockUpdateProfile.mockReturnValue({
      id: 'profile_123',
      name: 'Updated',
      avatar: '🎭',
      color: 'ring-primary',
      restricted: false,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    });
  });

  it('calls updateProfile with id and body fields', () => {
    const { req, res } = makeReqRes({ name: 'Updated', restricted: true }, { id: 'profile_123' });
    updateHandler(req, res);
    expect(mockUpdateProfile).toHaveBeenCalledWith('profile_123', expect.objectContaining({ name: 'Updated', restricted: true }));
  });

  it('returns the updated profile via toPublic', () => {
    const { req, res, data } = makeReqRes({ name: 'Updated' }, { id: 'profile_123' });
    updateHandler(req, res);
    expect((data.json as { profile: unknown }).profile).toBeDefined();
    expect(mockToPublic).toHaveBeenCalledOnce();
  });

  it('returns 404 when profile not found', () => {
    mockUpdateProfile.mockImplementation(() => { throw new Error('Profile not found'); });
    const { req, res } = makeReqRes({ name: 'X' }, { id: 'nonexistent' });
    updateHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── POST /api/profiles/:id/pin ────────────────────────────────────────────────

describe('POST /api/profiles/:id/pin — set PIN', () => {
  beforeEach(() => {
    mockSetPin.mockClear();
    mockVerifyPin.mockClear();
    mockClearPin.mockClear();
    mockHasPin.mockClear();
    mockSetPin.mockResolvedValue(undefined);
    mockVerifyPin.mockResolvedValue(true);
  });

  it('calls setPin when action is "set"', async () => {
    const { req, res } = makeReqRes({ action: 'set', pin: '1234' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect(mockSetPin).toHaveBeenCalledWith('profile_123', '1234');
  });

  it('returns ok:true after setting PIN', async () => {
    const { req, res, data } = makeReqRes({ action: 'set', pin: '1234' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls verifyPin when action is "verify"', async () => {
    const { req, res } = makeReqRes({ action: 'verify', pin: '1234' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect(mockVerifyPin).toHaveBeenCalledWith('profile_123', '1234');
  });

  it('returns valid:true when PIN is correct', async () => {
    mockVerifyPin.mockResolvedValue(true);
    const { req, res, data } = makeReqRes({ action: 'verify', pin: '1234' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect((data.json as { valid: boolean }).valid).toBe(true);
  });

  it('returns valid:false when PIN is wrong', async () => {
    mockVerifyPin.mockResolvedValue(false);
    const { req, res, data } = makeReqRes({ action: 'verify', pin: '9999' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect((data.json as { valid: boolean }).valid).toBe(false);
  });

  it('calls clearPin when action is "clear"', async () => {
    mockClearPin.mockReturnValue(undefined);
    const { req, res } = makeReqRes({ action: 'clear' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect(mockClearPin).toHaveBeenCalledWith('profile_123');
  });

  it('returns 400 for unknown action', async () => {
    const { req, res } = makeReqRes({ action: 'unknown' }, { id: 'profile_123' });
    await pinHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
