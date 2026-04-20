/**
 * Unit tests for Profiles HTTP handlers
 *
 * Tests every endpoint:
 *   GET    /api/profiles
 *   POST   /api/profiles
 *   GET    /api/profiles/:id
 *   PATCH  /api/profiles/:id
 *   DELETE /api/profiles/:id
 *   POST   /api/profiles/:id/pin   (set / verify / clear)
 *   POST   /api/profiles/:id/verify-pin
 *
 * Strategy: vi.mock() profilesStore so handlers never touch disk.
 * Each test controls exactly what the store returns/throws.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReq, mockRes } from '../jellyfin/helpers';

// ── Mock profilesStore ────────────────────────────────────────────────────────

const store = {
  readProfiles: vi.fn(),
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  setPin: vi.fn(),
  verifyPin: vi.fn(),
  clearPin: vi.fn(),
  hasPin: vi.fn(),
  toPublic: vi.fn((p: object) => ({ ...p, hasPin: false })),
};

vi.mock('../../server/profilesStore', () => store);

// Import handlers AFTER mocking
const { default: listHandler }      = await import('../../server/api/profiles/GET');
const { default: createHandler }    = await import('../../server/api/profiles/POST');
const { default: getOneHandler }    = await import('../../server/api/profiles/[id]/GET');
const { default: patchHandler }     = await import('../../server/api/profiles/[id]/PATCH');
const { default: deleteHandler }    = await import('../../server/api/profiles/[id]/DELETE');
const { default: pinHandler }       = await import('../../server/api/profiles/[id]/pin/POST');
const { default: verifyPinHandler } = await import('../../server/api/profiles/[id]/verify-pin/POST');

// Reset all mocks between tests to avoid call-count bleed
afterEach(() => { vi.clearAllMocks(); });

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADULT = {
  id: 'adult', name: 'Adult', avatar: '🎬', color: 'ring-primary',
  restricted: false, isBuiltIn: true, pinHash: undefined, createdAt: new Date(0).toISOString(),
};
const KIDS = {
  id: 'kids', name: 'Kids', avatar: '🧒', color: 'ring-yellow-400',
  restricted: true, isBuiltIn: true, pinHash: undefined, createdAt: new Date(0).toISOString(),
};
const CUSTOM = {
  id: 'profile_1', name: 'Alice', avatar: '🦊', color: 'ring-red-400',
  restricted: false, isBuiltIn: false, pinHash: undefined, createdAt: '2024-01-01T00:00:00.000Z',
};

// ── GET /api/profiles ─────────────────────────────────────────────────────────

describe('GET /api/profiles', () => {
  beforeEach(() => {
    store.readProfiles.mockReturnValue([ADULT, KIDS]);
    store.toPublic.mockImplementation((p: object) => ({ ...(p as object), hasPin: false }));
  });

  it('returns 200 with profiles array', () => {
    const res = mockRes();
    listHandler(mockReq(), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { profiles: unknown[] }).profiles).toHaveLength(2);
  });

  it('maps each profile through toPublic', () => {
    const res = mockRes();
    listHandler(mockReq(), res as never);
    expect(store.toPublic).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when store throws', () => {
    store.readProfiles.mockImplementation(() => { throw new Error('disk error'); });
    const res = mockRes();
    listHandler(mockReq(), res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/profiles ────────────────────────────────────────────────────────

describe('POST /api/profiles', () => {
  beforeEach(() => {
    store.createProfile.mockReturnValue(CUSTOM);
    store.toPublic.mockImplementation((p: object) => ({ ...(p as object), hasPin: false }));
  });

  it('creates profile and returns 201', () => {
    const req = mockReq({ body: { name: 'Alice', avatar: '🦊', color: 'ring-red-400', restricted: false } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(res.statusCode).toBe(201);
    expect((res.body as { profile: { name: string } }).profile.name).toBe('Alice');
  });

  it('returns 400 when name is missing', () => {
    const req = mockReq({ body: { avatar: '🦊' } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when name is blank whitespace', () => {
    const req = mockReq({ body: { name: '   ' } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when store throws Maximum profiles error', () => {
    store.createProfile.mockImplementation(() => { throw new Error('Maximum of 6 profiles reached'); });
    const req = mockReq({ body: { name: 'Overflow' } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('uses defaults for optional fields', () => {
    const req = mockReq({ body: { name: 'Bob' } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(store.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: '🎭', color: 'ring-primary', restricted: false })
    );
  });

  it('returns 500 on unexpected store error', () => {
    store.createProfile.mockImplementation(() => { throw new Error('unexpected'); });
    const req = mockReq({ body: { name: 'Bob' } });
    const res = mockRes();
    createHandler(req as never, res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /api/profiles/:id ─────────────────────────────────────────────────────

describe('GET /api/profiles/:id', () => {
  beforeEach(() => {
    store.toPublic.mockImplementation((p: object) => ({ ...(p as object), hasPin: false }));
  });

  it('returns 200 with profile when found', () => {
    store.getProfile.mockReturnValue(ADULT);
    const req = mockReq({ params: { id: 'adult' } });
    const res = mockRes();
    getOneHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { profile: { id: string } }).profile.id).toBe('adult');
  });

  it('returns 404 when profile not found', () => {
    store.getProfile.mockReturnValue(undefined);
    const req = mockReq({ params: { id: 'nonexistent' } });
    const res = mockRes();
    getOneHandler(req as never, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on store error', () => {
    store.getProfile.mockImplementation(() => { throw new Error('disk error'); });
    const req = mockReq({ params: { id: 'adult' } });
    const res = mockRes();
    getOneHandler(req as never, res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ── PATCH /api/profiles/:id ───────────────────────────────────────────────────

describe('PATCH /api/profiles/:id', () => {
  beforeEach(() => {
    store.updateProfile.mockReturnValue({ ...CUSTOM, name: 'Updated' });
    store.toPublic.mockImplementation((p: object) => ({ ...(p as object), hasPin: false }));
  });

  it('returns 200 with updated profile', () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { name: 'Updated' } });
    const res = mockRes();
    patchHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { profile: { name: string } }).profile.name).toBe('Updated');
  });

  it('returns 404 when profile not found', () => {
    store.updateProfile.mockImplementation(() => { throw new Error('Profile not found'); });
    const req = mockReq({ params: { id: 'ghost' }, body: { name: 'X' } });
    const res = mockRes();
    patchHandler(req as never, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected error', () => {
    store.updateProfile.mockImplementation(() => { throw new Error('disk error'); });
    const req = mockReq({ params: { id: 'profile_1' }, body: { name: 'X' } });
    const res = mockRes();
    patchHandler(req as never, res as never);
    expect(res.statusCode).toBe(500);
  });

  it('passes all patchable fields to store', () => {
    const req = mockReq({
      params: { id: 'profile_1' },
      body: { name: 'New', avatar: '🐻', color: 'ring-blue-400', restricted: true },
    });
    const res = mockRes();
    patchHandler(req as never, res as never);
    expect(store.updateProfile).toHaveBeenCalledWith('profile_1', {
      name: 'New', avatar: '🐻', color: 'ring-blue-400', restricted: true,
    });
  });
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────

describe('DELETE /api/profiles/:id', () => {
  beforeEach(() => {
    store.deleteProfile.mockReturnValue(undefined);
  });

  it('returns 200 ok on success', () => {
    const req = mockReq({ params: { id: 'profile_1' } });
    const res = mockRes();
    deleteHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('returns 404 when profile not found', () => {
    store.deleteProfile.mockImplementation(() => { throw new Error('Profile not found'); });
    const req = mockReq({ params: { id: 'ghost' } });
    const res = mockRes();
    deleteHandler(req as never, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when trying to delete a built-in', () => {
    store.deleteProfile.mockImplementation(() => { throw new Error('Built-in profiles cannot be deleted'); });
    const req = mockReq({ params: { id: 'adult' } });
    const res = mockRes();
    deleteHandler(req as never, res as never);
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', () => {
    store.deleteProfile.mockImplementation(() => { throw new Error('disk error'); });
    const req = mockReq({ params: { id: 'profile_1' } });
    const res = mockRes();
    deleteHandler(req as never, res as never);
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/profiles/:id/pin ────────────────────────────────────────────────

describe('POST /api/profiles/:id/pin', () => {
  beforeEach(() => {
    store.setPin.mockResolvedValue(undefined);
    store.verifyPin.mockResolvedValue(true);
    store.clearPin.mockReturnValue(undefined);
    store.hasPin.mockReturnValue(false);
  });

  // action=set
  it('set: returns 200 ok on valid PIN', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'set', pin: '1234' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('set: returns 400 for PIN shorter than 4 digits', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'set', pin: '12' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('set: returns 400 for non-numeric PIN', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'set', pin: 'abcd' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('set: returns 400 for PIN longer than 8 digits', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'set', pin: '123456789' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  // action=verify
  it('verify: returns { valid: true } for correct PIN', async () => {
    store.verifyPin.mockResolvedValue(true);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'verify', pin: '1234' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect((res.body as { valid: boolean }).valid).toBe(true);
  });

  it('verify: returns { valid: false } for wrong PIN', async () => {
    store.verifyPin.mockResolvedValue(false);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'verify', pin: '0000' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect((res.body as { valid: boolean }).valid).toBe(false);
  });

  it('verify: returns 400 when pin is missing', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'verify' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  // action=clear
  it('clear: returns 200 ok when no PIN is set', async () => {
    store.hasPin.mockReturnValue(false);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'clear' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('clear: returns 200 ok when PIN is set and correct current PIN provided', async () => {
    store.hasPin.mockReturnValue(true);
    store.verifyPin.mockResolvedValue(true);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'clear', pin: '1234' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('clear: returns 403 when current PIN is wrong', async () => {
    store.hasPin.mockReturnValue(true);
    store.verifyPin.mockResolvedValue(false);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'clear', pin: '0000' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(403);
  });

  it('clear: returns 400 when PIN is set but no current PIN provided', async () => {
    store.hasPin.mockReturnValue(true);
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'clear' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  // unknown action
  it('returns 400 for unknown action', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { action: 'explode' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when action is missing', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: {} });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when store throws not found', async () => {
    store.setPin.mockRejectedValue(new Error('Profile not found'));
    const req = mockReq({ params: { id: 'ghost' }, body: { action: 'set', pin: '1234' } });
    const res = mockRes();
    await pinHandler(req as never, res as never);
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/profiles/:id/verify-pin ────────────────────────────────────────

describe('POST /api/profiles/:id/verify-pin', () => {
  beforeEach(() => {
    store.verifyPin.mockResolvedValue(true);
  });

  it('returns { valid: true } for correct PIN', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: { pin: '1234' } });
    const res = mockRes();
    await verifyPinHandler(req as never, res as never);
    expect((res.body as { valid: boolean }).valid).toBe(true);
  });

  it('returns { valid: false } for wrong PIN', async () => {
    store.verifyPin.mockResolvedValue(false);
    const req = mockReq({ params: { id: 'profile_1' }, body: { pin: '0000' } });
    const res = mockRes();
    await verifyPinHandler(req as never, res as never);
    expect((res.body as { valid: boolean }).valid).toBe(false);
  });

  it('returns 400 when pin is missing', async () => {
    const req = mockReq({ params: { id: 'profile_1' }, body: {} });
    const res = mockRes();
    await verifyPinHandler(req as never, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when profile not found', async () => {
    store.verifyPin.mockRejectedValue(new Error('Profile not found'));
    const req = mockReq({ params: { id: 'ghost' }, body: { pin: '1234' } });
    const res = mockRes();
    await verifyPinHandler(req as never, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected error', async () => {
    store.verifyPin.mockRejectedValue(new Error('disk error'));
    const req = mockReq({ params: { id: 'profile_1' }, body: { pin: '1234' } });
    const res = mockRes();
    await verifyPinHandler(req as never, res as never);
    expect(res.statusCode).toBe(500);
  });
});
