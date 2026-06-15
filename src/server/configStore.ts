/**
 * configStore — persistent app configuration
 *
 * Stores setup wizard results in homestream-config.json.
 * All values are optional — the app works without any of them,
 * but the setup wizard guides users through the ideal configuration.
 *
 * Write safety: all writes go through a promise queue (same pattern as
 * libraryStore) to prevent concurrent saves from corrupting the config file.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

import { dataPath } from './dataDir.js';
const CONFIG_PATH = dataPath('homestream-config.json');

// ── Torrent source types ───────────────────────────────────────────────────────

export type TorrentSourceType = 'torrentio' | 'nyaa' | 'prowlarr' | 'jackett' | 'torznab' | 'rss';

export interface TorrentSource {
  id: string;
  name: string;
  type: TorrentSourceType;
  url?: string;       // required for jackett/torznab/rss
  apiKey?: string;    // optional auth
  enabled: boolean;
  builtIn: boolean;   // built-in sources cannot be deleted
}

export const DEFAULT_TORRENT_SOURCES: TorrentSource[] = [
  { id: 'builtin-torrentio', name: 'Torrentio',  type: 'torrentio', enabled: true,  builtIn: true },
  { id: 'builtin-nyaa',      name: 'Nyaa.si',    type: 'nyaa',      enabled: true,  builtIn: true },
  { id: 'builtin-prowlarr',  name: 'Prowlarr',   type: 'prowlarr',  enabled: false, builtIn: true },
];

export function makeTorrentSourceId(): string { return randomUUID(); }

export interface AppConfig {
  setupComplete: boolean;
  mediaDir: string;           // e.g. /media or /mnt/raid/media
  downloadsDir: string;       // mediaDir/downloads
  libraryDir: string;         // mediaDir/library
  qbitUrl: string;            // e.g. http://localhost:8080
  qbitUsername: string;
  qbitPassword: string;
  jellyfinUrl: string;        // e.g. http://localhost:8096
  jellyfinApiKey: string;
  adminPassword: string;
  omdbApiKey: string;
  googleAiApiKey: string;
  tmdbApiKey: string;
  /**
   * Unified AI key — a single field that holds whichever key the user pasted.
   * The chat handler detects the provider from the key prefix:
   *   AIza…      → Gemini
   *   sk-ant-…   → Anthropic
   *   sk-…       → OpenAI
   *   http://…   → Ollama URL (stored here instead of ollamaUrl when entered via wizard)
   * Legacy per-provider fields (googleAiApiKey, openaiApiKey, anthropicApiKey) are
   * still read as fallbacks so existing configs keep working.
   */
  aiApiKey: string;
  // AI provider selection
  aiProvider: 'gemini' | 'ollama' | 'openai' | 'anthropic';
  ollamaUrl: string;          // e.g. http://localhost:11434
  ollamaModel: string;        // e.g. llama3, mistral, phi3
  openaiApiKey: string;       // OpenAI API key (sk-...)
  openaiModel: string;        // e.g. gpt-4.1, gpt-5
  anthropicApiKey: string;    // Anthropic API key (sk-ant-...)
  anthropicModel: string;     // e.g. claude-sonnet-4-6
  watchFolderEnabled: boolean;
  autoTranscode: boolean;
  preferredQuality: '720p' | '1080p' | '4k' | 'best';
  /** Transcode quality preset — controls CRF offset applied during re-encode */
  transcodePreset: 'fast' | 'balanced' | 'quality' | 'lossless';
  virusTotalApiKey: string;   // optional — activates Layer 2 hash lookup
  setupCompletedAt?: string;
  // VPN interface binding — torrent traffic is locked to this adapter
  vpnInterface?: string;      // e.g. "Norton Secure VPN" — Windows adapter name
  vpnKillSwitch?: boolean;    // pause downloads if vpnInterface goes down
  // Storage organisation — percentage of total disk allocated per category (0–100, must sum ≤ 100)
  storageMoviesPct: number;   // e.g. 60 → 60% of disk reserved for movies
  storageTvPct: number;       // e.g. 30 → 30% of disk reserved for TV shows
  // storageOtherPct is implied: 100 - movies - tv
  // Prowlarr — self-hosted indexer aggregator (queries 500+ trackers)
  prowlarrUrl: string;        // e.g. http://localhost:9696
  prowlarrApiKey: string;     // Settings → General → API Key in Prowlarr UI
  // Real-Debrid — premium link hoster used as preferred download backend
  // When set, downloads go via RD (no qBittorrent or WebTorrent needed)
  realDebridApiKey: string;
  /**
   * Torrent source registry — controls which indexers are queried when
   * searching for streams. Built-in sources (torrentio, nyaa, prowlarr) are
   * always present; users can add custom Jackett/Torznab/RSS endpoints.
   *
   * Each entry:
   *   id       — stable UUID used as React key + delete target
   *   name     — display label shown in Settings
   *   type     — 'torrentio' | 'nyaa' | 'prowlarr' | 'jackett' | 'torznab' | 'rss'
   *   url      — base URL (required for jackett/torznab/rss; ignored for built-ins)
   *   apiKey   — optional API key (Jackett global key, Torznab auth)
   *   enabled  — whether this source is queried
   *   builtIn  — true for the three built-in sources (cannot be deleted)
   */
  torrentSources: TorrentSource[];
  // Cached RD subscription data — fetched once, re-fetched only after expiry
  realDebridPremiumExpiry?: string;    // ISO — when the RD subscription actually expires
  realDebridPremiumCheckedAt?: string; // ISO — when we last fetched from RD API
  // API key save timestamps (ISO strings) — used for lifespan countdown in Settings
  omdbApiKeySavedAt?: string;
  googleAiApiKeySavedAt?: string;
  tmdbApiKeySavedAt?: string;
  openaiApiKeySavedAt?: string;
  anthropicApiKeySavedAt?: string;
  realDebridApiKeySavedAt?: string;
}

