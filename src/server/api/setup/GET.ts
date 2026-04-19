import type { Request, Response } from 'express';
import { readConfig, isSetupComplete } from '../../configStore.js';

/** Mask a key: show first 4 chars + dots, or empty string if not set */
function mask(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 4, 20));
}

export default function handler(_req: Request, res: Response) {
  const config = readConfig();
  // Never return passwords in GET; return masked API keys so the settings
  // panel can show "key is set" without exposing the full value.
  const response = {
    setupComplete: isSetupComplete(),
    mediaDir: config.mediaDir,
    downloadsDir: config.downloadsDir,
    libraryDir: config.libraryDir,
    qbitUrl: config.qbitUrl,
    qbitUsername: config.qbitUsername,
    jellyfinUrl: config.jellyfinUrl,
    jellyfinApiKey: config.jellyfinApiKey ? '••••••••' : '',
    watchFolderEnabled: config.watchFolderEnabled,
    autoTranscode: config.autoTranscode,
    preferredQuality: config.preferredQuality,
    hasAdminPassword: !!config.adminPassword,
    hasOmdbKey: !!config.omdbApiKey,
    hasGoogleAiKey: !!config.googleAiApiKey,
    // Nested config object for the Settings panel API Keys section
    config: {
      omdbApiKey: mask(config.omdbApiKey),
      googleAiApiKey: mask(config.googleAiApiKey),
      tmdbApiKey: mask(config.tmdbApiKey),
    },
  };
  res.json(response);
}
