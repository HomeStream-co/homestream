/**
 * Tests for GET /api/jellyfin/Items
 *
 * Covers:
 *  - Returns all items when no filters applied
 *  - IncludeItemTypes filtering (Movie, Series)
 *  - SearchTerm filtering
 *  - SortBy / SortOrder (SortName, DateCreated, CommunityRating, PremiereDate)
 *  - Pagination (StartIndex, Limit)
 *  - TotalRecordCount reflects unfiltered count
 *  - Jellyfin item shape (Name, Id, Type, MediaType, UserData, etc.)
 *  - Stream URL construction from host header
 *  - Empty library
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, SAMPLE_LIBRARY, MOVIE_ITEM, MOVIE_ITEM_2 } from './helpers';

// ── Mock libraryStore ─────────────────────────────────────────────────────────

let mockLibrary = [...SAMPLE_LIBRARY];

vi.mock('../../server/libraryStore', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: vi.fn(),
  writeLibraryDirect: vi.fn(),
}));

const { default: handler } = await import(
  '../../server/api/jellyfin/Items/GET'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/jellyfin/Items', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = [...SAMPLE_LIBRARY];
  });

  // ── Basic response shape ────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns Items array, TotalRecordCount, and StartIndex', async () => {
      const req = mockReq();
      await handler(req, res as never);

      const body = res.body as Record<string, unknown>;
      expect(Array.isArray(body.Items)).toBe(true);
      expect(typeof body.TotalRecordCount).toBe('number');
      expect(typeof body.StartIndex).toBe('number');
    });

    it('returns all 3 items with no filters', async () => {
      const req = mockReq();
      await handler(req, res as never);

      const body = res.body as { Items: unknown[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(3);
      expect(body.TotalRecordCount).toBe(3);
    });

    it('each item has required Jellyfin fields', async () => {
      const req = mockReq();
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      for (const item of body.Items) {
        expect(item).toHaveProperty('Id');
        expect(item).toHaveProperty('Name');
        expect(item).toHaveProperty('Type');
        expect(item).toHaveProperty('MediaType', 'Video');
        expect(item).toHaveProperty('ServerId', 'homestream-server-001');
        expect(item).toHaveProperty('UserData');
        expect(item).toHaveProperty('Genres');
        // Items list does NOT include People — that's only in Items/:id
        expect(item).not.toHaveProperty('People');
      }
    });

    it('maps movie type to "Movie"', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Movie' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      for (const item of body.Items) {
        expect(item.Type).toBe('Movie');
        expect(item.IsFolder).toBe(false);
      }
    });

    it('maps series type to "Series" with IsFolder=true', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Series' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      expect(body.Items).toHaveLength(1);
      expect(body.Items[0].Type).toBe('Series');
      expect(body.Items[0].IsFolder).toBe(true);
    });
  });

  // ── UserData ────────────────────────────────────────────────────────────────

  describe('UserData', () => {
    it('converts watchedSeconds to PlaybackPositionTicks', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Movie' } });
      await handler(req, res as never);

      const body = res.body as { Items: Array<{ Id: string; UserData: Record<string, unknown> }> };
      const inception = body.Items.find(i => i.Id === MOVIE_ITEM.id);
      expect(inception).toBeDefined();
      // 2700 seconds × 10,000,000 ticks/sec = 27,000,000,000
      expect(inception!.UserData.PlaybackPositionTicks).toBe(2700 * 10_000_000);
    });

    it('marks item as Played when watchProgress >= 90', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Movie' } });
      await handler(req, res as never);

      const body = res.body as { Items: Array<{ Id: string; UserData: Record<string, unknown> }> };
      const darkKnight = body.Items.find(i => i.Id === MOVIE_ITEM_2.id);
      expect(darkKnight!.UserData.Played).toBe(true);
      expect(darkKnight!.UserData.PlayCount).toBe(1);
    });

    it('marks item as not Played when watchProgress < 90', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Movie' } });
      await handler(req, res as never);

      const body = res.body as { Items: Array<{ Id: string; UserData: Record<string, unknown> }> };
      const inception = body.Items.find(i => i.Id === MOVIE_ITEM.id);
      expect(inception!.UserData.Played).toBe(false);
      expect(inception!.UserData.PlayCount).toBe(0);
    });
  });

  // ── Filtering ───────────────────────────────────────────────────────────────

  describe('IncludeItemTypes filtering', () => {
    it('filters to movies only', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Movie' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(2);
      expect(body.TotalRecordCount).toBe(2);
      expect(body.Items.every(i => i.Type === 'Movie')).toBe(true);
    });

    it('filters to series only', async () => {
      const req = mockReq({ query: { IncludeItemTypes: 'Series' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(1);
      expect(body.Items[0].Type).toBe('Series');
    });
  });

  describe('SearchTerm filtering', () => {
    it('filters by partial title match (case-insensitive)', async () => {
      const req = mockReq({ query: { SearchTerm: 'inception' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      expect(body.Items).toHaveLength(1);
      expect(body.Items[0].Name).toBe('Inception');
    });

    it('returns empty array when no titles match', async () => {
      const req = mockReq({ query: { SearchTerm: 'xyznonexistent' } });
      await handler(req, res as never);

      const body = res.body as { Items: unknown[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(0);
      expect(body.TotalRecordCount).toBe(0);
    });

    it('matches multiple items with shared substring', async () => {
      // Both Inception and The Dark Knight have "Nolan" as director but
      // search is title-only — test a shared title substring
      const req = mockReq({ query: { SearchTerm: 'the' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      // "The Dark Knight" contains "the"
      expect(body.Items.some(i => i.Name === 'The Dark Knight')).toBe(true);
    });
  });

  // ── Sorting ─────────────────────────────────────────────────────────────────

  describe('sorting', () => {
    it('sorts by SortName ascending by default', async () => {
      const req = mockReq();
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      const names = body.Items.map(i => i.Name as string);
      expect(names).toEqual([...names].sort());
    });

    it('sorts by SortName descending', async () => {
      const req = mockReq({ query: { SortBy: 'SortName', SortOrder: 'Descending' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      const names = body.Items.map(i => i.Name as string);
      expect(names).toEqual([...names].sort().reverse());
    });

    it('sorts by DateCreated ascending', async () => {
      const req = mockReq({ query: { SortBy: 'DateCreated', SortOrder: 'Ascending' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      const dates = body.Items.map(i => i.DateCreated as string);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] >= dates[i - 1]).toBe(true);
      }
    });

    it('sorts by CommunityRating descending', async () => {
      const req = mockReq({ query: { SortBy: 'CommunityRating', SortOrder: 'Descending' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      const ratings = body.Items
        .map(i => (i.CommunityRating as number | undefined) ?? 0);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i] <= ratings[i - 1]).toBe(true);
      }
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('respects Limit parameter', async () => {
      const req = mockReq({ query: { Limit: '2' } });
      await handler(req, res as never);

      const body = res.body as { Items: unknown[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(2);
      expect(body.TotalRecordCount).toBe(3); // total unchanged
    });

    it('respects StartIndex parameter', async () => {
      const req = mockReq({ query: { StartIndex: '1', Limit: '10' } });
      await handler(req, res as never);

      const body = res.body as { Items: unknown[]; StartIndex: number };
      expect(body.Items).toHaveLength(2); // 3 total - 1 skipped
      expect(body.StartIndex).toBe(1);
    });

    it('returns empty Items when StartIndex exceeds total', async () => {
      const req = mockReq({ query: { StartIndex: '100' } });
      await handler(req, res as never);

      const body = res.body as { Items: unknown[] };
      expect(body.Items).toHaveLength(0);
    });

    it('returns correct page with StartIndex=1, Limit=1', async () => {
      // Sort by name first so order is deterministic
      const req = mockReq({ query: { SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: '1', Limit: '1' } });
      await handler(req, res as never);

      const body = res.body as { Items: Record<string, unknown>[] };
      expect(body.Items).toHaveLength(1);
    });
  });

  // ── Stream URL ──────────────────────────────────────────────────────────────

  describe('stream URL construction', () => {
    it('builds stream URL from host header', async () => {
      const req = mockReq({
        query: { IncludeItemTypes: 'Movie' },
        headers: { host: 'homestream.local:3000' },
        protocol: 'http',
      });
      await handler(req, res as never);

      const body = res.body as { Items: Array<{ MediaSources: Array<{ DirectStreamUrl: string }> }> };
      const inception = body.Items.find(i => (i as Record<string, unknown>).Id === MOVIE_ITEM.id);
      expect(inception!.MediaSources[0].DirectStreamUrl).toContain('homestream.local:3000');
    });

    it('uses x-forwarded-proto and x-forwarded-host when present', async () => {
      const req = mockReq({
        query: { IncludeItemTypes: 'Movie' },
        headers: {
          host: 'internal:3000',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'homestream.example.com',
        },
        protocol: 'http',
      });
      await handler(req, res as never);

      const body = res.body as { Items: Array<{ MediaSources: Array<{ DirectStreamUrl: string }> }> };
      const inception = body.Items.find(i => (i as Record<string, unknown>).Id === MOVIE_ITEM.id);
      expect(inception!.MediaSources[0].DirectStreamUrl).toContain('https://homestream.example.com');
    });
  });

  // ── Empty library ───────────────────────────────────────────────────────────

  describe('empty library', () => {
    it('returns empty Items and TotalRecordCount=0', async () => {
      mockLibrary = [];
      const req = mockReq();
      await handler(req, res as never);

      const body = res.body as { Items: unknown[]; TotalRecordCount: number };
      expect(body.Items).toHaveLength(0);
      expect(body.TotalRecordCount).toBe(0);
    });
  });
});
