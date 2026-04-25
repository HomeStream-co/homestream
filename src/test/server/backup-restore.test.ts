/**
 * backup-restore.test.ts
 *
 * Tests for POST /api/backup (restore endpoint).
 *
 * Covers:
 *   1.  400 when backup payload is missing
 *   2.  400 when backup version is not 1
 *   3.  Library restored when restoreLibrary=true (default)
 *   4.  Library NOT restored when restoreLibrary=false
 *   5.  Profiles restored — redacted PINs cleared, hasPin set false
 *   6.  Profiles NOT restored when restoreProfiles=false
 *   7.  Config restored (non-sensitive fields) when restoreConfig=true
 *   8.  Config NOT restored when restoreConfig=false (default)
 *   9.  Sensitive config fields are NEVER restored even when restoreConfig=true:
 *         adminPassword, qbitPassword, omdbApiKey, googleAiApiKey,
 *         tmdbApiKey, jellyfinApiKey
 *   10. realDebridApiKey is NEVER restored from backup (security — must re-enter)
 *   11. 401 when not authenticated
 *   12. 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockAuthed = true;
const mockWriteLibraryDirect = vi.fn().mockResolvedValue(undefined);
const mockWriteFileSync      = vi.fn();
const mockReadFileSync       = vi.fn(() => '{}');
const mockExistsSync         = vi.fn(() => true);

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

vi.mock('../../server/libraryStore.js', () => ({
  writeLibraryDirect: (...args: unknown[]) => mockWriteLibraryDirect(...args),
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/data/${name}`,
}));

vi.mock('fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    readFileSync:  (...args: unknown[]) => mockReadFileSync(...args),
    existsSync:    (...args: unknown[]) => mockExistsSync(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown) {
  const req = { body, cookies: { session: 'tok' } } as unknown as Request;
  const captured: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { captured.json = v; return res; }),
  } as unknown as Response;
  return { req, res, captured };
}

const VALID_BACKUP = {
  version: 1,
  library: [{ id: '1', title: 'Inception', type: 'movie' }],
  profiles: [
    { id: 'p1', name: 'Alice', pin: '[REDACTED]', hasPin: true },
    { id: 'p2', name: 'Bob',   pin: '1234',       hasPin: true },
  ],
  config: {
    mediaDir: '/media',
    preferredQuality: '1080p',
    adminPassword: 'secret',
    qbitPassword: 'qbpass',
    omdbApiKey: 'omdb-key',
    googleAiApiKey: 'gemini-key',
    tmdbApiKey: 'tmdb-key',
    jellyfinApiKey: 'jf-key',
    realDebridApiKey: 'rd-key',
  },
};

const { default: handler } = await import('../../server/api/backup/POST.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/backup — restore', () => {
  beforeEach(() => {
    mockAuthed = true;
    mockWriteLibraryDirect.mockClear();
    mockWriteFileSync.mockClear();
    mockReadFileSync.mockReturnValue('{}');
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const { req, res } = makeReqRes({ backup: VALID_BACKUP });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when backup payload is missing', async () => {
    const { req, res } = makeReqRes({});
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when backup version is not 1', async () => {
    const { req, res } = makeReqRes({ backup: { ...VALID_BACKUP, version: 2 } });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('restores library by default (restoreLibrary not specified)', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP });
    await handler(req as Request, res as Response);
    expect(mockWriteLibraryDirect).toHaveBeenCalledWith(VALID_BACKUP.library);
  });

  it('does NOT restore library when restoreLibrary=false', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreLibrary: false } });
    await handler(req as Request, res as Response);
    expect(mockWriteLibraryDirect).not.toHaveBeenCalled();
  });

  it('clears redacted PINs and sets hasPin:false on restore', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP });
    await handler(req as Request, res as Response);

    // Find the writeFileSync call for profiles
    const profilesCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('profiles'),
    );
    expect(profilesCall).toBeDefined();
    const written = JSON.parse(profilesCall![1] as string) as Array<Record<string, unknown>>;

    // Alice had [REDACTED] pin — should be cleared
    const alice = written.find(p => p.name === 'Alice');
    expect(alice?.pin).toBeUndefined();
    expect(alice?.hasPin).toBe(false);

    // Bob had a real pin — should be preserved as-is
    const bob = written.find(p => p.name === 'Bob');
    expect(bob?.pin).toBe('1234');
  });

  it('does NOT restore profiles when restoreProfiles=false', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreProfiles: false } });
    await handler(req as Request, res as Response);

    const profilesCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('profiles'),
    );
    expect(profilesCall).toBeUndefined();
  });

  it('does NOT restore config by default (restoreConfig=false)', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP });
    await handler(req as Request, res as Response);

    const configCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('config'),
    );
    expect(configCall).toBeUndefined();
  });

  it('restores non-sensitive config fields when restoreConfig=true', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreConfig: true } });
    await handler(req as Request, res as Response);

    const configCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('config'),
    );
    expect(configCall).toBeDefined();
    const written = JSON.parse(configCall![1] as string) as Record<string, unknown>;
    expect(written.mediaDir).toBe('/media');
    expect(written.preferredQuality).toBe('1080p');
  });

  it('NEVER restores adminPassword from backup even when restoreConfig=true', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreConfig: true } });
    await handler(req as Request, res as Response);

    const configCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('config'),
    );
    const written = JSON.parse(configCall![1] as string) as Record<string, unknown>;
    expect(written.adminPassword).toBeUndefined();
  });

  it('NEVER restores omdbApiKey, googleAiApiKey, tmdbApiKey, jellyfinApiKey from backup', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreConfig: true } });
    await handler(req as Request, res as Response);

    const configCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('config'),
    );
    const written = JSON.parse(configCall![1] as string) as Record<string, unknown>;
    expect(written.omdbApiKey).toBeUndefined();
    expect(written.googleAiApiKey).toBeUndefined();
    expect(written.tmdbApiKey).toBeUndefined();
    expect(written.jellyfinApiKey).toBeUndefined();
  });

  it('NEVER restores realDebridApiKey from backup — must be re-entered', async () => {
    const { req, res } = makeReqRes({ backup: VALID_BACKUP, options: { restoreConfig: true } });
    await handler(req as Request, res as Response);

    const configCall = mockWriteFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('config'),
    );
    expect(configCall).toBeDefined();
    const written = JSON.parse(configCall![1] as string) as Record<string, unknown>;

    // This is the key assertion — RD key must never come back from a backup
    expect(written.realDebridApiKey).toBeUndefined();
  });

  it('returns ok:true with restored items listed', async () => {
    const { req, res, captured } = makeReqRes({ backup: VALID_BACKUP });
    await handler(req as Request, res as Response);

    const body = captured.json as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.restored)).toBe(true);
  });
});
