import type { Request, Response } from 'express';
import fs from 'fs';
import { writeConfig, readConfig } from '../../configStore.js';
import { testConnection as testQbit } from '../../qbittorrentClient.js';
import { startWatcher, stopWatcher } from '../../folderWatcher.js';

/**
 * POST /api/setup
 *
 * Handles all setup wizard steps:
 *   action: 'save'         — save config fields
 *   action: 'test_qbit'    — test qBittorrent connection
 *   action: 'test_jellyfin'— test Jellyfin connection
 *   action: 'complete'     — mark setup as done, start services
 *   action: 'reset'        — reset setup (dev/recovery)
 */

async function testJellyfin(url: string, apiKey: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!url) return { ok: false, error: 'No Jellyfin URL configured' };
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Emby-Token'] = apiKey;
    const res = await fetch(`${url}/System/Info/Public`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { Version?: string; ServerName?: string };
    return { ok: true, version: data.Version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function handler(req: Request, res: Response) {
  const { action, ...fields } = req.body as Record<string, string>;

  try {
    switch (action) {

      case 'save': {
        // Save any config fields passed in the body
        const allowed = [
          'mediaDir', 'qbitUrl', 'qbitUsername', 'qbitPassword',
          'jellyfinUrl', 'jellyfinApiKey', 'adminPassword',
          'omdbApiKey', 'googleAiApiKey', 'preferredQuality',
          'watchFolderEnabled', 'autoTranscode',
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        // Boolean coercion
        if (fields.watchFolderEnabled !== undefined) updates.watchFolderEnabled = fields.watchFolderEnabled === 'true';
        if (fields.autoTranscode !== undefined) updates.autoTranscode = fields.autoTranscode === 'true';

        // Create media directories if mediaDir provided
        if (fields.mediaDir) {
          const dirs = [
            fields.mediaDir,
            `${fields.mediaDir}/downloads`,
            `${fields.mediaDir}/library`,
            `${fields.mediaDir}/library/movies`,
            `${fields.mediaDir}/library/tv`,
          ];
          for (const dir of dirs) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
          }
          updates.downloadsDir = `${fields.mediaDir}/downloads`;
          updates.libraryDir = `${fields.mediaDir}/library`;
        }

        const config = writeConfig(updates);
        res.json({ ok: true, config });
        break;
      }

      case 'test_qbit': {
        // Temporarily apply credentials from request for testing
        if (fields.qbitUrl) process.env.QBIT_URL = fields.qbitUrl;
        if (fields.qbitUsername) process.env.QBIT_USERNAME = fields.qbitUsername;
        if (fields.qbitPassword) process.env.QBIT_PASSWORD = fields.qbitPassword;
        const result = await testQbit();
        res.json(result);
        break;
      }

      case 'test_jellyfin': {
        const config = readConfig();
        const url = fields.jellyfinUrl || config.jellyfinUrl;
        const apiKey = fields.jellyfinApiKey || config.jellyfinApiKey;
        const result = await testJellyfin(url, apiKey);
        res.json(result);
        break;
      }

      case 'complete': {
        const config = writeConfig({
          setupComplete: true,
          setupCompletedAt: new Date().toISOString(),
        });

        // Start folder watcher if enabled
        if (config.watchFolderEnabled && config.downloadsDir) {
          stopWatcher();
          startWatcher(config.downloadsDir);
        }

        res.json({ ok: true, message: 'Setup complete! HomeStream is ready.' });
        break;
      }

      case 'reset': {
        writeConfig({ setupComplete: false });
        stopWatcher();
        res.json({ ok: true, message: 'Setup reset' });
        break;
      }

      default:
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    res.status(500).json({ error: 'Setup action failed', message: String(err) });
  }
}
