import type { Request, Response } from 'express';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { readConfig, isSetupComplete } from '../../configStore.js';
import { requireAuth } from '../../authMiddleware.js';

/** Mask a key: show first 4 chars + dots, or empty string if not set */
function mask(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 4, 20));
}

/** Detect FFmpeg availability — same resolution logic as hlsTranscoder */
function resolveFfmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) return p;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

async function detectFfmpeg(): Promise<{ available: boolean; version: string; path: string }> {
  const bin = resolveFfmpegBin();
  return new Promise(resolve => {
    const proc = spawn(bin, ['-version'], { stdio: 'pipe' });
    let output = '';
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ available: false, version: '', path: bin });
    }, 4000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const m = output.match(/ffmpeg version ([^\s]+)/i);
        resolve({ available: true, version: m ? m[1] : 'unknown', path: bin });
      } else {
        resolve({ available: false, version: '', path: bin });
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ available: false, version: '', path: bin });
    });
  });
}

export default async function handler(req: Request, res: Response) {
  // Allow unauthenticated access only before setup is complete (wizard needs it).
  // Once setup is done, require auth so config details aren't publicly readable.
  if (isSetupComplete() && !requireAuth(req, res)) return;

  const config = readConfig();
  const ffmpeg = await detectFfmpeg();

  // Never return passwords in GET; return masked API keys so the settings
  // panel can show "key is set" without exposing the full value.
  const response = {
    setupComplete: isSetupComplete(),
    mediaDir: config.mediaDir,
    downloadsDir: config.downloadsDir,
    libraryDir: config.libraryDir,
    qbitUrl: config.qbitUrl,
    qbitUsername: config.qbitUsername,
    hasQbitPassword: !!config.qbitPassword,
    hasQbitApiKey: !!config.qbitApiKey,
    jellyfinUrl: config.jellyfinUrl,
    jellyfinApiKey: config.jellyfinApiKey ? '••••••••' : '',
    watchFolderEnabled: config.watchFolderEnabled,
    autoTranscode: config.autoTranscode,
    preferredQuality: config.preferredQuality,
    hasAdminPassword: !!config.adminPassword,
    hasOmdbKey: !!config.omdbApiKey,
    hasGoogleAiKey: !!config.googleAiApiKey,
    // VPN binding — returned so the Settings panel can show the current bound interface
    vpnInterface: config.vpnInterface ?? null,
    vpnKillSwitch: config.vpnKillSwitch ?? false,
    hasRealDebridKey: !!config.realDebridApiKey,
    // FFmpeg availability — shown in setup wizard and settings
    ffmpeg,
    // Nested config object for the Settings panel API Keys section
    config: {
      omdbApiKey: mask(config.omdbApiKey),
      googleAiApiKey: mask(config.googleAiApiKey),
      tmdbApiKey: mask(config.tmdbApiKey),
      virusTotalApiKey: mask(config.virusTotalApiKey),
      realDebridApiKey: mask(config.realDebridApiKey),
      prowlarrUrl: config.prowlarrUrl ?? '',
      hasProwlarrKey: !!config.prowlarrApiKey,
      // Timestamps for lifespan countdown in Settings
      omdbApiKeySavedAt:     config.omdbApiKeySavedAt     ?? null,
      googleAiApiKeySavedAt: config.googleAiApiKeySavedAt ?? null,
      tmdbApiKeySavedAt:     config.tmdbApiKeySavedAt     ?? null,
    },
  };
  res.json(response);
}
