import type { Request, Response } from 'express';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { writeConfig, readConfig } from '../../configStore.js';
import { testConnection as testQbit } from '../../qbittorrentClient.js';
import { startWatcher, stopWatcher } from '../../folderWatcher.js';
import { scanExistingMedia, importExistingMedia, type ScannedFile } from '../../existingMediaScanner.js';

// In-memory store for scan results so import can reference them
let lastScanFiles: ScannedFile[] = [];

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
          'omdbApiKey', 'googleAiApiKey', 'tmdbApiKey', 'virusTotalApiKey',
          'aiProvider', 'ollamaUrl', 'ollamaModel',
          'preferredQuality', 'watchFolderEnabled', 'autoTranscode',
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        // Hash admin password with bcrypt before saving
        if (fields.adminPassword) {
          updates.adminPassword = await bcrypt.hash(fields.adminPassword, 12);
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

      case 'scan_existing': {
        // Scan mediaDir for video files not yet in the library
        const config = readConfig();
        const scanDir = fields.mediaDir || config.mediaDir;
        if (!scanDir) {
          res.status(400).json({ error: 'No media directory configured' });
          return;
        }
        const result = scanExistingMedia(scanDir);
        lastScanFiles = result.files;
        // Return file list with sizes for display (cap at 200 for response size)
        res.json({
          found: result.found,
          skipped: result.skipped,
          files: result.files.slice(0, 200).map(f => ({
            name: f.name,
            size: f.size,
            path: f.path,
          })),
          truncated: result.files.length > 200,
        });
        break;
      }

      case 'import_existing': {
        // Import previously scanned files into the library
        // Uses SSE-style chunked response for progress
        const filesToImport = lastScanFiles;
        if (filesToImport.length === 0) {
          res.json({ imported: 0, failed: 0, titles: [] });
          return;
        }

        // Run import in background, return immediately
        res.json({ ok: true, total: filesToImport.length, message: 'Import started' });

        // Fire and forget — progress tracked server-side
        importExistingMedia(filesToImport, (done, total, title) => {
          console.log(`[scanner] Imported ${done}/${total}: ${title}`);
        }).then(result => {
          console.log(`[scanner] Import complete: ${result.imported} imported, ${result.failed} failed`);
          lastScanFiles = [];
        }).catch(err => {
          console.error('[scanner] Import error:', err);
        });
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
