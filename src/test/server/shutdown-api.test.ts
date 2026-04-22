/**
 * shutdown-api.test.ts
 *
 * Full coverage of POST /api/shutdown
 *
 * Tests cover:
 *   - 403 when request comes from non-localhost IP
 *   - 200 + { ok: true } when called from localhost (127.0.0.1)
 *   - 200 + { ok: true } when called from ::1 (IPv6 localhost)
 *   - flushProgressWrites is called on shutdown
 *   - HLS cleanup is attempted on shutdown
 *   - process.exit(0) is scheduled after response
 *   - Non-fatal errors in flush/cleanup don't prevent response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock dynamic imports used inside the handler ──────────────────────────────

const mockFlushProgressWrites = vi.fn<() => Promise<void>>();
const mockStopAllHlsJobs      = vi.fn<() => void>();
const mockRmSync              = vi.fn<(p: string, opts: Record<string, unknown>) => void>();
const mockExistsSync          = vi.fn<(p: string) => boolean>(() => false);

vi.mock('../../server/api/media/[id]/progress/PATCH.js', () => ({
  flushProgressWrites: () => mockFlushProgressWrites(),
}));

vi.mock('../../server/hlsTranscoder.js', () => ({
  stopAllHlsJobs: () => mockStopAllHlsJobs(),
  HLS_BASE_DIR: '/tmp/homestream-hls',
}));

vi.mock('node:fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
  rmSync:     (p: string, opts: Record<string, unknown>) => mockRmSync(p, opts),
  default: {
    existsSync: (p: string) => mockExistsSync(p),
    rmSync:     (p: string, opts: Record<string, unknown>) => mockRmSync(p, opts),
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

function makeReq(ip: string, overrides: Partial<Request> = {}): Request {
  return {
    query: {}, params: {}, body: {},
    socket: { remoteAddress: ip },
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/shutdown', () => {
  let handler: (req: Request, res: Response) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockFlushProgressWrites.mockReset().mockResolvedValue(undefined);
    mockStopAllHlsJobs.mockReset();
    mockRmSync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    const mod = await import('../../server/api/shutdown/POST.js');
    handler = mod.default;
  });

  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
  });

  it('returns 403 when request comes from non-localhost IP', async () => {
    const res = makeRes();
    await handler(makeReq('192.168.1.100'), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toBe('Forbidden');
  });

  it('returns 403 for external IPv4', async () => {
    const res = makeRes();
    await handler(makeReq('10.0.0.1'), res as unknown as Response);
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 + ok:true from 127.0.0.1', async () => {
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('returns 200 + ok:true from ::1 (IPv6 localhost)', async () => {
    const res = makeRes();
    await handler(makeReq('::1'), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('calls flushProgressWrites on shutdown', async () => {
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    // Flush happens async — let microtasks run
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFlushProgressWrites).toHaveBeenCalled();
  });

  it('calls stopAllHlsJobs on shutdown', async () => {
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockStopAllHlsJobs).toHaveBeenCalled();
  });

  it('cleans up HLS dir when it exists', async () => {
    mockExistsSync.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    // Dynamic imports inside the handler need several microtask flushes
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(mockRmSync).toHaveBeenCalledWith('/tmp/homestream-hls', { recursive: true, force: true });
  });

  it('does NOT call rmSync when HLS dir does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('schedules process.exit(0) after 500ms', async () => {
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    expect(exitSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('still responds 200 even if flushProgressWrites throws', async () => {
    mockFlushProgressWrites.mockRejectedValue(new Error('flush error'));
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('response includes shutdown message', async () => {
    const res = makeRes();
    await handler(makeReq('127.0.0.1'), res as unknown as Response);
    expect((res.body as { message: string }).message).toContain('Shutting down');
  });
});
