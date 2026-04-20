/**
 * configStore — persistent app configuration
 *
 * Stores setup wizard results in homestream-config.json.
 * All values are optional — the app works without any of them,
 * but the setup wizard guides users through the ideal configuration.
 */

import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve('./homestream-config.json');

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
  // Storage organisation — percentage of total disk allocated per category (0–100, must sum ≤ 100)
  storageMoviesPct: number;   // e.g. 60 → 60% of disk reserved for movies
  storageTvPct: number;       // e.g. 30 → 30% of disk reserved for TV shows
  // storageOtherPct is implied: 100 - movies - tv
}

const DEFAULTS: AppConfig = {
  setupComplete: false,
  mediaDir: process.env.MEDIA_DIR || '/media',
  downloadsDir: '',
  libraryDir: '',
  qbitUrl: process.env.QBIT_URL || 'http://localhost:8080',
  qbitUsername: process.env.QBIT_USERNAME || 'admin',
  qbitPassword: process.env.QBIT_PASSWORD || 'homestream',
  jellyfinUrl: process.env.JELLYFIN_URL || 'http://localhost:8096',
  jellyfinApiKey: process.env.JELLYFIN_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
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

export function readConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(updates: Partial<AppConfig>): AppConfig {
  const current = readConfig();
  const next: AppConfig = { ...current, ...updates };

  // Auto-derive sub-directories
  if (updates.mediaDir) {
    next.downloadsDir = next.downloadsDir || `${updates.mediaDir}/downloads`;
    next.libraryDir = next.libraryDir || `${updates.mediaDir}/library`;
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

export function isSetupComplete(): boolean {
  // Check env var first (Docker Compose sets this)
  if (process.env.SETUP_COMPLETE === 'true') return true;
  return readConfig().setupComplete;
}
