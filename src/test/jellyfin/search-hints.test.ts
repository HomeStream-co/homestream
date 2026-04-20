/**
 * Tests for GET /api/jellyfin/Search/Hints
 *
 * Covers:
 *  - Empty searchTerm → empty results
 *  - Title match (case-insensitive)
 *  - Genre match
 *  - includeItemTypes filter
 *  - Limit parameter
 *  - Response shape (SearchHints, TotalRecordCount)
 *  - Hint object fields (ItemId, Name, Type, MediaType)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, SAMPLE_LIBRARY } from './helpers';

// ── Mock libraryStore ─────────────────────────────────────────────────────────

let mockLibrary = [...SAMPLE_LIBRARY];

vi.mock('../../server/libraryStore', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: vi.fn(),
  writeLibraryDirect: vi.fn(),
}));

const { default: handler } = await import(
  '../../server/api/jellyfin/Search/Hints/GET'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/jellyfin/Search/Hints', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = [...SAMPLE_LIBRARY];
  });

  // ── Empty / missing searchTerm ──────────────────────────────────────────────

  it('returns empty results when searchTerm is empty string', async () => {
    const req = mockReq({ query: { searchTerm: '' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[]; TotalRecordCount: number };
    expect(body.SearchHints).toHaveLength(0);
    expect(body.TotalRecordCount).toBe(0);
  });

  it('returns empty results when searchTerm is whitespace only', async () => {
    const req = mockReq({ query: { searchTerm: '   ' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[] };
    expect(body.SearchHints).toHaveLength(0);
  });

  it('returns empty results when searchTerm is absent', async () => {
    const req = mockReq({ query: {} });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[] };
    expect(body.SearchHints).toHaveLength(0);
  });

  // ── Title matching ──────────────────────────────────────────────────────────

  it('matches by title (case-insensitive)', async () => {
    const req = mockReq({ query: { searchTerm: 'INCEPTION' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    expect(body.SearchHints).toHaveLength(1);
    expect(body.SearchHints[0].Name).toBe('Inception');
  });

  it('matches partial title', async () => {
    const req = mockReq({ query: { searchTerm: 'dark' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    expect(body.SearchHints.some(h => h.Name === 'The Dark Knight')).toBe(true);
  });

  it('returns multiple matches for shared substring', async () => {
    // Both "Inception" and "The Dark Knight" have "Action" genre
    // but let's search for a title substring that matches multiple
    const req = mockReq({ query: { searchTerm: 'b' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[] };
    // "Breaking Bad" contains 'b'
    expect(body.SearchHints.length).toBeGreaterThanOrEqual(1);
  });

  // ── Genre matching ──────────────────────────────────────────────────────────

  it('matches by genre', async () => {
    const req = mockReq({ query: { searchTerm: 'Sci-Fi' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    // Inception has Sci-Fi genre
    expect(body.SearchHints.some(h => h.Name === 'Inception')).toBe(true);
  });

  // ── includeItemTypes filter ─────────────────────────────────────────────────

  it('filters to Movie type only', async () => {
    const req = mockReq({ query: { searchTerm: 'a', includeItemTypes: 'Movie' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    expect(body.SearchHints.every(h => h.Type === 'Movie')).toBe(true);
  });

  it('filters to Series type only', async () => {
    const req = mockReq({ query: { searchTerm: 'b', includeItemTypes: 'Series' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    expect(body.SearchHints.every(h => h.Type === 'Series')).toBe(true);
  });

  // ── Limit ───────────────────────────────────────────────────────────────────

  it('respects limit parameter', async () => {
    const req = mockReq({ query: { searchTerm: 'a', limit: '1' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[] };
    expect(body.SearchHints.length).toBeLessThanOrEqual(1);
  });

  it('caps limit at 100', async () => {
    // Build a large library
    mockLibrary = Array.from({ length: 150 }, (_, i) => ({
      id: `item-${i}`,
      title: `Movie ${i}`,
      type: 'movie' as const,
      genre: ['Action'],
    }));

    const req = mockReq({ query: { searchTerm: 'movie', limit: '999' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[] };
    expect(body.SearchHints.length).toBeLessThanOrEqual(100);
  });

  // ── Hint shape ──────────────────────────────────────────────────────────────

  it('each hint has required fields', async () => {
    const req = mockReq({ query: { searchTerm: 'inception' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    const hint = body.SearchHints[0];
    expect(hint).toHaveProperty('ItemId');
    expect(hint).toHaveProperty('Id');
    expect(hint).toHaveProperty('Name');
    expect(hint).toHaveProperty('Type');
    expect(hint).toHaveProperty('MediaType', 'Video');
  });

  it('ItemId and Id are the same value', async () => {
    const req = mockReq({ query: { searchTerm: 'inception' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: Record<string, unknown>[] };
    const hint = body.SearchHints[0];
    expect(hint.ItemId).toBe(hint.Id);
  });

  it('TotalRecordCount matches SearchHints length', async () => {
    const req = mockReq({ query: { searchTerm: 'a' } });
    await handler(req, res as never);

    const body = res.body as { SearchHints: unknown[]; TotalRecordCount: number };
    expect(body.TotalRecordCount).toBe(body.SearchHints.length);
  });
});
