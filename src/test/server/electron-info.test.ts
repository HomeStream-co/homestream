/**
 * electron-info.test.ts
 *
 * Full coverage of GET /api/electron
 *
 * This endpoint is the bridge between the Electron .exe main process and the
 * embedded Express server. It tells the Setup Wizard:
 *   - What OS the user is on (win32 / darwin / linux)
 *   - Whether we're running inside Electron (vs cloud/dev)
 *   - The correct default media directory for that OS
 *
 * Test matrix:
 *   Platform detection
 *     ✓ Uses HOMESTREAM_PLATFORM env var when set (overrides process.platform)
 *     ✓ Falls back to process.platform when env var is absent
 *     ✓ Returns 'win32' correctly
 *     ✓ Returns 'darwin' correctly
 *     ✓ Returns 'linux' correctly
 *
 *   Default media directory — Electron-injected
 *     ✓ Uses HOMESTREAM_DEFAULT_MEDIA_DIR verbatim when set
 *     ✓ Ignores OS-derived path when env var is present
 *
 *   Default media directory — OS-derived (no env var)
 *     ✓ win32  → <homedir>/Videos/HomeStream
 *     ✓ darwin → <homedir>/Movies/HomeStream
 *     ✓ linux  → <homedir>/media/HomeStream
 *     ✓ unknown OS → falls back to linux path
 *
 *   Electron detection flag
 *     ✓ isElectron: true  when ELECTRON env var is set
 *     ✓ isElectron: false when ELECTRON env var is absent
 *     ✓ isElectron: false in cloud/dev mode (no env var)
 *
 *   Response shape
 *     ✓ Always returns { platform, isElectron, defaultMediaDir }
 *     ✓ defaultMediaDir is always a non-empty string
 *     ✓ defaultMediaDir always ends with 'HomeStream'
 *     ✓ Returns 200 status
 *
 *   .exe-specific scenarios
 *     ✓ Windows .exe: ELECTRON=1 + HOMESTREAM_PLATFORM=win32 + injected dir
 *     ✓ Windows .exe: ELECTRON=1 + HOMESTREAM_PLATFORM=win32 + no injected dir (derives path)
 *     ✓ macOS .app:   ELECTRON=1 + HOMESTREAM_PLATFORM=darwin + injected dir
 *     ✓ Linux AppImage: ELECTRON=1 + HOMESTREAM_PLATFORM=linux + no injected dir
 *     ✓ Cloud deploy: no ELECTRON, no HOMESTREAM_PLATFORM → uses process.platform
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import os from 'os';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as {
    statusCode: number;
    body: unknown;
    status: (c: number) => typeof res;
    json:   (b: unknown) => typeof res;
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json   = (b) => { res.body = b; return res; };
  return res;
}

function makeReq(): Request {
  return { query: {}, params: {}, body: {}, cookies: {} } as unknown as Request;
}

// Snapshot env vars we'll mutate so we can restore them
const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = ['HOMESTREAM_PLATFORM', 'HOMESTREAM_DEFAULT_MEDIA_DIR', 'ELECTRON'];

function saveEnv() {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/electron — platform detection', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses HOMESTREAM_PLATFORM env var when set', () => {
    process.env.HOMESTREAM_PLATFORM = 'win32';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { platform: string }).platform).toBe('win32');
  });

  it('falls back to process.platform when env var is absent', () => {
    delete process.env.HOMESTREAM_PLATFORM;
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { platform: string }).platform).toBe(process.platform);
  });

  it('returns win32 correctly', () => {
    process.env.HOMESTREAM_PLATFORM = 'win32';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { platform: string }).platform).toBe('win32');
  });

  it('returns darwin correctly', () => {
    process.env.HOMESTREAM_PLATFORM = 'darwin';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { platform: string }).platform).toBe('darwin');
  });

  it('returns linux correctly', () => {
    process.env.HOMESTREAM_PLATFORM = 'linux';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { platform: string }).platform).toBe('linux');
  });
});

describe('GET /api/electron — Electron-injected media dir', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses HOMESTREAM_DEFAULT_MEDIA_DIR verbatim when set', () => {
    process.env.HOMESTREAM_PLATFORM = 'win32';
    process.env.HOMESTREAM_DEFAULT_MEDIA_DIR = 'D:\\MyMedia\\HomeStream';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { defaultMediaDir: string }).defaultMediaDir).toBe('D:\\MyMedia\\HomeStream');
  });

  it('ignores OS-derived path when env var is present', () => {
    process.env.HOMESTREAM_PLATFORM = 'linux';
    process.env.HOMESTREAM_DEFAULT_MEDIA_DIR = '/custom/path/HomeStream';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    // Should NOT be the linux default
    expect((res.body as { defaultMediaDir: string }).defaultMediaDir).toBe('/custom/path/HomeStream');
  });
});

describe('GET /api/electron — OS-derived media dir (no env var)', () => {
  let handler: (req: Request, res: Response) => void;
  const home = os.homedir();

  beforeEach(async () => {
    saveEnv();
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('win32 → <homedir>/Videos/HomeStream', () => {
    process.env.HOMESTREAM_PLATFORM = 'win32';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
    expect(dir).toContain('Videos');
    expect(dir).toContain('HomeStream');
    expect(dir).toContain(home);
  });

  it('darwin → <homedir>/Movies/HomeStream', () => {
    process.env.HOMESTREAM_PLATFORM = 'darwin';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
    expect(dir).toContain('Movies');
    expect(dir).toContain('HomeStream');
    expect(dir).toContain(home);
  });

  it('linux → <homedir>/media/HomeStream', () => {
    process.env.HOMESTREAM_PLATFORM = 'linux';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
    expect(dir).toContain('media');
    expect(dir).toContain('HomeStream');
    expect(dir).toContain(home);
  });

  it('unknown OS → falls back to linux-style path', () => {
    process.env.HOMESTREAM_PLATFORM = 'freebsd';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
    // Should still contain HomeStream — falls into the else branch
    expect(dir).toContain('HomeStream');
  });
});

describe('GET /api/electron — isElectron flag', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('isElectron: true when ELECTRON env var is set to "1"', () => {
    process.env.ELECTRON = '1';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { isElectron: boolean }).isElectron).toBe(true);
  });

  it('isElectron: true when ELECTRON env var is any truthy string', () => {
    process.env.ELECTRON = 'true';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { isElectron: boolean }).isElectron).toBe(true);
  });

  it('isElectron: false when ELECTRON env var is absent', () => {
    delete process.env.ELECTRON;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { isElectron: boolean }).isElectron).toBe(false);
  });

  it('isElectron: false in cloud/dev mode (no env var)', () => {
    delete process.env.ELECTRON;
    delete process.env.HOMESTREAM_PLATFORM;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect((res.body as { isElectron: boolean }).isElectron).toBe(false);
  });
});

describe('GET /api/electron — response shape', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('always returns { platform, isElectron, defaultMediaDir }', () => {
    delete process.env.HOMESTREAM_PLATFORM;
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    delete process.env.ELECTRON;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('platform');
    expect(body).toHaveProperty('isElectron');
    expect(body).toHaveProperty('defaultMediaDir');
  });

  it('defaultMediaDir is always a non-empty string', () => {
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  it('defaultMediaDir always ends with HomeStream', () => {
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    for (const plat of ['win32', 'darwin', 'linux']) {
      process.env.HOMESTREAM_PLATFORM = plat;
      const res = makeRes();
      handler(makeReq(), res as unknown as Response);
      const dir = (res.body as { defaultMediaDir: string }).defaultMediaDir;
      expect(dir.endsWith('HomeStream')).toBe(true);
    }
  });

  it('returns 200 status', () => {
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/electron — .exe-specific scenarios', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(async () => {
    saveEnv();
    vi.resetModules();
    const mod = await import('../../server/api/electron/GET.js');
    handler = mod.default;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('Windows .exe: ELECTRON=1 + win32 + injected dir', () => {
    process.env.ELECTRON = '1';
    process.env.HOMESTREAM_PLATFORM = 'win32';
    process.env.HOMESTREAM_DEFAULT_MEDIA_DIR = 'C:\\Users\\Alice\\Videos\\HomeStream';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as { platform: string; isElectron: boolean; defaultMediaDir: string };
    expect(body.platform).toBe('win32');
    expect(body.isElectron).toBe(true);
    expect(body.defaultMediaDir).toBe('C:\\Users\\Alice\\Videos\\HomeStream');
  });

  it('Windows .exe: ELECTRON=1 + win32 + no injected dir → derives Videos path', () => {
    process.env.ELECTRON = '1';
    process.env.HOMESTREAM_PLATFORM = 'win32';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as { platform: string; isElectron: boolean; defaultMediaDir: string };
    expect(body.platform).toBe('win32');
    expect(body.isElectron).toBe(true);
    expect(body.defaultMediaDir).toContain('Videos');
    expect(body.defaultMediaDir).toContain('HomeStream');
  });

  it('macOS .app: ELECTRON=1 + darwin + injected dir', () => {
    process.env.ELECTRON = '1';
    process.env.HOMESTREAM_PLATFORM = 'darwin';
    process.env.HOMESTREAM_DEFAULT_MEDIA_DIR = '/Users/alice/Movies/HomeStream';
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as { platform: string; isElectron: boolean; defaultMediaDir: string };
    expect(body.platform).toBe('darwin');
    expect(body.isElectron).toBe(true);
    expect(body.defaultMediaDir).toBe('/Users/alice/Movies/HomeStream');
  });

  it('Linux AppImage: ELECTRON=1 + linux + no injected dir → derives media path', () => {
    process.env.ELECTRON = '1';
    process.env.HOMESTREAM_PLATFORM = 'linux';
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as { platform: string; isElectron: boolean; defaultMediaDir: string };
    expect(body.platform).toBe('linux');
    expect(body.isElectron).toBe(true);
    expect(body.defaultMediaDir).toContain('media');
    expect(body.defaultMediaDir).toContain('HomeStream');
  });

  it('Cloud deploy: no ELECTRON, no HOMESTREAM_PLATFORM → uses process.platform', () => {
    delete process.env.ELECTRON;
    delete process.env.HOMESTREAM_PLATFORM;
    delete process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
    const res = makeRes();
    handler(makeReq(), res as unknown as Response);
    const body = res.body as { platform: string; isElectron: boolean; defaultMediaDir: string };
    expect(body.platform).toBe(process.platform);
    expect(body.isElectron).toBe(false);
    expect(body.defaultMediaDir).toContain('HomeStream');
  });
});
