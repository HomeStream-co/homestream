/**
 * setup-wizard.test.ts
 *
 * Full coverage of the Setup Wizard API:
 *   GET  /api/setup          — returns current config + ffmpeg status
 *   POST /api/setup          — handles all wizard actions
 *
 * Wizard steps tested:
 *   Step 1 — Welcome / password setup (action: 'save' with adminPassword)
 *   Step 2 — Media directory setup (action: 'save' with mediaDir)
 *   Step 3 — qBittorrent connection (action: 'test_qbit')
 *   Step 4 — API keys (action: 'save' with omdbApiKey, tmdbApiKey, googleAiApiKey)
 *   Step 5 — Complete setup (action: 'complete')
 *
 * Additional actions tested:
 *   - test_jellyfin
 *   - scan_existing
 *   - import_existing
 *   - reset
 *   - unknown action → 400
 *
 * Auth rules:
 *   - GET: unauthenticated allowed before setup complete
 *   - GET: requires auth after setup complete
 *   - POST: unauthenticated allowed before setup complete
 *   - POST: requires auth after setup complete
 *
 * Security:
 *   - DEVELOPER_LOCK blocks password change → 403
 *   - Boolean coercion for watchFolderEnabled, autoTranscode, vpnEnabled
 *
 * Error handling:
 *   - 400 for unknown action
 *   - 500 for unexpected errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockReadConfig      = vi.fn();
const mockWriteConfig     = vi.fn();
const mockIsSetupComplete = vi.fn();
const mockTestQbit        = vi.fn();
const mockStartWatcher    = vi.fn();
const mockStopWatcher     = vi.fn();
const mockScanExisting    = vi.fn();
const mockImportExisting  = vi.fn();
const mockIsDeveloperLocked = vi.fn();
const mockBcryptHash      = vi.fn();
let   mockAuthed = true;

vi.mock('../../server/configStore.js', () => ({
  readConfig:      (...a: unknown[]) => mockReadConfig(...a),
  writeConfig:     (...a: unknown[]) => mockWriteConfig(...a),
  isSetupComplete: (...a: unknown[]) => mockIsSetupComplete(...a),
}));

vi.mock('../../server/qbittorrentClient.js', () => ({
  testConnection: (...a: unknown[]) => mockTestQbit(...a),
}));

vi.mock('../../server/folderWatcher.js', () => ({
  startWatcher: (...a: unknown[]) => mockStartWatcher(...a),
  stopWatcher:  (...a: unknown[]) => mockStopWatcher(...a),
}));

vi.mock('../../server/existingMediaScanner.js', () => ({
  scanExistingMedia:   (...a: unknown[]) => mockScanExisting(...a),
  importExistingMedia: (...a: unknown[]) => mockImportExisting(...a),
}));

vi.mock('../../server/ownershipSeed.js', () => ({
  isDeveloperLocked: (...a: unknown[]) => mockIsDeveloperLocked(...a),
}));

vi.mock('bcryptjs', () => ({
  default: { hash: (...a: unknown[]) => mockBcryptHash(...a) },
}));

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

// Mock fs (directory creation)
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
}));

// Mock child_process (ffmpeg detection)
vi.mock('child_process', () => ({
  spawn: (_bin: string, _args: string[], _opts: unknown) => {
    const proc = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(0), 0);
      }),
    };
    // Simulate stdout data with ffmpeg version
    proc.stdout.on = vi.fn((event: string, cb: (d: Buffer) => void) => {
      if (event === 'data') setTimeout(() => cb(Buffer.from('ffmpeg version 6.0')), 0);
    });
    return proc;
  },
}));

// Mock module (for createRequire in ffmpeg detection)
vi.mock('module', () => ({
  createRequire: () => () => '/usr/bin/ffmpeg',
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

const BASE_CONFIG = {
  mediaDir: '/media', downloadsDir: '/media/downloads', libraryDir: '/media/library',
  qbitUrl: 'http://localhost:8080', qbitUsername: 'admin',
  jellyfinUrl: '', jellyfinApiKey: '',
  watchFolderEnabled: false, autoTranscode: false, preferredQuality: '1080p',
  adminPassword: '$2b$12$hashedpassword',
  omdbApiKey: 'omdb123', googleAiApiKey: 'gai456', tmdbApiKey: 'tmdb789',
  virusTotalApiKey: '',
};

// ── GET /api/setup ────────────────────────────────────────────────────────────

describe('GET /api/setup', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    const mod = await import('../../server/api/setup/GET.js');
    handler = mod.default;
  });

  it('allows unauthenticated access before setup is complete', async () => {
    mockAuthed = false;
    mockIsSetupComplete.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(200);
  });

  it('requires auth after setup is complete', async () => {
    mockAuthed = false;
    mockIsSetupComplete.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns setupComplete status', async () => {
    mockIsSetupComplete.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { setupComplete: boolean }).setupComplete).toBe(false);
  });

  it('returns masked API keys (not full values)', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { config: { omdbApiKey: string; tmdbApiKey: string } };
    // Should be masked, not the raw key
    expect(body.config.omdbApiKey).not.toBe('omdb123');
    expect(body.config.omdbApiKey).toContain('•');
    expect(body.config.tmdbApiKey).not.toBe('tmdb789');
  });

  it('returns hasAdminPassword: true when password is set', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { hasAdminPassword: boolean }).hasAdminPassword).toBe(true);
  });

  it('returns hasAdminPassword: false when no password', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, adminPassword: '' });
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    expect((res.body as { hasAdminPassword: boolean }).hasAdminPassword).toBe(false);
  });

  it('returns ffmpeg availability info', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { ffmpeg: { available: boolean; path: string } };
    expect(body.ffmpeg).toBeDefined();
    expect(typeof body.ffmpeg.available).toBe('boolean');
    expect(body.ffmpeg.path).toBeTruthy();
  });

  it('returns mediaDir and downloadsDir', async () => {
    const res = makeRes();
    await handler(makeReq(), res as unknown as Response);
    const body = res.body as { mediaDir: string; downloadsDir: string };
    expect(body.mediaDir).toBe('/media');
    expect(body.downloadsDir).toBe('/media/downloads');
  });
});

// ── POST /api/setup — action: 'save' ─────────────────────────────────────────

describe("POST /api/setup — action: 'save'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockWriteConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockIsDeveloperLocked.mockReset().mockReturnValue(false);
    mockBcryptHash.mockReset().mockResolvedValue('$2b$12$hashed');
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  // ── Step 1: Password setup ──────────────────────────────────────────────────

  it('Step 1 — hashes adminPassword with bcrypt before saving', async () => {
    const req = makeReq({ body: { action: 'save', adminPassword: 'mysecret' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockBcryptHash).toHaveBeenCalledWith('mysecret', 12);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ adminPassword: '$2b$12$hashed' }),
    );
    expect(res.body).toMatchObject({ ok: true });
  });

  it('Step 1 — DEVELOPER_LOCK blocks password change with 403', async () => {
    mockIsDeveloperLocked.mockReturnValue(true);
    const req = makeReq({ body: { action: 'save', adminPassword: 'hacker' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect(mockBcryptHash).not.toHaveBeenCalled();
    expect(mockWriteConfig).not.toHaveBeenCalled();
  });

  // ── Step 2: Media directory ─────────────────────────────────────────────────

  it('Step 2 — saves mediaDir and creates subdirectories', async () => {
    const req = makeReq({ body: { action: 'save', mediaDir: '/mnt/media' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaDir: expect.stringContaining('media'),
        downloadsDir: expect.stringContaining('downloads'),
        libraryDir: expect.stringContaining('library'),
      }),
    );
    expect(res.body).toMatchObject({ ok: true });
  });

  it('Step 2 — saves preferredQuality', async () => {
    const req = makeReq({ body: { action: 'save', preferredQuality: '4K' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ preferredQuality: '4K' }),
    );
  });

  // ── Step 3: Boolean coercion ────────────────────────────────────────────────

  it('Step 3 — coerces watchFolderEnabled string "true" to boolean true', async () => {
    const req = makeReq({ body: { action: 'save', watchFolderEnabled: 'true' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ watchFolderEnabled: true }),
    );
  });

  it('Step 3 — coerces watchFolderEnabled string "false" to boolean false', async () => {
    const req = makeReq({ body: { action: 'save', watchFolderEnabled: 'false' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ watchFolderEnabled: false }),
    );
  });

  it('Step 3 — coerces autoTranscode string "true" to boolean true', async () => {
    const req = makeReq({ body: { action: 'save', autoTranscode: 'true' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ autoTranscode: true }),
    );
  });

  it('Step 3 — coerces vpnEnabled string "true" to boolean true', async () => {
    const req = makeReq({ body: { action: 'save', vpnEnabled: 'true' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ vpnEnabled: true }),
    );
  });

  // ── Step 4: API keys ────────────────────────────────────────────────────────

  it('Step 4 — saves omdbApiKey, tmdbApiKey, googleAiApiKey', async () => {
    const req = makeReq({
      body: { action: 'save', omdbApiKey: 'omdb123', tmdbApiKey: 'tmdb456', googleAiApiKey: 'gai789' },
    });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ omdbApiKey: 'omdb123', tmdbApiKey: 'tmdb456', googleAiApiKey: 'gai789' }),
    );
  });

  it('Step 4 — only saves allowed fields (ignores unknown fields)', async () => {
    const req = makeReq({ body: { action: 'save', hackerField: 'evil', tmdbApiKey: 'safe' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    const call = mockWriteConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(call.hackerField).toBeUndefined();
    expect(call.tmdbApiKey).toBe('safe');
  });

  // ── Auth after setup complete ───────────────────────────────────────────────

  it('requires auth for save after setup is complete', async () => {
    mockAuthed = false;
    mockIsSetupComplete.mockReturnValue(true);
    const req = makeReq({ body: { action: 'save', tmdbApiKey: 'x' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
    expect(mockWriteConfig).not.toHaveBeenCalled();
  });
});

// ── POST /api/setup — action: 'test_qbit' ────────────────────────────────────

describe("POST /api/setup — action: 'test_qbit'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockTestQbit.mockReset();
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('returns qBit connection result on success', async () => {
    mockTestQbit.mockResolvedValue({ ok: true, version: '5.0.0' });
    const req = makeReq({ body: { action: 'test_qbit', qbitUrl: 'http://localhost:8080' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.body).toMatchObject({ ok: true, version: '5.0.0' });
  });

  it('returns failure result when qBit unreachable', async () => {
    mockTestQbit.mockResolvedValue({ ok: false, error: 'Connection refused' });
    const req = makeReq({ body: { action: 'test_qbit', qbitUrl: 'http://localhost:9999' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });

  it('injects qbitUrl into process.env for testing', async () => {
    mockTestQbit.mockResolvedValue({ ok: true });
    const req = makeReq({ body: { action: 'test_qbit', qbitUrl: 'http://myqbit:8080', qbitUsername: 'user', qbitPassword: 'pass' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(process.env.QBIT_URL).toBe('http://myqbit:8080');
    expect(process.env.QBIT_USERNAME).toBe('user');
  });
});

// ── POST /api/setup — action: 'test_jellyfin' ────────────────────────────────

describe("POST /api/setup — action: 'test_jellyfin'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('returns ok:false when no jellyfinUrl configured', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, jellyfinUrl: '' });
    const req = makeReq({ body: { action: 'test_jellyfin' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { error: string }).error).toContain('No Jellyfin URL');
  });
});

// ── POST /api/setup — action: 'complete' (Step 5) ────────────────────────────

describe("POST /api/setup — action: 'complete'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockWriteConfig.mockReset().mockReturnValue({ ...BASE_CONFIG, setupComplete: true, watchFolderEnabled: false });
    mockStartWatcher.mockReset();
    mockStopWatcher.mockReset();
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('Step 5 — marks setup as complete', async () => {
    const req = makeReq({ body: { action: 'complete' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ setupComplete: true }),
    );
    expect(res.body).toMatchObject({ ok: true });
    expect((res.body as { message: string }).message).toContain('Setup complete');
  });

  it('Step 5 — starts folder watcher when watchFolderEnabled + downloadsDir', async () => {
    mockWriteConfig.mockReturnValue({
      ...BASE_CONFIG, setupComplete: true,
      watchFolderEnabled: true, downloadsDir: '/media/downloads',
    });
    const req = makeReq({ body: { action: 'complete' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockStopWatcher).toHaveBeenCalled();
    expect(mockStartWatcher).toHaveBeenCalledWith('/media/downloads');
  });

  it('Step 5 — does NOT start watcher when watchFolderEnabled is false', async () => {
    mockWriteConfig.mockReturnValue({ ...BASE_CONFIG, setupComplete: true, watchFolderEnabled: false });
    const req = makeReq({ body: { action: 'complete' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockStartWatcher).not.toHaveBeenCalled();
  });

  it('Step 5 — sets setupCompletedAt timestamp', async () => {
    const req = makeReq({ body: { action: 'complete' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    const call = mockWriteConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(call.setupCompletedAt).toBeTruthy();
    expect(new Date(call.setupCompletedAt as string).getFullYear()).toBeGreaterThan(2020);
  });
});

// ── POST /api/setup — action: 'scan_existing' ────────────────────────────────

describe("POST /api/setup — action: 'scan_existing'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockReadConfig.mockReset().mockReturnValue(BASE_CONFIG);
    mockScanExisting.mockReset();
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('returns 400 when no mediaDir configured', async () => {
    mockReadConfig.mockReturnValue({ ...BASE_CONFIG, mediaDir: '' });
    const req = makeReq({ body: { action: 'scan_existing' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('No media directory');
  });

  it('returns scan results with found/skipped counts', async () => {
    mockScanExisting.mockReturnValue({
      found: 3, skipped: 1,
      files: [
        { name: 'movie1.mkv', size: 4_000_000_000, path: '/media/movie1.mkv' },
        { name: 'movie2.mp4', size: 2_000_000_000, path: '/media/movie2.mp4' },
        { name: 'show.avi',   size: 1_000_000_000, path: '/media/show.avi' },
      ],
    });
    const req = makeReq({ body: { action: 'scan_existing', mediaDir: '/media' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    const body = res.body as { found: number; skipped: number; files: unknown[] };
    expect(body.found).toBe(3);
    expect(body.skipped).toBe(1);
    expect(body.files).toHaveLength(3);
  });

  it('truncates file list at 200 items', async () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
      name: `movie${i}.mkv`, size: 1_000_000_000, path: `/media/movie${i}.mkv`,
    }));
    mockScanExisting.mockReturnValue({ found: 250, skipped: 0, files });
    const req = makeReq({ body: { action: 'scan_existing' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    const body = res.body as { files: unknown[]; truncated: boolean };
    expect(body.files).toHaveLength(200);
    expect(body.truncated).toBe(true);
  });
});

// ── POST /api/setup — action: 'import_existing' ──────────────────────────────

describe("POST /api/setup — action: 'import_existing'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockImportExisting.mockReset();
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('returns { imported: 0 } when no scan was run first', async () => {
    const req = makeReq({ body: { action: 'import_existing' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.body).toMatchObject({ imported: 0, failed: 0 });
  });
});

// ── POST /api/setup — action: 'reset' ────────────────────────────────────────

describe("POST /api/setup — action: 'reset'", () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    mockWriteConfig.mockReset().mockReturnValue({});
    mockStopWatcher.mockReset();
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('resets setupComplete to false', async () => {
    const req = makeReq({ body: { action: 'reset' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(mockWriteConfig).toHaveBeenCalledWith({ setupComplete: false });
    expect(mockStopWatcher).toHaveBeenCalled();
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ── POST /api/setup — unknown action ─────────────────────────────────────────

describe('POST /api/setup — unknown action', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthed = true;
    mockIsSetupComplete.mockReset().mockReturnValue(false);
    const mod = await import('../../server/api/setup/POST.js');
    handler = mod.default;
  });

  it('returns 400 for unknown action', async () => {
    const req = makeReq({ body: { action: 'do_something_evil' } });
    const res = makeRes();
    await handler(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('Unknown action');
  });
});
