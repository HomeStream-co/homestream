/**
 * subscriptions.test.ts
 *
 * Tests for:
 *   GET  /api/subscriptions
 *   POST /api/subscriptions  (subscribe, unsubscribe, toggle)
 *   POST /api/subscriptions/:id/check
 *
 * Uses in-memory mocks for subscriptionStore and episodeScheduler so
 * no filesystem or network I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockStore: Record<string, {
  id: string; imdbId: string; title: string; poster?: string;
  totalSeasons: number; schedule: string; enabled: boolean;
  createdAt: string; lastFoundEpisode?: { season: number; episode: number };
}> = {};

// ── Mock subscriptionStore ────────────────────────────────────────────────────

vi.mock('../../server/subscriptionStore.js', () => ({
  getAllSubscriptions: () => Object.values(mockStore),
  getSubscription:    (id: string) => mockStore[id] ?? null,
  upsertSubscription: (data: { imdbId: string; title: string; poster?: string; totalSeasons: number; schedule: string; enabled: boolean; lastFoundEpisode?: { season: number; episode: number }; lastCheckedAt?: string }) => {
    const sub = { id: data.imdbId, ...data, createdAt: new Date().toISOString() };
    mockStore[data.imdbId] = sub;
    return sub;
  },
  deleteSubscription: (id: string) => { delete mockStore[id]; },
  setEnabled:         (id: string, enabled: boolean) => {
    if (mockStore[id]) mockStore[id].enabled = enabled;
  },
}));

// ── Mock episodeScheduler ─────────────────────────────────────────────────────

const mockReschedule = vi.fn();
const mockCancel     = vi.fn();
const mockCheckNow   = vi.fn().mockResolvedValue({ queued: 0, checked: 1 });

vi.mock('../../server/episodeScheduler.js', () => ({
  rescheduleSubscription: mockReschedule,
  cancelSubscription:     mockCancel,
  checkNow:               mockCheckNow,
}));

// ── Mock authMiddleware ───────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, _res: Response) => true,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown = {}, params: Record<string, string> = {}) {
  const req = { body, params, cookies: {} } as unknown as Request;
  const data: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { data.json = v; return res; }),
  } as unknown as Response;
  return { req, res, data };
}

// ── Import handlers after mocks ───────────────────────────────────────────────

const { default: getHandler }   = await import('../../server/api/subscriptions/GET.js');
const { default: postHandler }  = await import('../../server/api/subscriptions/POST.js');
const { default: checkHandler } = await import('../../server/api/subscriptions/[id]/check/POST.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/subscriptions', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  it('returns empty array when no subscriptions', () => {
    const { req, res, data } = makeReqRes();
    getHandler(req, res);
    expect((data.json as { subscriptions: unknown[] }).subscriptions).toEqual([]);
  });

  it('returns all subscriptions', () => {
    mockStore['tt1234567'] = {
      id: 'tt1234567', imdbId: 'tt1234567', title: 'Test Show',
      totalSeasons: 3, schedule: 'weekly', enabled: true, createdAt: new Date().toISOString(),
    };
    const { req, res, data } = makeReqRes();
    getHandler(req, res);
    const subs = (data.json as { subscriptions: unknown[] }).subscriptions;
    expect(subs).toHaveLength(1);
    expect((subs[0] as { title: string }).title).toBe('Test Show');
  });
});

describe('POST /api/subscriptions — subscribe', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    mockReschedule.mockClear();
    mockCancel.mockClear();
  });

  it('rejects missing imdbId', async () => {
    const { req, res } = makeReqRes({ title: 'Show', totalSeasons: 2, schedule: 'weekly' });
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects missing required fields', async () => {
    const { req, res } = makeReqRes({ imdbId: 'tt1234567' });
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects invalid schedule', async () => {
    const { req, res } = makeReqRes({
      imdbId: 'tt1234567', title: 'Show', totalSeasons: 2, schedule: 'hourly',
    });
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates a new subscription and reschedules', async () => {
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1234567', title: 'Breaking Bad', totalSeasons: 5, schedule: 'daily',
    });
    await postHandler(req, res);
    expect((data.json as { success: boolean }).success).toBe(true);
    expect(mockStore['tt1234567']).toBeDefined();
    expect(mockStore['tt1234567'].title).toBe('Breaking Bad');
    expect(mockReschedule).toHaveBeenCalledWith('tt1234567');
  });

  it('preserves lastFoundEpisode when re-subscribing', async () => {
    mockStore['tt1234567'] = {
      id: 'tt1234567', imdbId: 'tt1234567', title: 'Old Title',
      totalSeasons: 3, schedule: 'weekly', enabled: false, createdAt: new Date().toISOString(),
      lastFoundEpisode: { season: 2, episode: 7 },
    };
    const { req, res, data } = makeReqRes({
      imdbId: 'tt1234567', title: 'Breaking Bad', totalSeasons: 5, schedule: 'daily',
    });
    await postHandler(req, res);
    expect((data.json as { success: boolean }).success).toBe(true);
    expect(mockStore['tt1234567'].lastFoundEpisode).toEqual({ season: 2, episode: 7 });
  });

  it('accepts all valid schedule values', async () => {
    const schedules = ['daily', 'every3days', 'weekly', 'every2weeks'];
    for (const schedule of schedules) {
      Object.keys(mockStore).forEach(k => delete mockStore[k]);
      const { req, res, data } = makeReqRes({
        imdbId: 'tt9999999', title: 'Show', totalSeasons: 1, schedule,
      });
      await postHandler(req, res);
      expect((data.json as { success: boolean }).success).toBe(true);
    }
  });
});

describe('POST /api/subscriptions — unsubscribe', () => {
  beforeEach(() => {
    mockStore['tt1234567'] = {
      id: 'tt1234567', imdbId: 'tt1234567', title: 'Breaking Bad',
      totalSeasons: 5, schedule: 'weekly', enabled: true, createdAt: new Date().toISOString(),
    };
    mockCancel.mockClear();
  });

  it('removes the subscription and cancels timer', async () => {
    const { req, res, data } = makeReqRes({ imdbId: 'tt1234567', action: 'unsubscribe' });
    await postHandler(req, res);
    expect((data.json as { success: boolean }).success).toBe(true);
    expect(mockStore['tt1234567']).toBeUndefined();
    expect(mockCancel).toHaveBeenCalledWith('tt1234567');
  });
});

describe('POST /api/subscriptions — toggle', () => {
  beforeEach(() => {
    mockStore['tt1234567'] = {
      id: 'tt1234567', imdbId: 'tt1234567', title: 'Breaking Bad',
      totalSeasons: 5, schedule: 'weekly', enabled: true, createdAt: new Date().toISOString(),
    };
    mockReschedule.mockClear();
    mockCancel.mockClear();
  });

  it('toggles enabled from true to false and cancels timer', async () => {
    const { req, res, data } = makeReqRes({ imdbId: 'tt1234567', action: 'toggle' });
    await postHandler(req, res);
    expect((data.json as { success: boolean; enabled: boolean }).enabled).toBe(false);
    expect(mockCancel).toHaveBeenCalledWith('tt1234567');
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('toggles enabled from false to true and reschedules', async () => {
    mockStore['tt1234567'].enabled = false;
    const { req, res, data } = makeReqRes({ imdbId: 'tt1234567', action: 'toggle' });
    await postHandler(req, res);
    expect((data.json as { success: boolean; enabled: boolean }).enabled).toBe(true);
    expect(mockReschedule).toHaveBeenCalledWith('tt1234567');
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown imdbId', async () => {
    const { req, res } = makeReqRes({ imdbId: 'tt0000000', action: 'toggle' });
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /api/subscriptions/:id/check', () => {
  beforeEach(() => {
    mockCheckNow.mockClear();
  });

  it('calls checkNow with the id param and returns result', async () => {
    mockCheckNow.mockResolvedValueOnce({ queued: 2, checked: 5 });
    const { req, res, data } = makeReqRes({}, { id: 'tt1234567' });
    await checkHandler(req, res);
    expect(mockCheckNow).toHaveBeenCalledWith('tt1234567');
    expect((data.json as { queued: number }).queued).toBe(2);
  });

  it('returns 500 on checkNow error', async () => {
    mockCheckNow.mockRejectedValueOnce(new Error('Torrentio unreachable'));
    const { req, res } = makeReqRes({}, { id: 'tt1234567' });
    await checkHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
