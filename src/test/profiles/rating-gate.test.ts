/**
 * Unit tests for ratingGate.ts
 *
 * Tests:
 *   getActiveProfileId  — cookie reading + fallback
 *   checkRating         — per-item gate (returns bool, sends 403 on deny)
 *   filterByRating      — list filter (removes restricted items)
 *
 * Strategy: vi.mock() profilesStore so no disk I/O. Each test controls
 * exactly which profile is "active" via the mock and the hs-profile cookie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Profile fixtures ──────────────────────────────────────────────────────────

const ADMIN_PROFILE = {
  id: 'adult',
  name: 'Adult',
  restricted: false,
  isAdmin: true,
  maxRating: undefined,
};

const UNRESTRICTED_PROFILE = {
  id: 'custom',
  name: 'Custom',
  restricted: false,
  isAdmin: false,
  maxRating: undefined,
};

const RESTRICTED_DEFAULT = {
  id: 'kids',
  name: 'Kids',
  restricted: true,
  isAdmin: false,
  maxRating: undefined,   // default set: G, PG, TV-Y, TV-Y7, TV-G, TV-PG
};

const RESTRICTED_PG13 = {
  id: 'teen',
  name: 'Teen',
  restricted: true,
  isAdmin: false,
  maxRating: 'PG-13',    // allows up to PG-13
};

const RESTRICTED_R = {
  id: 'mature',
  name: 'Mature',
  restricted: true,
  isAdmin: false,
  maxRating: 'R',        // allows up to R
};

// ── Mock profilesStore ────────────────────────────────────────────────────────

const store = { getProfile: vi.fn() };
vi.mock('../../server/profilesStore', () => store);
vi.mock('../../server/profilesStore.js', () => store);

// Import AFTER mocking
const { getActiveProfileId, checkRating, filterByRating } = await import(
  '../../server/ratingGate'
);

afterEach(() => { vi.clearAllMocks(); });

// ── Helper: build minimal mock req/res ────────────────────────────────────────

function req(cookieProfileId?: string): Request {
  return {
    cookies: cookieProfileId !== undefined ? { 'hs-profile': cookieProfileId } : {},
  } as unknown as Request;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function res(): MockRes {
  const r: MockRes = { statusCode: 200, body: undefined, status: vi.fn(), json: vi.fn() };
  r.status.mockImplementation((code: number) => { r.statusCode = code; return r; });
  r.json.mockImplementation((data: unknown) => { r.body = data; return r; });
  return r;
}

// ── getActiveProfileId ────────────────────────────────────────────────────────

describe('getActiveProfileId', () => {
  it('returns the cookie value when hs-profile is set', () => {
    expect(getActiveProfileId(req('kids'))).toBe('kids');
  });

  it('falls back to "adult" when no cookie is present', () => {
    expect(getActiveProfileId(req())).toBe('adult');
  });

  it('falls back to "adult" when cookie is empty string', () => {
    expect(getActiveProfileId(req(''))).toBe('adult');
  });

  it('falls back to "adult" when cookie is whitespace', () => {
    expect(getActiveProfileId(req('   '))).toBe('adult');
  });

  it('trims whitespace from the cookie value', () => {
    expect(getActiveProfileId(req('  kids  '))).toBe('kids');
  });
});

// ── checkRating — unrestricted / admin profiles ───────────────────────────────

describe('checkRating — admin / unrestricted profiles', () => {
  it('allows any rating for an admin profile', () => {
    store.getProfile.mockReturnValue(ADMIN_PROFILE);
    const r = res();
    expect(checkRating(req('adult'), r as unknown as Response, 'NC-17')).toBe(true);
    expect(r.statusCode).toBe(200);
  });

  it('allows any rating for an unrestricted non-admin profile', () => {
    store.getProfile.mockReturnValue(UNRESTRICTED_PROFILE);
    const r = res();
    expect(checkRating(req('custom'), r as unknown as Response, 'R')).toBe(true);
  });

  it('allows when profile is not found (unknown cookie)', () => {
    store.getProfile.mockReturnValue(undefined);
    const r = res();
    expect(checkRating(req('ghost'), r as unknown as Response, 'X')).toBe(true);
  });
});

// ── checkRating — no rating info ──────────────────────────────────────────────
//
// FIX (🟡): Previously checkRating() returned true (allowed) for undefined /
// empty / 'N/A' rated values even for restricted profiles, while
// filterByRating() returned false (blocked) for the same values. The two
// functions are now consistent: restricted profiles are blocked from unrated
// content in both the stream gate and the list filter.
//
// Unrestricted / admin profiles still allow unrated content (no change).

describe('checkRating — missing / empty rating (restricted profile)', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_DEFAULT); });

  it('blocks when rated is undefined (conservative default for restricted profiles)', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, undefined)).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('blocks when rated is empty string', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, '')).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('blocks when rated is "N/A"', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, 'N/A')).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('403 body uses "(unrated)" message when rated is undefined', () => {
    const r = res();
    checkRating(req('kids'), r as unknown as Response, undefined);
    const body = r.body as { message: string; rated: null };
    expect(body.message).toContain('unrated');
    expect(body.rated).toBeNull();
  });
});

describe('checkRating — missing / empty rating (unrestricted / admin profiles)', () => {
  it('allows undefined rated for admin profile', () => {
    store.getProfile.mockReturnValue(ADMIN_PROFILE);
    const r = res();
    expect(checkRating(req('adult'), r as unknown as Response, undefined)).toBe(true);
  });

  it('allows N/A rated for unrestricted profile', () => {
    store.getProfile.mockReturnValue(UNRESTRICTED_PROFILE);
    const r = res();
    expect(checkRating(req('custom'), r as unknown as Response, 'N/A')).toBe(true);
  });

  it('allows undefined rated when profile is not found', () => {
    store.getProfile.mockReturnValue(undefined);
    const r = res();
    expect(checkRating(req('ghost'), r as unknown as Response, undefined)).toBe(true);
  });
});

// ── checkRating — default restricted profile (no maxRating) ──────────────────

describe('checkRating — restricted profile (default kids set)', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_DEFAULT); });

  it.each(['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'])(
    'allows %s',
    (rating) => {
      const r = res();
      expect(checkRating(req('kids'), r as unknown as Response, rating)).toBe(true);
      expect(r.statusCode).toBe(200);
    },
  );

  it.each(['PG-13', 'R', 'NC-17', 'TV-14', 'TV-MA'])(
    'blocks %s with 403',
    (rating) => {
      const r = res();
      expect(checkRating(req('kids'), r as unknown as Response, rating)).toBe(false);
      expect(r.statusCode).toBe(403);
    },
  );

  it('blocks unrated content (NR)', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, 'NR')).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('blocks unknown rating strings (conservative default)', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, 'BANANA')).toBe(false);
    expect(r.statusCode).toBe(403);
  });

  it('403 body includes rated and profileId', () => {
    const r = res();
    checkRating(req('kids'), r as unknown as Response, 'R');
    const body = r.body as { rated: string; profileId: string };
    expect(body.rated).toBe('R');
    expect(body.profileId).toBe('kids');
  });

  it('is case-insensitive for rating strings', () => {
    const r = res();
    expect(checkRating(req('kids'), r as unknown as Response, 'pg')).toBe(true);
  });
});

// ── checkRating — restricted profile with maxRating = PG-13 ──────────────────

describe('checkRating — restricted profile with maxRating PG-13', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_PG13); });

  it.each(['G', 'PG', 'PG-13'])('allows %s', (rating) => {
    const r = res();
    expect(checkRating(req('teen'), r as unknown as Response, rating)).toBe(true);
  });

  it.each(['R', 'NC-17'])('blocks %s', (rating) => {
    const r = res();
    expect(checkRating(req('teen'), r as unknown as Response, rating)).toBe(false);
    expect(r.statusCode).toBe(403);
  });
});

// ── checkRating — restricted profile with maxRating = R ──────────────────────

describe('checkRating — restricted profile with maxRating R', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_R); });

  it.each(['G', 'PG', 'PG-13', 'R'])('allows %s', (rating) => {
    const r = res();
    expect(checkRating(req('mature'), r as unknown as Response, rating)).toBe(true);
  });

  it.each(['NC-17', 'X'])('blocks %s', (rating) => {
    const r = res();
    expect(checkRating(req('mature'), r as unknown as Response, rating)).toBe(false);
    expect(r.statusCode).toBe(403);
  });
});

// ── filterByRating ────────────────────────────────────────────────────────────

const LIBRARY = [
  { id: '1', title: 'Toy Story',    rated: 'G'     },
  { id: '2', title: 'Spider-Man',   rated: 'PG-13' },
  { id: '3', title: 'The Godfather',rated: 'R'     },
  { id: '4', title: 'Showgirls',    rated: 'NC-17' },
  { id: '5', title: 'Blue Planet',  rated: 'TV-G'  },
  { id: '6', title: 'Breaking Bad', rated: 'TV-MA' },
  { id: '7', title: 'Unrated Film', rated: 'NR'    },
  { id: '8', title: 'No Rating'                    },  // rated undefined
];

describe('filterByRating — admin profile', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(ADMIN_PROFILE); });

  it('returns all items unchanged', () => {
    const result = filterByRating(req('adult'), LIBRARY);
    expect(result).toHaveLength(LIBRARY.length);
  });
});

describe('filterByRating — unrestricted profile', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(UNRESTRICTED_PROFILE); });

  it('returns all items unchanged', () => {
    const result = filterByRating(req('custom'), LIBRARY);
    expect(result).toHaveLength(LIBRARY.length);
  });
});

describe('filterByRating — default restricted profile', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_DEFAULT); });

  it('keeps only G, PG, TV-Y, TV-Y7, TV-G, TV-PG rated items', () => {
    const result = filterByRating(req('kids'), LIBRARY);
    const ids = result.map(i => i.id);
    expect(ids).toContain('1');   // G
    expect(ids).toContain('5');   // TV-G
    expect(ids).not.toContain('2'); // PG-13
    expect(ids).not.toContain('3'); // R
    expect(ids).not.toContain('4'); // NC-17
    expect(ids).not.toContain('6'); // TV-MA
    expect(ids).not.toContain('7'); // NR
    expect(ids).not.toContain('8'); // undefined rated
  });

  it('blocks items with undefined rated field', () => {
    const result = filterByRating(req('kids'), LIBRARY);
    expect(result.find(i => i.id === '8')).toBeUndefined();
  });

  it('blocks NR (not rated) items', () => {
    const result = filterByRating(req('kids'), LIBRARY);
    expect(result.find(i => i.id === '7')).toBeUndefined();
  });
});

describe('filterByRating — restricted profile with maxRating PG-13', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_PG13); });

  it('includes G, PG, PG-13 but not R or NC-17', () => {
    const result = filterByRating(req('teen'), LIBRARY);
    const ids = result.map(i => i.id);
    expect(ids).toContain('1');   // G
    expect(ids).toContain('2');   // PG-13
    expect(ids).not.toContain('3'); // R
    expect(ids).not.toContain('4'); // NC-17
  });
});

describe('filterByRating — unknown profile (no cookie)', () => {
  it('returns all items when profile lookup returns undefined', () => {
    store.getProfile.mockReturnValue(undefined);
    const result = filterByRating(req(), LIBRARY);
    expect(result).toHaveLength(LIBRARY.length);
  });
});

describe('filterByRating — empty library', () => {
  beforeEach(() => { store.getProfile.mockReturnValue(RESTRICTED_DEFAULT); });

  it('returns empty array for empty input', () => {
    expect(filterByRating(req('kids'), [])).toHaveLength(0);
  });
});
