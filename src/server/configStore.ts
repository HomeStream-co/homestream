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

import { dataPath } from './dataDir.js';
const CONFIG_PATH = dataPath('homestream-config.json');

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
  // AI provider selection
  aiProvider: 'gemini' | 'ollama';
  ollamaUrl: string;          // e.g. http://localhost:11434
  ollamaModel: string;        // e.g. llama3, mistral, phi3
  watchFolderEnabled: boolean;
  autoTranscode: boolean;
  preferredQuality: '720p' | '1080p' | '4k' | 'best';
  virusTotalApiKey: string;   // optional — activates Layer 2 hash lookup
  setupCompletedAt?: string;
  // VPN interface binding — torrent traffic is locked to this adapter
  vpnInterface?: string;      // e.g. "Norton Secure VPN" — Windows adapter name
  vpnKillSwitch?: boolean;    // pause downloads if vpnInterface goes down
  // Storage organisation — percentage of total disk allocated per category (0–100, must sum ≤ 100)
  storageMoviesPct: number;   // e.g. 60 → 60% of disk reserved for movies
  storageTvPct: number;       // e.g. 30 → 30% of disk reserved for TV shows
  // storageOtherPct is implied: 100 - movies - tv
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
  omdbApiKey: process.env.OMDB_API_KEY || '',
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
  tmdbApiKey: process.env.TMDB_API_KEY || '',
  aiProvider: 'gemini',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
  watchFolderEnabled: true,
  autoTranscode: true,
  preferredQuality: '1080p',
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY || '',
  storageMoviesPct: 60,
  storageTvPct: 30,
};

// ── Read (always immediate) ───────────────────────────────────────────────────

export function readConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
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

  // Auto-derive sub-directories using path.join for cross-platform correctness
  if (updates.mediaDir) {
    next.downloadsDir = next.downloadsDir || path.join(updates.mediaDir, 'downloads');
    next.libraryDir = next.libraryDir || path.join(updates.mediaDir, 'library');
  }

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
