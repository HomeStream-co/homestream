/**
 * POST /api/backup/restore
 *
 * Restores a HomeStream backup from a previously exported JSON file.
 *
 * Body: { backup: BackupPayload, options: RestoreOptions }
 *
 * RestoreOptions:
 *   restoreLibrary  — overwrite media-library.json (default true)
 *   restoreProfiles — overwrite homestream-profiles.json (default true)
 *   restoreConfig   — overwrite non-sensitive config fields (default false)
 *                     (never restores passwords/keys — those must be re-entered)
 *
 * Requires auth.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import { writeLibraryDirect } from '../../libraryStore.js';
import { requireAuth } from '../../authMiddleware.js';
import { dataPath } from '../../dataDir.js';

// Use dataPath() so paths are correct in all environments:
//   Cloud/Linux: /private/homestream-*.json
//   Windows .exe: %APPDATA%\HomeStream\homestream-*.json
const CONFIG_PATH   = dataPath('homestream-config.json');
const PROFILES_PATH = dataPath('homestream-profiles.json');

// Fields that are NEVER restored from backup (must be re-entered by user)
const REDACTED_CONFIG_FIELDS = new Set([
  'adminPassword', 'qbitPassword', 'omdbApiKey',
  'googleAiApiKey', 'tmdbApiKey', 'jellyfinApiKey',
]);

interface RestoreOptions {
  restoreLibrary?: boolean;
  restoreProfiles?: boolean;
  restoreConfig?: boolean;
}

interface BackupPayload {
  version?: number;
  library?: unknown[];
  config?: Record<string, unknown>;
  profiles?: unknown[];
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const { backup, options = {} } = req.body as { backup?: BackupPayload; options?: RestoreOptions };

    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Invalid backup payload' });
    }
    if (backup.version !== 1) {
      return res.status(400).json({ error: 'Unsupported backup version' });
    }

    const {
      restoreLibrary  = true,
      restoreProfiles = true,
      restoreConfig   = false,
    } = options;

    const results: string[] = [];

    // ── Restore library ──
    if (restoreLibrary && Array.isArray(backup.library)) {
      await writeLibraryDirect(backup.library as Record<string, unknown>[]);
      results.push(`Library restored (${backup.library.length} items)`);
    }

    // ── Restore profiles (skip redacted PINs) ──
    if (restoreProfiles && Array.isArray(backup.profiles)) {
      const cleaned = (backup.profiles as Record<string, unknown>[]).map(p => {
        const copy = { ...p };
        // Never restore redacted PINs — leave hasPin: false so user re-sets them
        if (copy.pin === '[REDACTED]') {
          delete copy.pin;
          copy.hasPin = false;
        }
        return copy;
      });
      fs.writeFileSync(PROFILES_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
      results.push(`Profiles restored (${cleaned.length} profiles, PINs cleared — please re-set)`);
    }

    // ── Restore config (non-sensitive fields only) ──
    if (restoreConfig && backup.config && typeof backup.config === 'object') {
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
      } catch { /* start fresh */ }

      const merged = { ...existing };
      for (const [key, val] of Object.entries(backup.config)) {
        if (!REDACTED_CONFIG_FIELDS.has(key) && val !== '[REDACTED]') {
          merged[key] = val;
        }
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
      results.push('Config restored (sensitive keys skipped — please re-enter API keys)');
    }

    res.json({ ok: true, restored: results });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed', message: String(err) });
  }
}
