import fs from 'fs';
import path from 'path';
import { dataPath } from './dataDir.js';

const CONFIG_PATH = dataPath('homestream-config.json');

export interface AppConfig {
  // Media
  mediaDir?: string;
  // TMDB
  tmdbApiKey?: string;
  // Transcode
  transcodePreset?: 'fast' | 'balanced' | 'quality';
  // qBittorrent
  qbitUrl?: string;
  qbitUsername?: string;
  qbitPassword?: string;
  // VPN
  vpnKillSwitch?: boolean;
  vpnInterface?: string;
  // Download quality
  preferredQuality?: string;
  // Prowlarr
  prowlarrUrl?: string;
  prowlarrApiKey?: string;
  // Misc
  [key: string]: unknown;
}

let _cache: AppConfig | null = null;

export function readConfig(): AppConfig {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as AppConfig;
    return _cache;
  } catch {
    return {};
  }
}

export function writeConfig(config: AppConfig): void {
  _cache = config;
  const tmp = CONFIG_PATH + '.tmp';
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readConfig();
  const next = { ...current, ...patch };
  writeConfig(next);
  return next;
}
