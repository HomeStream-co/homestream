/**
 * prowlarr-config.test.ts
 *
 * Tests for Prowlarr configuration in the setup API endpoints.
 *
 * Covers:
 *   GET /api/setup:
 *     - Returns prowlarrUrl in config object
 *     - Returns hasProwlarrKey boolean (masked, not raw key)
 *     - Does NOT expose raw prowlarrApiKey
 *
 *   POST /api/setup action='save':
 *     - Saves prowlarrUrl to config
 *     - Saves prowlarrApiKey to config
 *     - Rejects unknown fields (security: no arbitrary key injection)
 *
 *   POST /api/setup action='test_prowlarr':
 *     - Returns ok:true with version when Prowlarr responds 200
 *     - Returns ok:false with error when Prowlarr responds non-200
 *     - Returns ok:false when network error occurs
 *     - Returns ok:false when prowlarrUrl is empty
 *     - Sends X-Api-Key header to Prowlarr
 *     - Falls back to stored config when fields not in request body
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockAuthed = true;
let storedConfig = {
  setupComplete: true,
  mediaDir: '/media',
  downloadsDir: '/media/downloads',
  libraryDir: '/media/library',
  qbitUrl: 'http://localhost:8080',
  qbitUsername: 'admin',
  jellyfinUrl: '',
  jellyfinApiKey: '',
  watchFolderEnabled: false,
  autoTranscode: false,
  preferredQuality: '1080p',
  adminPassword: '$2b$12$hashedpassword',
  omdbApiKey: 'omdb123',
  googleAiApiKey: 'gai456',
  tmdbApiKey: 'tmdb789',
  virusTotalApiKey: '',
  prowlarrUrl: 'http://localhost:9696',
  prowlarrApiKey: 'stored-prowlarr-key',
};

let writtenConfig: Record<string, unknown> = {};

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ ...storedConfig }),
  writeConfig: (updates: Record<string, unknown>) => {
    writtenConfig = updates;
    return { ...storedConfig, ...updates };
  },
  isSetupComplete: () => storedConfig.setupComplete,
}));

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
}));

vi.mock('child_process', () => ({
  spawn: (_bin: string, _args: string[], _opts: unknown) => {
    const proc = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(0), 0);
      }),
    };
    proc.stdout.on = vi.fn((event: string, cb: (d: Buffer) => void) => {
      if (event === 'data') setTimeout(() => cb(Buffer.from('ffmpeg version 6.0')), 0);
    });
    return proc;
  },
}));

vi.mock('module', () => ({
  createRequire: () => () => '/usr/bin/ffmpeg',
}));

vi.mock('../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: () => false,
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  testConnection: async () => ({ ok: true, version: '5.0.0' }),
}));

vi.mock('../../server/folderWatcher.js', () => ({
  startWatcher: vi.fn(),
  stopWatcher: vi.fn(),
}));

vi.mock('../../server/existingMediaScanner.js', () => ({
  scanExistingMedia: () => ({ found: 0, skipped: 0, files: [] }),
  importExistingMedia: async () => ({ imported: 0, failed: 0 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return {
    body,
    query: {},
    params: {},
    cookies: { session: 'tok' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  writtenConfig = {};
});

// ── GET /api/setup — Prowlarr fields ─────────────────────────────────────────

describe('GET /api/setup — Prowlarr config exposure', () => {
  beforeEach(() => {
    mockAuthed = true;
    vi.resetModules();
  });

  it('returns prowlarrUrl in config object', async () => {
    const { default: handler } = await import('../../server/api/setup/GET.js');
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as { config: { prowlarrUrl: string } };
    expect(body.config.prowlarrUrl).toBe('http://localhost:9696');
  });

  it('returns hasProwlarrKey: true when key is set', async () => {
    const { default: handler } = await import('../../server/api/setup/GET.js');
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as { config: { hasProwlarrKey: boolean } };
    expect(body.config.hasProwlarrKey).toBe(true);
  });

  it('returns hasProwlarrKey: false when key is empty', async () => {
    storedConfig = { ...storedConfig, prowlarrApiKey: '' };
    vi.resetModules();
    const { default: handler } = await import('../../server/api/setup/GET.js');
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as { config: { hasProwlarrKey: boolean } };
    expect(body.config.hasProwlarrKey).toBe(false);
    // Restore
    storedConfig = { ...storedConfig, prowlarrApiKey: 'stored-prowlarr-key' };
  });

  it('does NOT expose raw prowlarrApiKey in response', async () => {
    const { default: handler } = await import('../../server/api/setup/GET.js');
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('stored-prowlarr-key');
  });
});

// ── POST /api/setup action='save' — Prowlarr fields ──────────────────────────

describe('POST /api/setup action=save — Prowlarr fields', () => {
  beforeEach(() => {
    mockAuthed = true;
    writtenConfig = {};
    vi.resetModules();
  });

  it('saves prowlarrUrl when provided', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({ action: 'save', prowlarrUrl: 'http://192.168.1.50:9696' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect(writtenConfig.prowlarrUrl).toBe('http://192.168.1.50:9696');
  });

  it('saves prowlarrApiKey when provided', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({ action: 'save', prowlarrApiKey: 'new-api-key-xyz' }), res);
    expect(res.statusCode).toBe(200);
    expect(writtenConfig.prowlarrApiKey).toBe('new-api-key-xyz');
  });

  it('saves both prowlarrUrl and prowlarrApiKey together', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'save',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'combined-key',
    }), res);
    expect(writtenConfig.prowlarrUrl).toBe('http://localhost:9696');
    expect(writtenConfig.prowlarrApiKey).toBe('combined-key');
  });

  it('does not save arbitrary unknown fields (security)', async () => {
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({ action: 'save', __proto__: 'evil', injectedField: 'bad' }), res);
    expect(writtenConfig.injectedField).toBeUndefined();
  });
});

// ── POST /api/setup action='test_prowlarr' ────────────────────────────────────

describe('POST /api/setup action=test_prowlarr', () => {
  beforeEach(() => {
    mockAuthed = true;
    vi.resetModules();
  });

  it('returns ok:true with version when Prowlarr responds 200', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ version: '1.14.3', appName: 'Prowlarr' }), { status: 200 })
    ) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'testkey',
    }), res);

    const body = res.body as { ok: boolean; version: string; appName: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe('1.14.3');
    expect(body.appName).toBe('Prowlarr');
  });

  it('returns ok:false when Prowlarr responds with non-200 status', async () => {
    global.fetch = vi.fn(async () =>
      new Response('Unauthorized', { status: 401 })
    ) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'wrong-key',
    }), res);

    const body = res.body as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('401');
  });

  it('returns ok:false when network error occurs', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'key',
    }), res);

    const body = res.body as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('ECONNREFUSED');
  });

  it('returns ok:false when prowlarrUrl is empty (and no stored URL)', async () => {
    // Override stored config to have no prowlarrUrl so fallback is also empty
    storedConfig = { ...storedConfig, prowlarrUrl: '', prowlarrApiKey: '' };
    vi.resetModules();
    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: '',
      prowlarrApiKey: 'key',
    }), res);

    const body = res.body as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    // Restore
    storedConfig = { ...storedConfig, prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'stored-prowlarr-key' };
  });

  it('sends X-Api-Key header to Prowlarr', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ version: '1.0', appName: 'Prowlarr' }), { status: 200 });
    }) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'my-secret-key',
    }), res);

    expect(capturedHeaders['X-Api-Key']).toBe('my-secret-key');
  });

  it('falls back to stored config prowlarrUrl when not in request body', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn(async (url: string) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({ version: '1.0', appName: 'Prowlarr' }), { status: 200 });
    }) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    // No prowlarrUrl in body — should use storedConfig.prowlarrUrl
    await handler(makeReq({ action: 'test_prowlarr' }), res);

    expect(capturedUrl).toContain('localhost:9696');
  });

  it('hits /api/v1/system/status endpoint on Prowlarr', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn(async (url: string) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({ version: '1.0', appName: 'Prowlarr' }), { status: 200 });
    }) as unknown as typeof fetch;

    const { default: handler } = await import('../../server/api/setup/POST.js');
    const res = makeRes();
    await handler(makeReq({
      action: 'test_prowlarr',
      prowlarrUrl: 'http://localhost:9696',
      prowlarrApiKey: 'key',
    }), res);

    expect(capturedUrl).toContain('/api/v1/system/status');
  });
});
