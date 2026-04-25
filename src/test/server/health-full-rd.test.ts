/**
 * health-full-rd.test.ts
 *
 * Tests for the Real-Debrid subsystem check inside GET /api/health/full.
 *
 * The existing health-full.test.ts covers the other 7 subsystems.
 * This file focuses exclusively on the RD check and its interaction
 * with the qBit check — because RD changes qBit's status message.
 *
 * Covers:
 *   1.  RD not configured → status:unknown, message mentions "optional"
 *   2.  RD configured, premium active → status:ok, username + days in message
 *   3.  RD configured, premium expired (0 days) → status:warn
 *   4.  RD configured, API unreachable → status:error
 *   5.  RD configured, isConfigured times out → status:error
 *   6.  qBit unreachable + RD active → qBit status:warn (not error), message mentions RD
 *   7.  qBit unreachable + RD NOT active → qBit status:warn, message mentions WebTorrent
 *   8.  qBit not configured + RD active → qBit status:unknown, message mentions RD
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadConfig    = vi.fn();
const mockReadLibrary   = vi.fn(() => []);
const mockQbitReachable = vi.fn(() => Promise.resolve(true));
const mockGetAllJobs    = vi.fn(() => []);
const mockRdConfigured  = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/configStore.js', () => ({
  readConfig:      () => mockReadConfig(),
  isSetupComplete: () => true,
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockReadLibrary(),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  isReachable: () => mockQbitReachable(),
}));

vi.mock('../../server/torrentManager.js', () => ({
  getAllJobs: () => mockGetAllJobs(),
}));

vi.mock('../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: () => false,
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: () => true,
}));

vi.mock('../../server/realDebridClient.js', () => ({
  isConfigured: (...args: unknown[]) => mockRdConfigured(...args),
  getUser:      vi.fn(),
  resolvemagnet: vi.fn(),
  downloadUrl:  vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: () => ({
    stdout: { on: vi.fn((e: string, cb: (d: Buffer) => void) => { if (e === 'data') setTimeout(() => cb(Buffer.from('ffmpeg version 6.0')), 0); }) },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: vi.fn((e: string, cb: (code: number) => void) => { if (e === 'close') setTimeout(() => cb(0), 5); }),
  }),
}));

vi.mock('module', () => ({ createRequire: () => () => '/usr/bin/ffmpeg' }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes() {
  const req = { cookies: { session: 'tok' }, headers: { authorization: 'Bearer tok' } } as unknown as Request;
  const captured: { json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { captured.json = v; return res; }),
  } as unknown as Response;
  return { req, res, captured };
}

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    qbitUrl: 'http://localhost:8080',
    tmdbApiKey: '',
    ollamaUrl: '',
    realDebridApiKey: '',
    mediaDir: '/media',
    ...overrides,
  };
}

type SubsystemCheck = { name: string; status: string; message: string };
type HealthBody = { checks: SubsystemCheck[] };

function findCheck(body: unknown, name: string): SubsystemCheck | undefined {
  return (body as HealthBody).checks?.find(s => s.name === name);
}

const { default: handler } = await import('../../server/api/health/full/GET.js');
const fn = Array.isArray(handler) ? handler[handler.length - 1] : handler;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/health/full — Real-Debrid subsystem', () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue(baseConfig());
    mockRdConfigured.mockResolvedValue({ ok: false, error: 'No API key configured' });
  });

  it('status:unknown when RD not configured', async () => {
    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'Real-Debrid');
    expect(check?.status).toBe('unknown');
    expect(check?.message).toMatch(/optional/i);
  });

  it('status:ok when RD configured and premium is active', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: 'valid-key' }));
    mockRdConfigured.mockResolvedValue({
      ok: true,
      user: { username: 'alice', premium: 90 * 86_400 },
    });

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'Real-Debrid');
    expect(check?.status).toBe('ok');
    expect(check?.message).toContain('alice');
    expect(check?.message).toContain('90d');
  });

  it('status:warn when RD configured but premium is expired (0 days)', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: 'expired-key' }));
    mockRdConfigured.mockResolvedValue({
      ok: true,
      user: { username: 'bob', premium: 0 },
    });

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'Real-Debrid');
    expect(check?.status).toBe('warn');
    expect(check?.message).toMatch(/expired/i);
  });

  it('status:error when RD API is unreachable', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: 'bad-key' }));
    mockRdConfigured.mockResolvedValue({ ok: false, error: 'RD API 401: Unauthorized' });

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'Real-Debrid');
    expect(check?.status).toBe('error');
  });

  it('status:error when isConfigured times out', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: 'slow-key' }));
    // Simulate timeout — checkWithTimeout returns the fallback { ok: false, error: 'Timeout' }
    mockRdConfigured.mockResolvedValue({ ok: false, error: 'Timeout' });

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'Real-Debrid');
    expect(check?.status).toBe('error');
  });
});

describe('GET /api/health/full — qBit status when RD is active', () => {
  beforeEach(() => {
    mockQbitReachable.mockResolvedValue(false);   // qBit is DOWN for all these tests
    mockRdConfigured.mockResolvedValue({ ok: true, user: { username: 'alice', premium: 30 * 86_400 } });
  });

  it('qBit status:warn (not error) and message mentions Real-Debrid when RD is active', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: 'valid-key' }));

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'qBittorrent');
    expect(check?.status).toBe('warn');
    expect(check?.message).toMatch(/real.debrid/i);
  });

  it('qBit status:warn and message mentions WebTorrent when RD is NOT active', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ realDebridApiKey: '' }));

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'qBittorrent');
    expect(check?.status).toBe('warn');
    expect(check?.message).toMatch(/webtorrent/i);
  });

  it('qBit status:unknown and message mentions RD when qBit URL not configured and RD active', async () => {
    mockReadConfig.mockReturnValue(baseConfig({ qbitUrl: '', realDebridApiKey: 'valid-key' }));

    const { req, res, captured } = makeReqRes();
    await (fn as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const check = findCheck(captured.json, 'qBittorrent');
    expect(check?.status).toBe('unknown');
    expect(check?.message).toMatch(/real.debrid/i);
  });
});
