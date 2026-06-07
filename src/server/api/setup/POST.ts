import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Expand a leading ~ to the real home directory (Linux/macOS). */
function expandTilde(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}
import bcrypt from 'bcryptjs';
import { writeConfig, readConfig, isSetupComplete } from '../../configStore.js';
import { testConnection as testQbit } from '../../qbittorrentClient.js';
import { startWatcher, stopWatcher } from '../../folderWatcher.js';
import { scanExistingMedia, importExistingMedia, type ScannedFile } from '../../existingMediaScanner.js';
import { requireAuth } from '../../authMiddleware.js';
import { isDeveloperLocked } from '../../ownershipSeed.js';
import { getUser as getRDUser } from '../../realDebridClient.js';

// In-memory store for scan results so import can reference them.
// Also persisted to disk so import_existing survives a server restart
// between the scan and the import (e.g. watchdog restart on slow machines).
let lastScanFiles: ScannedFile[] = [];

function getScanCachePath(): string {
  const dataDir = process.env.HOMESTREAM_DATA ?? process.env.HOME ?? os.homedir();
  return path.join(dataDir, '.homestream-scan-cache.json');
}

function persistScanCache(files: ScannedFile[]): void {
  try {
    fs.writeFileSync(getScanCachePath(), JSON.stringify(files), 'utf-8');
  } catch { /* non-fatal */ }
}

function loadScanCache(): ScannedFile[] {
  try {
    const raw = fs.readFileSync(getScanCachePath(), 'utf-8');
    return JSON.parse(raw) as ScannedFile[];
  } catch {
    return [];
  }
}

function clearScanCache(): void {
  try { fs.unlinkSync(getScanCachePath()); } catch { /* already gone */ }
}

/** Ensure a URL has a protocol prefix. Defaults to http:// if missing. */
function normalizeUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
  return `http://${trimmed}`.replace(/\/$/, '');
}


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
          'aiApiKey', 'openaiApiKey', 'anthropicApiKey',
          'aiProvider', 'ollamaUrl', 'ollamaModel', 'openaiModel', 'anthropicModel',
          'preferredQuality', 'watchFolderEnabled', 'autoTranscode',
          'transcodePreset',
          // VPN fields
          'vpnEnabled', 'vpnProtocol', 'vpnProvider',
          'vpnConfigContent', 'vpnUsername', 'vpnPassword', 'vpnAutoConnect',
          // Prowlarr
          'prowlarrUrl', 'prowlarrApiKey',
          // Real-Debrid
          'realDebridApiKey',
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        // Normalise URL fields — add http:// if user typed bare host:port
        if (updates.qbitUrl)     updates.qbitUrl     = normalizeUrl(updates.qbitUrl as string);
        if (updates.prowlarrUrl) updates.prowlarrUrl = normalizeUrl(updates.prowlarrUrl as string);
        if (updates.jellyfinUrl) updates.jellyfinUrl = normalizeUrl(updates.jellyfinUrl as string);
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
          // Expand tilde then normalise: on Windows convert / to \, on Linux/macOS convert \ to /
          let mediaDir = expandTilde(fields.mediaDir.trim());
          if (process.platform === 'win32') {
            mediaDir = mediaDir.replace(/\//g, '\\');
          } else {
            mediaDir = mediaDir.replace(/\\/g, '/');
          }
          // Remove any duplicate separators but preserve leading slash on Linux/macOS
          mediaDir = mediaDir.replace(/([^:])[/\\]{2,}/g, '$1' + path.sep);

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
            try {
              fs.mkdirSync(dir, { recursive: true });
            } catch (mkdirErr) {
              // Surface permission errors immediately so the user sees them in the wizard
              const e = mkdirErr as NodeJS.ErrnoException;
              if (e.code === 'EACCES' || e.code === 'EPERM') {
                res.status(400).json({
                  error: `Permission denied creating folder: ${dir}. Please choose a folder you have write access to.`,
                });
                return;
              }
              // Other errors (ENOTDIR etc.) — surface them too
              if (e.code !== 'EEXIST') {
                res.status(400).json({
                  error: `Could not create folder: ${dir}. ${e.message}`,
                });
                return;
              }
            }
          }
          // Verify the root dir actually exists before saving to config
          if (!fs.existsSync(mediaDir)) {
            res.status(400).json({
              error: `Folder could not be created at: ${mediaDir}. Please check the path and try again.`,
            });
            return;
          }
          updates.mediaDir     = mediaDir;
          updates.downloadsDir = downloadsDir;
          updates.libraryDir   = libraryDir;
        }

        // Stamp save timestamps for API keys so the Settings panel can show
        // a lifespan countdown and regeneration reminder.
        const now = new Date().toISOString();
        if (fields.omdbApiKey)       updates.omdbApiKeySavedAt       = now;
        if (fields.googleAiApiKey)   updates.googleAiApiKeySavedAt   = now;
        if (fields.tmdbApiKey)       updates.tmdbApiKeySavedAt       = now;
        if (fields.realDebridApiKey) {
          updates.realDebridApiKeySavedAt = now;
          // Bust the cached premium expiry — it belongs to the old key.
          // The next call to /api/real-debrid/status will re-fetch live.
          updates.realDebridPremiumExpiry    = undefined;
          updates.realDebridPremiumCheckedAt = undefined;
        }

        const config = writeConfig(updates);
        res.json({ ok: true, config });
        break;
      }

      case 'test_qbit': {
        const result = await testQbit({
          url:      normalizeUrl(fields.qbitUrl)      || undefined,
          username: fields.qbitUsername || undefined,
          password: fields.qbitPassword || undefined,
        });
        if (result.ok) {
          if (fields.qbitUrl)      process.env.QBIT_URL      = normalizeUrl(fields.qbitUrl);
          if (fields.qbitUsername) process.env.QBIT_USERNAME = fields.qbitUsername;
          if (fields.qbitPassword) process.env.QBIT_PASSWORD = fields.qbitPassword;
        }
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

      case 'test_real_debrid': {
        const cfg = readConfig();
        const key = (fields.realDebridApiKey || cfg.realDebridApiKey || '').trim();
        if (!key) {
          res.json({ ok: false, error: 'No Real-Debrid API key provided' });
          return;
        }
        try {
          const user = await getRDUser(key);
          res.json({ ok: true, user });
        } catch (err) {
          res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }

      case 'test_prowlarr': {
        const config = readConfig();
        const prowlarrUrl    = normalizeUrl((fields.prowlarrUrl    || config.prowlarrUrl    || '').trim());
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
        const scanDir = expandTilde(fields.mediaDir || config.mediaDir);
        if (!scanDir) {
          res.status(400).json({ error: 'No media directory configured' });
          return;
        }
        const result = scanExistingMedia(scanDir);
        lastScanFiles = result.files;
        persistScanCache(result.files); // survive server restart between scan and import
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
        // Import previously scanned files into the library.
        // Fall back to the disk cache if the in-memory list was lost (server restart).
        const filesToImport = lastScanFiles.length > 0 ? lastScanFiles : loadScanCache();
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
          clearScanCache();
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
