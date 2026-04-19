import type { Request, Response } from 'express';
import { readConfig, isSetupComplete } from '../../configStore.js';

export default function handler(_req: Request, res: Response) {
  const config = readConfig();
  // Never return passwords in GET
  res.json({
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
  });
}
