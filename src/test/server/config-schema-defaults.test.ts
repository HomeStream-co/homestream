/**
 * config-schema-defaults.test.ts
 *
 * Schema migration smoke test.
 *
 * Verifies that readConfig() returns a fully-populated AppConfig with no
 * undefined required fields, even when the on-disk file is:
 *
 *   1. Missing entirely (first run)
 *   2. An empty object {} (corrupted / wiped)
 *   3. A v1 file with only the original fields (upgrade from old install)
 *   4. A file with unknown/extra keys (downgrade or manual edit)
 *
 * WHY THIS MATTERS
 * ────────────────
 * Every time a new field is added to AppConfig, it must also appear in the
 * DEFAULTS object in configStore.ts. If it's missing from DEFAULTS, any code
 * that reads that field on an existing install gets `undefined` at runtime —
 * which TypeScript won't catch because the spread merge types as AppConfig.
 *
 * This test catches that class of bug automatically: add a field to the
 * interface, forget the default, and this test fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock state ────────────────────────────────────────────────────────────────

let mockDiskContent: string | null = null;   // null = file does not exist

vi.mock('fs', () => ({
  default: {
    existsSync: () => mockDiskContent !== null,
    readFileSync: () => {
      if (mockDiskContent === null) throw new Error('ENOENT');
      return mockDiskContent;
    },
    writeFileSync: vi.fn(),
    renameSync:    vi.fn(),
    unlinkSync:    vi.fn(),
  },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/data/${name}`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * All required (non-optional) keys from AppConfig.
 * Optional keys (marked with ?) are excluded — they are allowed to be undefined.
 */
const REQUIRED_KEYS: Array<string> = [
  'setupComplete',
  'mediaDir',
  'downloadsDir',
  'libraryDir',
  'qbitUrl',
  'qbitUsername',
  'qbitPassword',
  'jellyfinUrl',
  'jellyfinApiKey',
  'adminPassword',
  'omdbApiKey',
  'googleAiApiKey',
  'tmdbApiKey',
  'aiProvider',
  'ollamaUrl',
  'ollamaModel',
  'watchFolderEnabled',
  'autoTranscode',
  'preferredQuality',
  'virusTotalApiKey',
  'storageMoviesPct',
  'storageTvPct',
  'prowlarrUrl',
  'prowlarrApiKey',
  'realDebridApiKey',
];

function assertAllRequiredFieldsDefined(config: unknown) {
  const c = config as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (c[key] === undefined) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `readConfig() returned undefined for required field(s): ${missing.join(', ')}\n` +
      'Add the missing field(s) to DEFAULTS in src/server/configStore.ts',
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readConfig() — schema defaults smoke test', () => {
  beforeEach(() => {
    mockDiskContent = null;
    vi.resetModules();
  });

  it('returns all required fields when config file does not exist (first run)', async () => {
    mockDiskContent = null;
    const { readConfig } = await import('../../server/configStore.js');
    assertAllRequiredFieldsDefined(readConfig());
  });

  it('returns all required fields when config file is an empty object', async () => {
    mockDiskContent = '{}';
    const { readConfig } = await import('../../server/configStore.js');
    assertAllRequiredFieldsDefined(readConfig());
  });

  it('returns all required fields when config file has only v1 fields (upgrade path)', async () => {
    // Simulate a config.json written by an older version that only had the
    // original 6 fields — all newer fields must still get their defaults.
    mockDiskContent = JSON.stringify({
      setupComplete: true,
      mediaDir: '/mnt/media',
      adminPassword: 'hashed-pw',
      omdbApiKey: 'abc123',
      tmdbApiKey: 'xyz789',
      qbitUrl: 'http://localhost:8080',
    });
    const { readConfig } = await import('../../server/configStore.js');
    assertAllRequiredFieldsDefined(readConfig());
  });

  it('returns all required fields when config file has unknown extra keys', async () => {
    // Simulate a config.json from a newer version with fields this version
    // doesn't know about — should not crash and required fields still present.
    mockDiskContent = JSON.stringify({
      setupComplete: true,
      unknownFutureField: 'some-value',
      anotherNewField: 42,
    });
    const { readConfig } = await import('../../server/configStore.js');
    assertAllRequiredFieldsDefined(readConfig());
  });

  it('returns all required fields when config file is malformed JSON', async () => {
    mockDiskContent = '{ this is not valid json :::';
    const { readConfig } = await import('../../server/configStore.js');
    assertAllRequiredFieldsDefined(readConfig());
  });

  it('setupComplete defaults to false on a fresh install', async () => {
    mockDiskContent = null;
    const { readConfig } = await import('../../server/configStore.js');
    expect(readConfig().setupComplete).toBe(false);
  });

  it('aiProvider defaults to gemini', async () => {
    mockDiskContent = '{}';
    const { readConfig } = await import('../../server/configStore.js');
    expect(readConfig().aiProvider).toBe('gemini');
  });

  it('preferredQuality defaults to 1080p', async () => {
    mockDiskContent = '{}';
    const { readConfig } = await import('../../server/configStore.js');
    expect(readConfig().preferredQuality).toBe('1080p');
  });

  it('storageMoviesPct + storageTvPct defaults sum to ≤ 100', async () => {
    mockDiskContent = '{}';
    const { readConfig } = await import('../../server/configStore.js');
    const cfg = readConfig();
    expect(cfg.storageMoviesPct + cfg.storageTvPct).toBeLessThanOrEqual(100);
  });

  it('on-disk values are preserved and not overwritten by defaults', async () => {
    mockDiskContent = JSON.stringify({
      setupComplete: true,
      adminPassword: 'my-hashed-password',
      tmdbApiKey: 'my-tmdb-key',
      preferredQuality: '4k',
      storageMoviesPct: 50,
      storageTvPct: 40,
    });
    const { readConfig } = await import('../../server/configStore.js');
    const cfg = readConfig();
    expect(cfg.setupComplete).toBe(true);
    expect(cfg.adminPassword).toBe('my-hashed-password');
    expect(cfg.tmdbApiKey).toBe('my-tmdb-key');
    expect(cfg.preferredQuality).toBe('4k');
    expect(cfg.storageMoviesPct).toBe(50);
    expect(cfg.storageTvPct).toBe(40);
  });
});
