/**
 * stats-api.test.ts
 *
 * Full coverage of GET /api/stats
 *
 * Tests cover:
 *   - Auth guard (401 when unauthenticated)
 *   - Returns correct libraryCount and libraryBytes
 *   - Codec breakdown (count + bytes per codec)
 *   - Resolution breakdown (4K/1080p/720p/SD)
 *   - Content type split (movies/shows/other)
 *   - Watch time totals and topWatched list
 *   - Recently added (sorted by addedAt desc, max 5)
 *   - Genre distribution (top 10, sorted by count desc)
 *   - categoryBytes (movies/tv/other)
 *   - downloadSpeed null when qBit unreachable
 *   - downloadSpeed populated when qBit reachable
 *   - diskStats null when mediaDir not configured
 *   - 500 handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadLibrary  = vi.fn();
const mockReadConfig   = vi.fn();
const mockIsReachable  = vi.fn();
const mockGetTransferInfo = vi.fn();
let   mockAuthed = true;

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: (...a: unknown[]) => mockReadLibrary(...a),
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: (...a: unknown[]) => mockReadConfig(...a),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable:     (...a: unknown[]) => mockIsReachable(...a),
  getTransferInfo: (...a: unknown[]) => mockGetTransferInfo(...a),
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

// Mock child_process execSync (used for df disk stats)
vi.mock('child_process', () => ({
  execSync: () => '/dev/sda1  100000000  50000000  50000000  50% /media',
}));

// Mock fs (existsSync + statSync for file sizes)
vi.mock('fs', () => ({
  default: {
    existsSync: () => false, // no files on disk in tests
    statSync:   () => ({ size: 0 }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as {
    statusCode: number; body: unknown;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {}, params: {}, body: {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies: { session: 'tok' },
    ...overrides,
  } as unknown as Request;
}

// ── Sample library ────────────────────────────────────────────────────────────

const LIBRARY = [
  {
    id: 'm1', title: 'Action Movie', type: 'movie',
    fileSize: 4_000_000_000, codec: 'h264', height: 1080,
    watchedSeconds: 7200, totalSeconds: 7200, watchProgress: 1.0,
    lastWatchedAt: '2024-06-01T00:00:00Z',
    addedAt: '2024-01-01T00:00:00Z',
    genre: ['Action', 'Thriller'],
    year: '2020',
  },
  {
    id: 'm2', title: '4K Drama', type: 'movie',
    fileSize: 20_000_000_000, codec: 'hevc', height: 2160,
    watchedSeconds: 3600, totalSeconds: 5400, watchProgress: 0.67,
    lastWatchedAt: '2024-05-01T00:00:00Z',
    addedAt: '2024-02-01T00:00:00Z',
    genre: ['Drama'],
    year: '2021',
  },
  {
    id: 's1', title: 'Sci-Fi Show', type: 'series',
    fileSize: 8_000_000_000, codec: 'h264', height: 720,
    watchedSeconds: 1800, totalSeconds: 3600, watchProgress: 0.5,
    lastWatchedAt: '2024-04-01T00:00:00Z',
    addedAt: '2024-03-01T00:00:00Z',
    genre: ['Sci-Fi', 'Action'],
    year: '2022',
  },
  {
    id: 'o1', title: 'Old SD Film', type: 'movie',
    fileSize: 700_000_000, codec: 'mpeg4', height: 480,
    watchedSeconds: 0, totalSeconds: 5400,
    addedAt: '2023-12-01T00:00:00Z',
    genre: ['Comedy'],
    year: '1999',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/stats', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadLibrary.mockReset().mockReturnValue(LIBRARY);
    mockReadConfig.mockReset().mockReturnValue({ mediaDir: '/media', storageMoviesPct: 60, storageTvPct: 30 });
    mockIsReachable.mockReset().mockResolvedValue(false);
    mockGetTransferInfo.mockReset();
    const mod = await import('../../server/api/stats/GET.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns correct libraryCount', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { libraryCount: number }).libraryCount).toBe(4);
  });

  it('returns correct libraryBytes (sum of fileSizes)', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const expected = 4_000_000_000 + 20_000_000_000 + 8_000_000_000 + 700_000_000;
    expect((res.body as { libraryBytes: number }).libraryBytes).toBe(expected);
  });

  it('codec breakdown has correct counts', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const codecs = (res.body as { codecs: { name: string; count: number }[] }).codecs;
    const h264 = codecs.find(c => c.name === 'h264');
    const hevc = codecs.find(c => c.name === 'hevc');
    const mpeg4 = codecs.find(c => c.name === 'mpeg4');
    expect(h264?.count).toBe(2);
    expect(hevc?.count).toBe(1);
    expect(mpeg4?.count).toBe(1);
  });

  it('resolution breakdown is correct', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const resolutions = (res.body as { resolutions: { name: string; count: number }[] }).resolutions;
    const r4k   = resolutions.find(r => r.name === '4K');
    const r1080 = resolutions.find(r => r.name === '1080p');
    const r720  = resolutions.find(r => r.name === '720p');
    const rSD   = resolutions.find(r => r.name === 'SD');
    expect(r4k?.count).toBe(1);
    expect(r1080?.count).toBe(1);
    expect(r720?.count).toBe(1);
    expect(rSD?.count).toBe(1);
  });

  it('content type split is correct', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const ct = (res.body as { contentTypes: { movies: number; shows: number; other: number } }).contentTypes;
    expect(ct.movies).toBe(3);
    expect(ct.shows).toBe(1);
    expect(ct.other).toBe(0);
  });

  it('totalWatchedSeconds is sum of all watchedSeconds', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const total = (res.body as { totalWatchedSeconds: number }).totalWatchedSeconds;
    expect(total).toBe(7200 + 3600 + 1800 + 0);
  });

  it('topWatched is sorted by watchedSeconds desc, max 5', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const top = (res.body as { topWatched: { id: string; watchedSeconds: number }[] }).topWatched;
    expect(top[0].id).toBe('m1'); // 7200
    expect(top[1].id).toBe('m2'); // 3600
    expect(top[2].id).toBe('s1'); // 1800
    expect(top.length).toBeLessThanOrEqual(5);
  });

  it('topWatched excludes items with 0 watchedSeconds', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const top = (res.body as { topWatched: { id: string }[] }).topWatched;
    expect(top.find(i => i.id === 'o1')).toBeUndefined();
  });

  it('recentlyAdded is sorted by addedAt desc, max 5', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const recent = (res.body as { recentlyAdded: { id: string }[] }).recentlyAdded;
    expect(recent[0].id).toBe('s1'); // 2024-03-01
    expect(recent[1].id).toBe('m2'); // 2024-02-01
    expect(recent[2].id).toBe('m1'); // 2024-01-01
  });

  it('genre distribution is sorted by count desc', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const genres = (res.body as { genres: { name: string; count: number }[] }).genres;
    // Action appears in m1 + s1 = 2, others appear once
    expect(genres[0].name).toBe('Action');
    expect(genres[0].count).toBe(2);
  });

  it('categoryBytes splits movies/tv/other correctly', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const cb = (res.body as { categoryBytes: { movies: number; tv: number; other: number } }).categoryBytes;
    expect(cb.movies).toBe(4_000_000_000 + 20_000_000_000 + 700_000_000);
    expect(cb.tv).toBe(8_000_000_000);
    expect(cb.other).toBe(0);
  });

  it('downloadSpeed is null when qBit is unreachable', async () => {
    mockIsReachable.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { downloadSpeed: null }).downloadSpeed).toBeNull();
  });

  it('downloadSpeed is populated when qBit is reachable', async () => {
    mockIsReachable.mockResolvedValue(true);
    mockGetTransferInfo.mockResolvedValue({
      dl_info_speed: 5_000_000, up_info_speed: 1_000_000,
      dl_info_data: 100_000_000, up_info_data: 20_000_000,
    });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const speed = (res.body as { downloadSpeed: { dlspeed: number; upspeed: number } }).downloadSpeed;
    expect(speed?.dlspeed).toBe(5_000_000);
    expect(speed?.upspeed).toBe(1_000_000);
  });

  it('diskFreeBytes and diskTotalBytes are null when no mediaDir configured', async () => {
    mockReadConfig.mockReturnValue({ mediaDir: null });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { diskFreeBytes: null; diskTotalBytes: null };
    expect(body.diskFreeBytes).toBeNull();
    expect(body.diskTotalBytes).toBeNull();
  });

  it('storageAllocation reflects config percentages', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const sa = (res.body as { storageAllocation: { moviesPct: number; tvPct: number; otherPct: number } }).storageAllocation;
    expect(sa.moviesPct).toBe(60);
    expect(sa.tvPct).toBe(30);
    expect(sa.otherPct).toBe(10);
  });

  it('returns 500 when library read throws', async () => {
    mockReadLibrary.mockImplementation(() => { throw new Error('disk error'); });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Failed to compute stats');
  });
});
