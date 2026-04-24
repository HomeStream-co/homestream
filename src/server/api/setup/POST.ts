import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { writeConfig, readConfig, isSetupComplete } from '../../configStore.js';
import { testConnection as testQbit } from '../../qbittorrentClient.js';
import { startWatcher, stopWatcher } from '../../folderWatcher.js';
import { scanExistingMedia, importExistingMedia, type ScannedFile } from '../../existingMediaScanner.js';
import { requireAuth } from '../../authMiddleware.js';
import { isDeveloperLocked } from '../../ownershipSeed.js';

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

  // Allow unauthenticated access only before setup is complete.
  // After setup, require auth to prevent config takeover.
  if (isSetupComplete() && !requireAuth(req, res)) return;

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
          // VPN fields
          'vpnEnabled', 'vpnProtocol', 'vpnProvider',
          'vpnConfigContent', 'vpnUsername', 'vpnPassword', 'vpnAutoConnect',
          // Prowlarr
          'prowlarrUrl', 'prowlarrApiKey',
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        // Hash admin password with bcrypt before saving.
        // DEVELOPER_LOCK: if the developer has locked ownership via the
        // DEVELOPER_LOCK=true env var, refuse to overwrite the seeded password.
        // This prevents any end-user from locking the developer out of their app.
        if (fields.adminPassword) {
          if (isDeveloperLocked()) {
            res.status(403).json({
              error: 'Admin password is locked by the developer and cannot be changed via the setup wizard.',
            });
            return;
          }
          updates.adminPassword = await bcrypt.hash(fields.adminPassword, 12);
        }
        // Boolean coercion
        if (fields.watchFolderEnabled !== undefined) updates.watchFolderEnabled = fields.watchFolderEnabled === 'true';
        if (fields.autoTranscode !== undefined) updates.autoTranscode = fields.autoTranscode === 'true';
        if (fields.vpnEnabled !== undefined) updates.vpnEnabled = fields.vpnEnabled === 'true';
        if (fields.vpnAutoConnect !== undefined) updates.vpnAutoConnect = fields.vpnAutoConnect === 'true';

        // Create media directories if mediaDir provided
        if (fields.mediaDir) {
          // Normalise path separators — users may type either / or \ on Windows
          const mediaDir = fields.mediaDir.replace(/\\/g, path.sep).replace(/\//g, path.sep);
          const downloadsDir = path.join(mediaDir, 'downloads');
          const libraryDir   = path.join(mediaDir, 'library');
          const dirs = [
            mediaDir,
            downloadsDir,
            libraryDir,
            path.join(libraryDir, 'movies'),
            path.join(libraryDir, 'tv'),
          ];
          for (const dir of dirs) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
          }
          updates.mediaDir     = mediaDir;
          updates.downloadsDir = downloadsDir;
          updates.libraryDir   = libraryDir;
        }

        // Stamp save timestamps for API keys so the Settings panel can show
        // a lifespan countdown and regeneration reminder.
        const now = new Date().toISOString();
        if (fields.omdbApiKey)     updates.omdbApiKeySavedAt     = now;
        if (fields.googleAiApiKey) updates.googleAiApiKeySavedAt = now;
        if (fields.tmdbApiKey)     updates.tmdbApiKeySavedAt     = now;

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

      case 'test_prowlarr': {
        const config = readConfig();
        const prowlarrUrl    = (fields.prowlarrUrl    || config.prowlarrUrl    || '').trim();
        const prowlarrApiKey = (fields.prowlarrApiKey || config.prowlarrApiKey || '').trim();
        if (!prowlarrUrl) {
          res.json({ ok: false, error: 'No Prowlarr URL provided' });
          return;
        }
        try {
          const base = prowlarrUrl.replace(/\/$/, '');
          const headers = { 'X-Api-Key': prowlarrApiKey, 'User-Agent': 'HomeStream/1.5' };
          const signal = AbortSignal.timeout(8_000);

          // Fetch status first (sequential so URL capture in tests is deterministic)
          let statusResp: globalThis.Response;
          try {
            statusResp = await fetch(`${base}/api/v1/system/status`, { headers, signal });
          } catch (err) {
            res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
            return;
          }

          if (!statusResp.ok) {
            res.json({ ok: false, error: `HTTP ${statusResp.status}` });
            return;
          }

          const statusData = await statusResp.json() as { version?: string; appName?: string };

          // Fetch indexer count separately (best-effort)
          let indexers: number | undefined;
          try {
            const indexerResp = await fetch(`${base}/api/v1/indexer`, { headers, signal });
            if (indexerResp.ok) {
              const arr = await indexerResp.json() as unknown[];
              indexers = Array.isArray(arr) ? arr.length : undefined;
            }
          } catch { /* ignore — indexer count is optional */ }

          res.json({
            ok: true,
            version: statusData.version ?? 'unknown',
            appName: statusData.appName,
            indexers,
          });
        } catch (err) {
          res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
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