const DEFAULTS: AppConfig = {
  setupComplete: false,
  // Default mediaDir: use MEDIA_DIR env var if set (Docker/cloud), otherwise
  // leave empty so the setup wizard always prompts. Do NOT default to '/media'
  // in the packaged .exe — that's a Linux path that doesn't exist on Windows.
  mediaDir: process.env.MEDIA_DIR || '',
  downloadsDir: '',
  libraryDir: '',
  qbitUrl: process.env.QBIT_URL || 'http://localhost:8080',
  qbitUsername: process.env.QBIT_USERNAME || 'admin',
  qbitPassword: process.env.QBIT_PASSWORD || 'homestream',
  jellyfinUrl: process.env.JELLYFIN_URL || 'http://localhost:8096',
  jellyfinApiKey: process.env.JELLYFIN_API_KEY || '',
  // adminPassword is set by the setup wizard only (homestream-config.json).
  // Never read from env — that bypasses the wizard and locks users out.
  adminPassword: '',
  // TMDB and OMDB are bundled keys — users never need to supply these.
  // They fall back to env vars so the developer can rotate them without a code push.
  omdbApiKey: process.env.OMDB_API_KEY || 'b46d0701',
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
  tmdbApiKey: process.env.TMDB_API_KEY || '1fc76698ee09cbcfe927abb03da9fe5a',
  aiApiKey: process.env.AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
  aiProvider: 'gemini',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  watchFolderEnabled: true,
  autoTranscode: true,
  preferredQuality: '1080p',
  transcodePreset: 'balanced',
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY || '',
  storageMoviesPct: 60,
  storageTvPct: 30,
  prowlarrUrl: process.env.PROWLARR_URL || 'http://localhost:9696',
  prowlarrApiKey: process.env.PROWLARR_API_KEY || '',
  realDebridApiKey: process.env.REAL_DEBRID_API_KEY || '',
  torrentSources: DEFAULT_TORRENT_SOURCES,
};

// ── Read (write-through in-memory cache) ──────────────────────────────────────
//
// FIX (🟢): requireAuth calls readConfig() on every authenticated request.
// Under concurrent streaming + API calls this is unnecessary I/O. We cache
// the parsed config for up to CONFIG_CACHE_TTL_MS — short enough that Settings
// changes are reflected almost immediately, long enough to eliminate redundant
// disk reads under load.
//
// writeConfig() always invalidates the cache immediately so callers that write
// then read in the same tick always see the updated value.
//
// Cache is disabled in test environments (NODE_ENV=test) so tests that mock
// the filesystem see fresh reads on every call, as they expect.

