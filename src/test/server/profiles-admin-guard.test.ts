/**
 * profiles-admin-guard.test.ts
 *
 * Tests for the isAdmin self-promotion guard in PATCH /api/profiles/:id.
 *
 * Security invariant: only a profile that is already an admin may set
 * isAdmin=true on any profile (including itself). A non-admin profile
 * must receive 403 Forbidden when it tries to grant admin privileges.
 *
 * Other PATCH fields (name, avatar, color, restricted, maxRating) must
 * remain accessible to any authenticated session regardless of the
 * caller's admin status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockActiveProfileId = 'kids'; // default: non-admin caller

const mockProfiles: Record<string, { id: string; isAdmin: boolean; name: string }> = {
  adult: { id: 'adult', isAdmin: true,  name: 'Adult' },
  kids:  { id: 'kids',  isAdmin: false, name: 'Kids'  },
  custom: { id: 'custom', isAdmin: false, name: 'Custom' },
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/ratingGate.js', () => ({
  getActiveProfileId: vi.fn(() => mockActiveProfileId),
}));

vi.mock('../../server/profilesStore.js', () => ({
  getProfile: vi.fn((id: string) => mockProfiles[id] ?? undefined),
  updateProfile: vi.fn((id: string, data: Record<string, unknown>) => ({
    id,
    name: data.name ?? mockProfiles[id]?.name ?? id,
    isAdmin: data.isAdmin ?? mockProfiles[id]?.isAdmin ?? false,
    avatar: '🎬',
    color: 'ring-primary',
    restricted: false,
    isBuiltIn: false,
    createdAt: new Date(0).toISOString(),
  })),
  toPublic: vi.fn((p: Record<string, unknown>) => p),
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function makeReqRes(profileId: string, body: unknown) {
  const req = {
    params: { id: profileId },
    body,
    cookies: { 'hs-profile': mockActiveProfileId },
  } as unknown as Request;

  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;

  return { req, res, data };
}

// ── Import handler ────────────────────────────────────────────────────────────

const { default: patchHandler } = await import('../../server/api/profiles/[id]/PATCH.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/profiles/:id — isAdmin self-promotion guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Non-admin caller trying to grant admin ──────────────────────────────────

  it('returns 403 when a non-admin profile tries to set isAdmin=true on itself', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('kids', { isAdmin: true });
    patchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).error).toBe('forbidden');
  });

  it('returns 403 when a non-admin profile tries to set isAdmin=true on another profile', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('custom', { isAdmin: true });
    patchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).error).toBe('forbidden');
  });

  it('returns 403 when a non-admin profile tries to promote a custom profile to admin', async () => {
    mockActiveProfileId = 'custom';
    const { req, res, data } = makeReqRes('adult', { isAdmin: true });
    patchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).error).toBe('forbidden');
  });

  // ── Admin caller granting admin ─────────────────────────────────────────────

  it('allows an admin profile to set isAdmin=true on another profile', async () => {
    mockActiveProfileId = 'adult';
    const { req, res, data } = makeReqRes('custom', { isAdmin: true });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  it('allows an admin profile to set isAdmin=true on itself (no-op but valid)', async () => {
    mockActiveProfileId = 'adult';
    const { req, res, data } = makeReqRes('adult', { isAdmin: true });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  // ── isAdmin=false is always allowed (revoking admin, not granting) ──────────

  it('allows a non-admin profile to set isAdmin=false (no privilege escalation)', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('custom', { isAdmin: false });
    patchHandler(req, res);
    // isAdmin=false is not a privilege escalation — guard should not fire
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  // ── Non-admin fields are always accessible ──────────────────────────────────

  it('allows a non-admin profile to update name without triggering the guard', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('kids', { name: 'New Name' });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  it('allows a non-admin profile to update avatar and color', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('kids', { avatar: '🐱', color: 'ring-blue-400' });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  it('allows a non-admin profile to update maxRating', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('kids', { maxRating: 'PG-13' });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });

  // ── Unknown caller profile (cookie missing / invalid) ──────────────────────

  it('blocks isAdmin=true when getActiveProfileId returns an unknown id (no profile found)', async () => {
    mockActiveProfileId = 'nonexistent-profile-id';
    const { req, res, data } = makeReqRes('custom', { isAdmin: true });
    patchHandler(req, res);
    // getProfile('nonexistent-profile-id') returns undefined → not admin → 403
    expect(res.status).toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).error).toBe('forbidden');
  });

  // ── isAdmin omitted entirely — guard must not fire ──────────────────────────

  it('does not trigger the guard when isAdmin is not in the request body', async () => {
    mockActiveProfileId = 'kids';
    const { req, res, data } = makeReqRes('kids', { name: 'Safe Update' });
    patchHandler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect((data.json as Record<string, unknown>).profile).toBeTruthy();
  });
});
