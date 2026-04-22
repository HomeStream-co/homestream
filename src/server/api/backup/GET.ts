/**
 * GET /api/backup
 *
 * Exports a full HomeStream backup as a single JSON file containing:
 *   - media library (media-library.json)
 *   - app config (homestream-config.json) — passwords/keys redacted
 *   - profiles (homestream-profiles.json) — PINs redacted
 *
 * The file is streamed as a download attachment.
 * Requires auth (handled by authMiddleware on all /api routes).
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';
import { readLibrary } from '../../libraryStore.js';
import { readConfig } from '../../configStore.js';
import { readProfiles } from '../../profilesStore.js';

export default function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const library  = readLibrary<unknown>();
    const config   = readConfig() as unknown as Record<string, unknown>;
    const profiles = readProfiles() as unknown as Record<string, unknown>[];

    // Redact sensitive fields from config
    const safeConfig = { ...config };
    for (const key of ['adminPassword', 'qbitPassword', 'omdbApiKey', 'googleAiApiKey', 'tmdbApiKey', 'jellyfinApiKey']) {
      if (safeConfig[key]) safeConfig[key] = '[REDACTED]';
    }

    // Redact PIN hashes from profiles
    const safeProfiles = profiles.map(p => {
      const copy = { ...p };
      if (copy.pin) copy.pin = '[REDACTED]';
      if (copy.pinHash) copy.pinHash = '[REDACTED]';
      return copy;
    });

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      library,
      config: safeConfig,
      profiles: safeProfiles,
    };

    const filename = `homestream-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: 'Backup failed', message: String(err) });
  }
}
