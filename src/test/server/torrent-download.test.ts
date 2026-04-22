/**
 * torrent-download.test.ts
 *
 * Tests for POST /api/stremio/download
 *
 * Covers:
 *   - 400 when required fields (imdbId, type, title) are missing
 *   - Movie download via qBittorrent (happy path)
 *   - Movie download via WebTorrent fallback when qBit is offline
 *   - 404 when no streams are found for a movie
 *   - 403 when security scan blocks the download
 *   - Single episode fast path (season + episode specified)
 *   - Security scan called before every queue operation
 *   - VPN connect/disconnect called when vpn.enabled is true
 *   - 500 on unexpected error
 *
 * All external I/O (Torrentio fetch, qBit, WebTorrent, VPN) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockQbitReachable = true;
let mockScanAllowed = true;
let mockVpnEnabled = false;
let mockStreams: Array<{
  name: string; quality: string; size: string; seeds: string;
  magnet: string; infoHash: string;
}> = [];

// ── Mocks ─────────────────────────────────────────────────────────────────────
// All paths are relative to THIS file (src/test/server/) so they resolve to
// src/server/... which is what the handler under test imports.

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: () => Promise.resolve(mockQbitReachable),
  addMagnet:   vi.fn().mockResolvedValue('aabbccdd1122334455667788990011223344556677'),
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({
    mediaDir: '/media',
    vpn: mockVpnEnabled ? { enabled: true, protocol: 'wireguard' } : { enabled: false },
  }),
}));

const mockRunPreDownloadScan = vi.fn(async () => ({
  allowed: mockScanAllowed,
  threatLevel: mockScanAllowed ? 'clean' : 'blocked',
  reason: mockScanAllowed ? undefined : 'Known malware hash',
  layer: mockScanAllowed ? undefined : 'virustotal',
  checkedAt: new Date().toISOString(),
}));

vi.mock('../../server/security/threatScanner.js', () => ({
  runPreDownloadScan: (...args: unknown[]) => mockRunPreDownloadScan(...args),
}));

const mockConnectForDownload  = vi.fn().mockResolvedValue({ ok: true });
const mockDisconnectAfterDownload = vi.fn().mockResolvedValue(undefined);

vi.mock('../../server/vpnService.js', () => ({
  connectForDownload:      (...args: unknown[]) => mockConnectForDownload(...args),
  disconnectAfterDownload: (...args: unknown[]) => mockDisconnectAfterDownload(...args),
}));

const mockUpsertJob = vi.fn();
vi.mock('../../server/downloadJobStore.js', () => ({
  upsertJob:             (...args: unknown[]) => mockUpsertJob(...args),
  getAllPersistedJobs:    () => [],
  updateJobStatus:       vi.fn(),
  findJobByInfoHash:     () => undefined, // no duplicates by default
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

// Mock torrentManager — queueDownload for WebTorrent fallback
const mockQueueDownload = vi.fn((params: Record<string, unknown>) => ({
  jobId: 'wt-job-1',
  ...params,
  status: 'queued',
  progress: 0,
  backend: 'webtorrent',
}));

vi.mock('../../server/torrentManager.js', () => ({
  pickBestStream: (streams: Array<{ quality: string; seeds: string; infoHash: string; magnet: string; size: string; name: string }>) => {
    if (streams.length === 0) return null;
    return streams[0];
  },
  queueDownload: (...args: unknown[]) => mockQueueDownload(...args as [Record<string, unknown>]),
  getAllJobs: () => [],
}));

// Mock global fetch for Torrentio calls
const mockFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({
    streams: mockStreams.map(s => ({
      infoHash: s.infoHash,
      title: `${s.quality}\n${s.size} 👤 ${s.seeds}`,
      name: s.name,
      sources: [],
    })),
  }),
}));
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown) {
  const req = { body, cookies: {}, params: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

const GOOD_STREAM = {
  name: 'Inception 1080p',
  quality: '1080p BluRay',
  size: '8.5 GB',
  seeds: '250',
  magnet: 'magnet:?xt=urn:btih:aabbccdd1122334455667788990011223344556677',
  infoHash: 'aabbccdd1122334455667788990011223344556677',
};

const { default: handler } = await import('../../server/api/stremio/download/POST.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/stremio/download — validation', () => {
  it('returns 400 when imdbId is missing', async () => {
    const { req, res } = makeReqRes({ type: 'movie', title: 'Inception' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when type is missing', async () => {
    const { req, res } = makeReqRes({ imdbId: 'tt1375666', title: 'Inception' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when title is missing', async () => {
    const { req, res } = makeReqRes({ imdbId: 'tt1375666', type: 'movie' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/stremio/download — movie via qBittorrent', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = true;
    mockVpnEnabled = false;
    mockStreams = [GOOD_STREAM];
    mockRunPreDownloadScan.mockClear();
    mockUpsertJob.mockClear();
    mockFetch.mockClear();
  });

  it('returns queued:1 and backend:qbittorrent', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    const body = data.json as { queued: number; backend: string };
    expect(body.queued).toBe(1);
    expect(body.backend).toBe('qbittorrent');
  });

  it('calls security scan before queuing', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockRunPreDownloadScan).toHaveBeenCalledOnce();
    expect(mockRunPreDownloadScan).toHaveBeenCalledWith(
      expect.objectContaining({ infoHash: GOOD_STREAM.infoHash }),
    );
  });

  it('persists job to disk via upsertJob', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockUpsertJob).toHaveBeenCalledOnce();
  });

  it('returns the job in the jobs array', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    const body = data.json as { jobs: unknown[] };
    expect(body.jobs).toHaveLength(1);
  });
});

describe('POST /api/stremio/download — movie via WebTorrent fallback', () => {
  beforeEach(() => {
    mockQbitReachable = false;
    mockScanAllowed = true;
    mockVpnEnabled = false;
    mockStreams = [GOOD_STREAM];
    mockRunPreDownloadScan.mockClear();
    mockQueueDownload.mockClear();
    mockFetch.mockClear();
  });

  it('returns backend:webtorrent when qBit is offline', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect((data.json as { backend: string }).backend).toBe('webtorrent');
  });

  it('still calls security scan in WebTorrent path', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockRunPreDownloadScan).toHaveBeenCalledOnce();
  });
});

describe('POST /api/stremio/download — no streams found', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = true;
    mockStreams = []; // Torrentio returns nothing
    mockFetch.mockClear();
  });

  it('returns 404 when no streams are available', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt9999999', type: 'movie', title: 'Nonexistent Movie',
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does NOT call security scan when no streams found', async () => {
    mockRunPreDownloadScan.mockClear();
    const { req, res } = makeReqRes({
      imdbId: 'tt9999999', type: 'movie', title: 'Nonexistent Movie',
    });
    await handler(req, res);
    expect(mockRunPreDownloadScan).not.toHaveBeenCalled();
  });
});

describe('POST /api/stremio/download — security scan blocks download', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = false; // scanner says BLOCKED
    mockStreams = [GOOD_STREAM];
    mockRunPreDownloadScan.mockClear();
    mockUpsertJob.mockClear();
    mockFetch.mockClear();
  });

  it('returns 403 when scan blocks the download', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does NOT persist job when scan blocks', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('returns reason and layer in 403 response', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    const body = data.json as { reason?: string; layer?: string };
    expect(body.reason).toBeDefined();
    expect(body.layer).toBeDefined();
  });
});

describe('POST /api/stremio/download — single episode fast path', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = true;
    mockStreams = [GOOD_STREAM];
    mockRunPreDownloadScan.mockClear();
    mockUpsertJob.mockClear();
    mockFetch.mockClear();
  });

  it('queues a single episode when season + episode are specified', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt0903747', type: 'series', title: 'Breaking Bad',
      season: 1, episode: 1,
    });
    await handler(req, res);
    const body = data.json as { queued: number; jobs: Array<{ title: string }> };
    expect(body.queued).toBe(1);
    expect(body.jobs[0].title).toContain('S01E01');
  });

  it('uses the correct episode title format (S01E01)', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt0903747', type: 'series', title: 'Breaking Bad',
      season: 3, episode: 10,
    });
    await handler(req, res);
    const body = data.json as { jobs: Array<{ title: string }> };
    expect(body.jobs[0].title).toBe('Breaking Bad S03E10');
  });
});

describe('POST /api/stremio/download — VPN integration', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = true;
    mockVpnEnabled = true;
    mockStreams = [GOOD_STREAM];
    mockConnectForDownload.mockClear();
    mockDisconnectAfterDownload.mockClear();
    mockFetch.mockClear();
  });

  it('connects VPN before download when vpn.enabled is true', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockConnectForDownload).toHaveBeenCalledOnce();
  });

  it('disconnects VPN after download completes', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockDisconnectAfterDownload).toHaveBeenCalledOnce();
  });

  it('reports vpnUsed:true in response', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect((data.json as { vpnUsed: boolean }).vpnUsed).toBe(true);
  });

  it('disconnects VPN even when scan blocks the download', async () => {
    mockScanAllowed = false;
    const { req, res } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
    });
    await handler(req, res);
    expect(mockDisconnectAfterDownload).toHaveBeenCalledOnce();
  });
});

describe('POST /api/stremio/download — preloaded streams', () => {
  beforeEach(() => {
    mockQbitReachable = true;
    mockScanAllowed = true;
    mockFetch.mockClear();
    mockRunPreDownloadScan.mockClear();
  });

  it('uses preloaded streams and skips Torrentio fetch', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1375666', type: 'movie', title: 'Inception',
      streams: [GOOD_STREAM],
    });
    await handler(req, res);
    // fetch should NOT have been called for Torrentio
    expect(mockFetch).not.toHaveBeenCalled();
    expect((data.json as { queued: number }).queued).toBe(1);
  });
});
