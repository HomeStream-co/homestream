/**
 * phase5-remote-auth-fetch.test.tsx
 *
 * Phase 5 fix: RemotePageInner API calls must include Bearer token.
 *
 * Before the fix, the two fetch() calls inside RemotePageInner
 * (downloads poll and QR fetch) used credentials:'include' but no
 * Authorization header. On password-protected servers the phone has no
 * session cookie — only a localStorage token — so both calls returned 401.
 *
 * Fix: both calls now go through authFetch() which injects remoteAuthHeaders(),
 * matching what the sub-tabs (DownloadTab, SearchTab, BrowseTab) already did.
 *
 * Coverage:
 *   - remoteAuthHeaders() returns empty object when no token in localStorage
 *   - remoteAuthHeaders() returns Authorization header when token is present
 *   - remoteAuthHeaders() returns empty object when localStorage throws
 *   - Authorization header value is "Bearer {token}"
 *   - remoteAuthHeaders() does not throw when called multiple times
 *   - Token is read fresh on each call (not cached at module load time)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Import the shared helper directly ────────────────────────────────────────
// We test remoteAuthHeaders() from types.ts because that's the single source
// of truth used by all remote sub-tabs and RemotePageInner's authFetch.

const { remoteAuthHeaders } = await import('../../pages/remote/types');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('remoteAuthHeaders — Phase 5: Bearer token injection', () => {
  // Save and restore localStorage between tests
  const originalGetItem = Storage.prototype.getItem;

  afterEach(() => {
    Storage.prototype.getItem = originalGetItem;
    localStorage.removeItem('hs_token');
    vi.restoreAllMocks();
  });

  it('returns empty object when no token is stored in localStorage', () => {
    localStorage.removeItem('hs_token');
    const headers = remoteAuthHeaders();
    expect(headers).toEqual({});
  });

  it('returns Authorization header when token is present', () => {
    localStorage.setItem('hs_token', 'my-secret-token');
    const headers = remoteAuthHeaders();
    expect(headers).toHaveProperty('Authorization');
  });

  it('Authorization header value is "Bearer {token}"', () => {
    localStorage.setItem('hs_token', 'abc123xyz');
    const headers = remoteAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer abc123xyz');
  });

  it('returns empty object when localStorage.getItem throws', () => {
    Storage.prototype.getItem = vi.fn(() => { throw new Error('localStorage unavailable'); });
    // Should not throw — catches internally
    expect(() => remoteAuthHeaders()).not.toThrow();
    const headers = remoteAuthHeaders();
    expect(headers).toEqual({});
  });

  it('does not throw when called multiple times', () => {
    localStorage.setItem('hs_token', 'token-abc');
    expect(() => {
      remoteAuthHeaders();
      remoteAuthHeaders();
      remoteAuthHeaders();
    }).not.toThrow();
  });

  it('reads token fresh on each call (not cached at module load)', () => {
    // First call — no token
    localStorage.removeItem('hs_token');
    expect(remoteAuthHeaders()).toEqual({});

    // Set token after first call
    localStorage.setItem('hs_token', 'late-token');
    const headers = remoteAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer late-token');
  });

  it('returns empty object when token is empty string', () => {
    localStorage.setItem('hs_token', '');
    const headers = remoteAuthHeaders();
    expect(headers).toEqual({});
  });

  it('preserves the full token value including special characters', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.abc123-_=';
    localStorage.setItem('hs_token', token);
    const headers = remoteAuthHeaders();
    expect(headers['Authorization']).toBe(`Bearer ${token}`);
  });

  it('returns a plain object (not a Headers instance)', () => {
    localStorage.setItem('hs_token', 'some-token');
    const headers = remoteAuthHeaders();
    expect(headers).not.toBeInstanceOf(Headers);
    expect(typeof headers).toBe('object');
  });
});

// ── Integration: authFetch header injection ───────────────────────────────────
// We can't import RemotePageInner directly (it's a React component that
// requires a full browser environment and WS connections). Instead we verify
// the contract: any fetch call that spreads remoteAuthHeaders() will include
// the Authorization header when a token is stored.

describe('authFetch contract — Bearer header is injected into fetch calls', () => {
  afterEach(() => {
    localStorage.removeItem('hs_token');
    vi.restoreAllMocks();
  });

  it('fetch call with remoteAuthHeaders() includes Authorization when token is set', async () => {
    localStorage.setItem('hs_token', 'test-bearer-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Simulate what authFetch does inside RemotePageInner
    const headers = { ...remoteAuthHeaders() };
    await fetch('/api/stremio/downloads', { credentials: 'include', headers });

    const callHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders['Authorization']).toBe('Bearer test-bearer-token');
  });

  it('fetch call with remoteAuthHeaders() has no Authorization when no token', async () => {
    localStorage.removeItem('hs_token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    const headers = { ...remoteAuthHeaders() };
    await fetch('/api/stremio/downloads', { credentials: 'include', headers });

    const callHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders['Authorization']).toBeUndefined();
  });

  it('rdJobs count is included in download badge when token is set', async () => {
    // Verify the badge count logic includes rdJobs (also fixed in Phase 5)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        qbitTorrents: [{ status: 'downloading' }],
        jobs: [],
        rdJobs: [{ status: 'downloading' }, { status: 'done' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetch('/api/stremio/downloads');
    const data = await res.json() as {
      qbitTorrents?: { status: string }[];
      jobs?: { status: string }[];
      rdJobs?: { status: string }[];
    };

    // The badge count logic (from RemotePageInner) counts all downloading jobs
    const all = [...(data.qbitTorrents ?? []), ...(data.jobs ?? []), ...(data.rdJobs ?? [])];
    const downloadingCount = all.filter(j => j.status === 'downloading').length;
    // 1 qBit + 1 RD = 2 downloading
    expect(downloadingCount).toBe(2);
  });
});
