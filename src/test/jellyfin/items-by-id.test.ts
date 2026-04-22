/**
 * Tests for GET /api/jellyfin/Items/:id
 *
 * Covers:
 *  - Returns correct item by id
 *  - 404 for unknown id
 *  - Full metadata shape (People, MediaSources, TranscodingUrl, etc.)
 *  - UserData ticks conversion
 *  - Series vs Movie type mapping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, MOVIE_ITEM, SERIES_ITEM, SAMPLE_LIBRARY } from './helpers';

// ── Mock jellyfinAuth (always pass — ADMIN_PASSWORD env var must not block) ───
vi.mock('../../server/jellyfinAuth', () => ({ requireJellyfinAuth: () => true }));
vi.mock('../../server/jellyfinAuth.js', () => ({ requireJellyfinAuth: () => true }));

// ── Mock libraryStore ─────────────────────────────────────────────────────────

let mockLibrary = [...SAMPLE_LIBRARY];

vi.mock('../../server/libraryStore', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: vi.fn(),
  writeLibraryDirect: vi.fn(),
}));

const { default: handler } = await import(
  '../../server/api/jellyfin/Items/[id]/GET'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/jellyfin/Items/:id', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = [...SAMPLE_LIBRARY];
  });

  // ── Basic lookup ────────────────────────────────────────────────────────────

  it('returns the correct item by id', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Id).toBe(MOVIE_ITEM.id);
    expect(body.Name).toBe(MOVIE_ITEM.title);
  });

  it('returns 404 for unknown id', async () => {
    const req = mockReq({ params: { id: 'nonexistent-id-xyz' } });
    await handler(req, res as never);

    expect(res.statusCode).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // ── Metadata shape ──────────────────────────────────────────────────────────

  it('includes all required Jellyfin fields', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('Id');
    expect(body).toHaveProperty('Name');
    expect(body).toHaveProperty('Type');
    expect(body).toHaveProperty('MediaType', 'Video');
    expect(body).toHaveProperty('ServerId', 'homestream-server-001');
    expect(body).toHaveProperty('Genres');
    expect(body).toHaveProperty('UserData');
    expect(body).toHaveProperty('ImageTags');
    expect(body).toHaveProperty('BackdropImageTags');
    expect(body).toHaveProperty('MediaSources');
    expect(body).toHaveProperty('People');
  });

  it('uses aiSummary as Overview when enrichment is present', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Overview).toBe(MOVIE_ITEM.enrichment.aiSummary);
  });

  it('falls back to plot when no enrichment', async () => {
    const req = mockReq({ params: { id: SERIES_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Overview).toBe(SERIES_ITEM.plot);
  });

  // ── People ──────────────────────────────────────────────────────────────────

  it('includes director in People array', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { People: Array<{ Name: string; Type: string }> };
    const director = body.People.find(p => p.Type === 'Director');
    expect(director).toBeDefined();
    expect(director!.Name).toBe(MOVIE_ITEM.director);
  });

  it('includes actors in People array', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { People: Array<{ Name: string; Type: string }> };
    const actors = body.People.filter(p => p.Type === 'Actor');
    expect(actors.length).toBeGreaterThan(0);
    // Actors are split by comma — first actor should be present
    expect(actors[0].Name).toBe('Leonardo DiCaprio');
  });

  it('limits actors to 5 max', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { People: Array<{ Type: string }> };
    const actors = body.People.filter(p => p.Type === 'Actor');
    expect(actors.length).toBeLessThanOrEqual(5);
  });

  // ── MediaSources ────────────────────────────────────────────────────────────

  it('includes MediaSources with DirectStreamUrl for items with filename', async () => {
    const req = mockReq({
      params: { id: MOVIE_ITEM.id },
      headers: { host: 'localhost:3000' },
      protocol: 'http',
    });
    await handler(req, res as never);

    const body = res.body as { MediaSources: Array<Record<string, unknown>> };
    expect(body.MediaSources).toHaveLength(1);
    const source = body.MediaSources[0];
    expect(source.SupportsDirectPlay).toBe(true);
    expect(source.SupportsDirectStream).toBe(true);
    expect(typeof source.DirectStreamUrl).toBe('string');
    expect(source.DirectStreamUrl as string).toContain(MOVIE_ITEM.filename);
  });

  it('includes TranscodingUrl for HLS fallback', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { MediaSources: Array<Record<string, unknown>> };
    expect(body.MediaSources[0].TranscodingUrl).toContain(MOVIE_ITEM.id);
    expect(body.MediaSources[0].TranscodingSubProtocol).toBe('hls');
  });

  it('returns empty MediaSources for series (no filename)', async () => {
    const req = mockReq({ params: { id: SERIES_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { MediaSources: unknown[] };
    expect(body.MediaSources).toHaveLength(0);
  });

  // ── UserData ticks ──────────────────────────────────────────────────────────

  it('converts watchedSeconds to PlaybackPositionTicks correctly', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { UserData: Record<string, unknown> };
    // MOVIE_ITEM.watchedSeconds = 2700
    expect(body.UserData.PlaybackPositionTicks).toBe(2700 * 10_000_000);
  });

  it('sets PlaybackPositionTicks to 0 when no watchedSeconds', async () => {
    const req = mockReq({ params: { id: SERIES_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as { UserData: Record<string, unknown> };
    expect(body.UserData.PlaybackPositionTicks).toBe(0);
  });

  // ── Type mapping ────────────────────────────────────────────────────────────

  it('maps movie to Type="Movie" and IsFolder=false', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Type).toBe('Movie');
    expect(body.IsFolder).toBe(false);
  });

  it('maps series to Type="Series" and IsFolder=true', async () => {
    const req = mockReq({ params: { id: SERIES_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Type).toBe('Series');
    expect(body.IsFolder).toBe(true);
  });

  // ── ProductionYear ──────────────────────────────────────────────────────────

  it('converts year string to integer ProductionYear', async () => {
    const req = mockReq({ params: { id: MOVIE_ITEM.id } });
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.ProductionYear).toBe(2010);
    expect(typeof body.ProductionYear).toBe('number');
  });
});