const CONFIG_CACHE_TTL_MS = 5_000; // 5 seconds

let _configCache: AppConfig | null = null;
let _configCacheAt = 0;

export function invalidateConfigCache(): void {
  _configCache = null;
  _configCacheAt = 0;
}

/**
 * Reset the in-memory cache. FOR TESTING ONLY.
 * Call this in beforeEach when the fs mock resets diskData so the cache
 * doesn't serve stale data from a previous test.
 */
export function _resetConfigCacheForTesting(): void {
  _configCache = null;
  _configCacheAt = 0;
}

export function readConfig(): AppConfig {
  // In test env, always read from disk (tests mock fs and expect fresh reads)
  if (process.env.NODE_ENV !== 'test') {
    const now = Date.now();
    if (_configCache !== null && now - _configCacheAt < CONFIG_CACHE_TTL_MS) {
      // Return a shallow copy so callers can't mutate the cached object
      return { ..._configCache };
    }
  }

  let parsed: AppConfig;
  if (!fs.existsSync(CONFIG_PATH)) {
    parsed = { ...DEFAULTS };
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
      parsed = { ...DEFAULTS, ...raw };
    } catch {
      parsed = { ...DEFAULTS };
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    _configCache = parsed;
    _configCacheAt = Date.now();
  }

  // Populate process.env keys so files reading from process.env directly
  // get the user's configured values (e.g. qbittorrentClient, mediaUtils, enrich).
  const isElectron = !!process.env.ELECTRON;
  const setEnvIfConfigured = (envKey: string, configValue: string | undefined) => {
    if (configValue) {
      if (isElectron || !process.env[envKey]) {
        process.env[envKey] = configValue;
      }
    }
  };

  setEnvIfConfigured('QBIT_URL', parsed.qbitUrl);
  setEnvIfConfigured('QBIT_USERNAME', parsed.qbitUsername);
  setEnvIfConfigured('QBIT_PASSWORD', parsed.qbitPassword);
  setEnvIfConfigured('GOOGLE_AI_API_KEY', parsed.googleAiApiKey || parsed.aiApiKey);
  setEnvIfConfigured('AI_API_KEY', parsed.aiApiKey);
  setEnvIfConfigured('OMDB_API_KEY', parsed.omdbApiKey);
  setEnvIfConfigured('TMDB_API_KEY', parsed.tmdbApiKey);
  setEnvIfConfigured('PROWLARR_URL', parsed.prowlarrUrl);
  setEnvIfConfigured('PROWLARR_API_KEY', parsed.prowlarrApiKey);
  setEnvIfConfigured('REAL_DEBRID_API_KEY', parsed.realDebridApiKey);

  return parsed;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Write config updates. Writes synchronously to disk so the next readConfig()
 * call always sees the updated values — no async queue needed here because
 * config writes are rare (setup wizard, settings page) and the file is tiny.
 *
 * Returns the merged config so callers can use it immediately.
 */
export function writeConfig(updates: Partial<AppConfig>): AppConfig {
  const current = readConfig();
  const next: AppConfig = { ...current, ...updates };

  // Auto-derive sub-directories using path.join for cross-platform correctness.
  // FIX (🟡 Phase 8): Previously used `next.downloadsDir || path.join(...)` which
  // meant changing mediaDir never updated downloadsDir if it had been set before —
  // downloads silently went to the old path. Now we always re-derive both dirs
  // when mediaDir is explicitly changed, so Settings → Media Folder works correctly.
  if (updates.mediaDir) {
    next.downloadsDir = path.join(updates.mediaDir, 'downloads');
    next.libraryDir   = path.join(updates.mediaDir, 'library');
  }

  // Auto-enable/disable Prowlarr built-in source based on credentials configuration
  if (updates.prowlarrApiKey !== undefined || updates.prowlarrUrl !== undefined) {
    const hasCreds = !!(next.prowlarrUrl && next.prowlarrApiKey);
    next.torrentSources = (next.torrentSources ?? DEFAULT_TORRENT_SOURCES).map(s =>
      s.type === 'prowlarr' ? { ...s, enabled: hasCreds } : s
    );
  }

  // Invalidate cache before writing so any concurrent readConfig() call that
  // races with the rename gets a fresh disk read rather than stale cached data.
  invalidateConfigCache();

  // Atomic write: write to a temp file then rename so a crash mid-write
  // never leaves a half-written (corrupted) config file.
  const tmp = CONFIG_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    console.error('[configStore] Write failed:', err);
    // Still return `next` — callers use the return value for immediate in-memory
    // state (e.g. responding to the setup wizard). The write failure is logged;
    // the next readConfig() will return stale data, which is the correct signal.
  }

  return next;
}

