/**
 * Tests for GET /api/jellyfin/Videos/:id/stream
 *
 * Covers:
 *  - Redirects to /api/stream/<filename> for known items
 *  - 404 for unknown item id
 *  - 404 for item with no filename
 *  - Filename is URL-encoded in redirect
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, MOVIE_ITEM, SERIES_ITEM, SAMPLE_LIBRARY } from './helpers';

// ── Mock libraryStore ─────────────────────────────────────────────────────────

let mockLibrary = [...SAMPLE_LIBRARY];

vi.mock('../../server/libraryStore', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: vi.fn(),
  writeLibraryDirect: vi.fn(),
}));

const { default: handler } = await import(
  '../../server/api/jellyfin/Videos/[id]/stream/GET'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/jellyfin/Videos/:id/stream', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = [...SAMPLE_LIBRARY];
  });

  it('redirects to /api/stream/<filename> for a known movie', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    expect(res.redirect).toHaveBeenCalledOnce();
    expect(res.redirectUrl).toContain('/api/stream/');
    expect(res.redirectUrl).toContain(encodeURIComponent(MOVIE_ITEM.filename!));
  });

  it('uses a 302 redirect', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    // redirect() is called with (302, url)
    const [code] = res.redirect.mock.calls[0] as [number, string];
    expect(code).toBe(302);
  });

  it('returns 404 for unknown item id', async () => {
    const req = mockReq({ params: { id: 'nonexistent-xyz' } });
    await handler(req, res as never);

    expect(res.statusCode).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('returns 404 for series item with no filename', async () => {
    const req = mockReq({ params: { id: SERIES_ITEM.id } });
    await handler(req, res as never);

    expect(res.statusCode).toBe(404);
  });

  it('URL-encodes filenames with spaces or special characters', async () => {
    mockLibrary = [{
      id: 'special-001',
      title: 'My Movie (2024)',
      type: 'movie' as const,
      year: '2024',
      genre: ['Drama'],
      poster: '',
      backdrop: '',
      imdbRating: '7.0',
      rated: 'PG',
      plot: '',
      filename: 'my movie (2024).mp4',
      filepath: '/media/my movie (2024).mp4',
      addedAt: '2024-01-01T00:00:00.000Z',
      watchProgress: 0,
      watchedSeconds: 0,
      totalSeconds: 0,
      runtime: 90,
      director: 'Director',
      actors: 'Actor',
    }];

    const req = mockReq({ params: { id: 'special-001' } });
    await handler(req, res as never);

    expect(res.redirectUrl).toContain(encodeURIComponent('my movie (2024).mp4'));
    // Should NOT contain raw spaces
    expect(res.redirectUrl).not.toContain(' ');
  });

  it('returns 404 when library is empty', async () => {
    mockLibrary = [];
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    expect(res.statusCode).toBe(404);
  });
});
