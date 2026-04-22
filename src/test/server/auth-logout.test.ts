/**
 * auth-logout.test.ts
 *
 * Tests for POST /api/auth/logout and POST /api/auth/logout-all
 *
 * Logout is a security-critical operation. If it doesn't actually invalidate
 * the session token, users who click "logout" are still authenticated — a
 * serious security hole on a shared family server.
 *
 * Coverage:
 *   POST /api/auth/logout
 *     - Calls deleteSession with the token from the cookie
 *     - Clears the hs_session cookie
 *     - Returns ok:true
 *     - Does not throw when no cookie is present (graceful)
 *
 *   POST /api/auth/logout-all
 *     - Calls clearAllSessions
 *     - Returns ok:true
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock sessionStore ─────────────────────────────────────────────────────────
// logout/POST.ts imports deleteSession from sessionStore.js
// logout-all/POST.ts imports clearAllSessions from auth/login/POST.js (re-export)
// We mock both paths.

const mockDeleteSession    = vi.fn();
const mockClearAllSessions = vi.fn();

vi.mock('../../server/sessionStore.js', () => ({
  deleteSession:    (...args: unknown[]) => mockDeleteSession(...args),
  clearAllSessions: (...args: unknown[]) => mockClearAllSessions(...args),
  isValidSession:   () => true,
  createSession:    () => 'mock-token',
  getSessionCount:  () => 0,
  SESSION_TTL_MS:   604800000,
}));

// logout-all/POST.ts imports clearAllSessions from login/POST.js (which re-exports it)
vi.mock('../../server/api/auth/login/POST.js', () => ({
  clearAllSessions: (...args: unknown[]) => mockClearAllSessions(...args),
  isValidSession:   () => true,
  createSession:    () => 'mock-token',
  getSessionCount:  () => 0,
  SESSION_TTL_MS:   604800000,
  default:          vi.fn(),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(cookies: Record<string, string> = {}) {
  const req = {
    cookies,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    params: {},
    body: {},
  } as unknown as Request;

  const clearedCookies: string[] = [];
  const data: { json?: unknown } = {};

  const res = {
    clearCookie: vi.fn((name: string) => { clearedCookies.push(name); return res; }),
    json:        vi.fn((v: unknown) => { data.json = v; return res; }),
    status:      vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res, data, clearedCookies };
}

// ── Import handlers AFTER mocks ───────────────────────────────────────────────

const { default: logoutHandler }    = await import('../../server/api/auth/logout/POST.js');
const { default: logoutAllHandler } = await import('../../server/api/auth/logout-all/POST.js');

// ── Tests: POST /api/auth/logout ──────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    mockDeleteSession.mockClear();
    mockClearAllSessions.mockClear();
  });

  it('returns ok:true', async () => {
    const { req, res, data } = makeReqRes({ hs_session: 'my-token' });
    await logoutHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls deleteSession with the token from the cookie', async () => {
    const { req, res } = makeReqRes({ hs_session: 'my-token-abc' });
    await logoutHandler(req, res);
    expect(mockDeleteSession).toHaveBeenCalledWith('my-token-abc');
  });

  it('clears the hs_session cookie', async () => {
    const { req, res, clearedCookies } = makeReqRes({ hs_session: 'my-token' });
    await logoutHandler(req, res);
    expect(clearedCookies).toContain('hs_session');
  });

  it('does not call deleteSession when no cookie present', async () => {
    const { req, res } = makeReqRes({}); // no hs_session cookie
    await logoutHandler(req, res);
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('still clears the cookie even when no session token present', async () => {
    const { req, res, clearedCookies } = makeReqRes({});
    await logoutHandler(req, res);
    expect(clearedCookies).toContain('hs_session');
  });

  it('still returns ok:true when no cookie present', async () => {
    const { req, res, data } = makeReqRes({});
    await logoutHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('does not call clearAllSessions (only deletes the one token)', async () => {
    const { req, res } = makeReqRes({ hs_session: 'my-token' });
    await logoutHandler(req, res);
    expect(mockClearAllSessions).not.toHaveBeenCalled();
  });
});

// ── Tests: POST /api/auth/logout-all ─────────────────────────────────────────

describe('POST /api/auth/logout-all', () => {
  beforeEach(() => {
    mockDeleteSession.mockClear();
    mockClearAllSessions.mockClear();
  });

  it('returns ok:true', async () => {
    const { req, res, data } = makeReqRes({ hs_session: 'my-token' });
    await logoutAllHandler(req, res);
    expect((data.json as { ok: boolean }).ok).toBe(true);
  });

  it('calls clearAllSessions', async () => {
    const { req, res } = makeReqRes({ hs_session: 'my-token' });
    await logoutAllHandler(req, res);
    expect(mockClearAllSessions).toHaveBeenCalledOnce();
  });

  it('clears the hs_session cookie', async () => {
    const { req, res, clearedCookies } = makeReqRes({ hs_session: 'my-token' });
    await logoutAllHandler(req, res);
    expect(clearedCookies).toContain('hs_session');
  });
});
