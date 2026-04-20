/**
 * Tests for:
 *   POST /api/jellyfin/Sessions/Playing
 *   POST /api/jellyfin/Sessions/Playing/Progress
 *   POST /api/jellyfin/Sessions/Playing/Stopped
 *
 * All three endpoints persist watch progress to the library.
 * They always return 204 (even on error) so TV apps don't retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, MOVIE_ITEM, SAMPLE_LIBRARY } from './helpers';

// ── Shared library mock ───────────────────────────────────────────────────────

let mockLibrary: typeof SAMPLE_LIBRARY;
let writtenLibrary: typeof SAMPLE_LIBRARY | null = null;

vi.mock('../../server/libraryStore', () => ({
  readLibrary: () => mockLibrary,
  writeLibrary: vi.fn(async (updater: (lib: typeof SAMPLE_LIBRARY) => typeof SAMPLE_LIBRARY) => {
    writtenLibrary = updater([...mockLibrary]);
    mockLibrary = writtenLibrary;
  }),
  writeLibraryDirect: vi.fn((data: typeof SAMPLE_LIBRARY) => {
    writtenLibrary = data;
    mockLibrary = [...data];
  }),
}));

// Import all three handlers after mocking
const { default: playingHandler } = await import(
  '../../server/api/jellyfin/Sessions/Playing/POST'
);
const { default: progressHandler } = await import(
  '../../server/api/jellyfin/Sessions/Playing/Progress/POST'
);
const { default: stoppedHandler } = await import(
  '../../server/api/jellyfin/Sessions/Playing/Stopped/POST'
);

// ── Helper: ticks from seconds ────────────────────────────────────────────────

const toTicks = (seconds: number) => seconds * 10_000_000;

// ── POST /api/jellyfin/Sessions/Playing ──────────────────────────────────────

describe('POST /api/jellyfin/Sessions/Playing', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = JSON.parse(JSON.stringify(SAMPLE_LIBRARY));
    writtenLibrary = null;
  });

  it('returns 204 on success', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(1000) },
    });
    await playingHandler(req, res as never);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it('returns 400 when ItemId is missing', async () => {
    const req = mockReq({ body: { PositionTicks: toTicks(500) } });
    await playingHandler(req, res as never);

    expect(res.statusCode).toBe(400);
  });

  it('persists watchedSeconds from PositionTicks', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(3600) },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchedSeconds).toBe(3600);
  });

  it('calculates watchProgress as percentage of totalSeconds', async () => {
    // MOVIE_ITEM.totalSeconds = 8880 (148 min)
    // 4440 seconds = 50%
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(4440) },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchProgress).toBe(50);
  });

  it('caps watchProgress at 100', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(99999) },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchProgress).toBeLessThanOrEqual(100);
  });

  it('marks watchedAt when EventName=stop and progress >= 90', async () => {
    // 8880 * 0.95 = 8436 seconds → 95%
    const req = mockReq({
      body: {
        ItemId: MOVIE_ITEM.id,
        PositionTicks: toTicks(8436),
        EventName: 'stop',
      },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id) as Record<string, unknown>;
    expect(updated.watchedAt).toBeDefined();
  });

  it('does NOT set watchedAt when EventName=stop but progress < 90', async () => {
    const req = mockReq({
      body: {
        ItemId: MOVIE_ITEM.id,
        PositionTicks: toTicks(1000),
        EventName: 'stop',
      },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id) as Record<string, unknown>;
    expect(updated.watchedAt).toBeUndefined();
  });

  it('updates lastWatchedAt timestamp', async () => {
    const before = new Date().toISOString();
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(500) },
    });
    await playingHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id) as Record<string, unknown>;
    expect(updated.lastWatchedAt).toBeDefined();
    expect(updated.lastWatchedAt as string >= before).toBe(true);
  });
});

// ── POST /api/jellyfin/Sessions/Playing/Progress ─────────────────────────────

describe('POST /api/jellyfin/Sessions/Playing/Progress', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = JSON.parse(JSON.stringify(SAMPLE_LIBRARY));
    writtenLibrary = null;
  });

  it('returns 204 on success', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(1000) },
    });
    await progressHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('returns 204 (not 400) when ItemId is missing — clients must not retry', async () => {
    const req = mockReq({ body: {} });
    await progressHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('persists watchedSeconds', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(2000) },
    });
    await progressHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchedSeconds).toBe(2000);
  });

  it('calculates progress from runtime (minutes)', async () => {
    // MOVIE_ITEM.runtime = 148 min = 8880 sec
    // 4440 sec = 50%
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(4440) },
    });
    await progressHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchProgress).toBe(50);
  });

  it('returns 204 for unknown ItemId without crashing', async () => {
    const req = mockReq({
      body: { ItemId: 'nonexistent-xyz', PositionTicks: toTicks(500) },
    });
    await progressHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('converts ticks to seconds correctly (1 tick = 100ns)', async () => {
    // 30,000,000 ticks = 3 seconds
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: 30_000_000 },
    });
    await progressHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchedSeconds).toBe(3);
  });
});

// ── POST /api/jellyfin/Sessions/Playing/Stopped ──────────────────────────────

describe('POST /api/jellyfin/Sessions/Playing/Stopped', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockLibrary = JSON.parse(JSON.stringify(SAMPLE_LIBRARY));
    writtenLibrary = null;
  });

  it('returns 204 on success', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(5000) },
    });
    await stoppedHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('returns 204 when ItemId is missing', async () => {
    const req = mockReq({ body: {} });
    await stoppedHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('persists final watchedSeconds', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: toTicks(7000) },
    });
    await stoppedHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchedSeconds).toBe(7000);
  });

  it('sets watchProgress to 100 when PlayedToCompletion=true', async () => {
    const req = mockReq({
      body: {
        ItemId: MOVIE_ITEM.id,
        PositionTicks: toTicks(100),
        PlayedToCompletion: true,
      },
    });
    await stoppedHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchProgress).toBe(100);
  });

  it('calculates progress from PositionTicks when PlayedToCompletion is false', async () => {
    // 4440 / 8880 = 50%
    const req = mockReq({
      body: {
        ItemId: MOVIE_ITEM.id,
        PositionTicks: toTicks(4440),
        PlayedToCompletion: false,
      },
    });
    await stoppedHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchProgress).toBe(50);
  });

  it('returns 204 for unknown ItemId without crashing', async () => {
    const req = mockReq({
      body: { ItemId: 'nonexistent-xyz', PositionTicks: toTicks(500) },
    });
    await stoppedHandler(req, res as never);

    expect(res.statusCode).toBe(204);
  });

  it('handles zero PositionTicks gracefully', async () => {
    const req = mockReq({
      body: { ItemId: MOVIE_ITEM.id, PositionTicks: 0 },
    });
    await stoppedHandler(req, res as never);

    const updated = mockLibrary.find(i => i.id === MOVIE_ITEM.id);
    expect(updated!.watchedSeconds).toBe(0);
    expect(updated!.watchProgress).toBe(0);
  });
});