export function isSetupComplete(): boolean {
  // Only trust SETUP_COMPLETE env var in non-Electron environments (Docker/cloud).
  // In the packaged .exe the Electron main process strips this var before spawning
  // the server, so it will never be set. Checking it here anyway would let a
  // stale build-time env var bypass the wizard entirely.
  if (!process.env.ELECTRON && process.env.SETUP_COMPLETE === 'true') return true;
  return readConfig().setupComplete;
}

export function detectLocalProwlarrApiKey(): string | null {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push('C:\\ProgramData\\Prowlarr\\config.xml');
    candidates.push(path.join(os.homedir(), 'AppData', 'Local', 'Prowlarr', 'config.xml'));
    candidates.push(path.join(os.homedir(), 'AppData', 'Roaming', 'Prowlarr', 'config.xml'));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'Prowlarr', 'config.xml'));
    candidates.push('/var/lib/prowlarr/config.xml');
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const content = fs.readFileSync(c, 'utf8');
        const match = content.match(/<ApiKey>(.*?)<\/ApiKey>/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function autoConfigureProwlarrIndexers(prowlarrUrl: string, prowlarrApiKey: string): Promise<void> {
  if (!prowlarrUrl || !prowlarrApiKey) return;
  try {
    const listUrl = `${prowlarrUrl.replace(/\/$/, '')}/api/v1/indexer`;
    const getRes = await fetch(listUrl, {
      headers: { 'X-Api-Key': prowlarrApiKey }
    });
    if (!getRes.ok) return;
    const indexers = await getRes.json() as any[];
    if (indexers.length > 0) {
      console.log(`[prowlarr] Indexers already configured: ${indexers.length}`);
      return;
    }

    console.log('[prowlarr] No indexers configured. Seeding YTS, LimeTorrents, and The Pirate Bay...');
    const indexersToSeed = [
      { name: 'YTS', definitionFile: 'yts' },
      { name: 'LimeTorrents', definitionFile: 'limetorrents' },
      { name: 'The Pirate Bay', definitionFile: 'thepiratebay' }
    ];

    for (const item of indexersToSeed) {
      const body = {
        name: item.name,
        enable: true,
        protocol: 'torrent',
        implementation: 'Cardigann',
        configContract: 'CardigannSettings',
        appProfileId: 1,
        priority: 25,
        fields: [
          { name: 'definitionFile', value: item.definitionFile }
        ],
        tags: []
      };

      try {
        const postRes = await fetch(listUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': prowlarrApiKey
          },
          body: JSON.stringify(body)
        });
        console.log(`[prowlarr] Seeded indexer ${item.name}: status ${postRes.status}`);
      } catch (err: any) {
        console.error(`[prowlarr] Failed to seed indexer ${item.name}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[prowlarr] Auto-configuration failed:', err.message);
  }
}

export function detectAndSyncProwlarrApiKey(): void {
  try {
    const config = readConfig();
    const isLocal = !config.prowlarrUrl || config.prowlarrUrl.includes('localhost') || config.prowlarrUrl.includes('127.0.0.1');
    if (!isLocal) return;

    const detectedKey = detectLocalProwlarrApiKey();
    let apiKey = config.prowlarrApiKey;
    if (detectedKey && detectedKey !== config.prowlarrApiKey) {
      console.log(`[prowlarr] Auto-detected local Prowlarr API key: ${detectedKey.slice(0, 4)}...`);
      writeConfig({ prowlarrApiKey: detectedKey });
      apiKey = detectedKey;
    }

    if (config.prowlarrUrl && apiKey) {
      autoConfigureProwlarrIndexers(config.prowlarrUrl, apiKey).catch(err => {
        console.warn('[prowlarr] Background indexer auto-config failed:', err);
      });
    }
  } catch (err) {
    console.warn('[prowlarr] Auto-detection failed:', err);
  }
}
