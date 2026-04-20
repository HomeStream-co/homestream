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
import fs from 'fs';
import path from 'path';

const LIBRARY_PATH  = path.resolve('./media-library.json');
const CONFIG_PATH   = path.resolve('./homestream-config.json');
const PROFILES_PATH = path.resolve('./homestream-profiles.json');

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function handler(_req: Request, res: Response) {
  try {
    const library  = safeReadJson<unknown[]>(LIBRARY_PATH, []);
    const config   = safeReadJson<Record<string, unknown>>(CONFIG_PATH, {});
    const profiles = safeReadJson<unknown[]>(PROFILES_PATH, []);

    // Redact sensitive fields from config
    const safeConfig = { ...config };
    for (const key of ['adminPassword', 'qbitPassword', 'omdbApiKey', 'googleAiApiKey', 'tmdbApiKey', 'jellyfinApiKey']) {
      if (safeConfig[key]) safeConfig[key] = '[REDACTED]';
    }

    // Redact PIN hashes from profiles
    const safeProfiles = (profiles as Record<string, unknown>[]).map(p => {
      const copy = { ...p };
      if (copy.pin) copy.pin = '[REDACTED]';
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
