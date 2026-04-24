/**
 * GET /api/dev/diagnostics
 *
 * Full system snapshot for AI-assisted debugging.
 * Returns everything needed to diagnose issues without SSH access.
 *
 * Requires admin auth.
 *
 * Response includes:
 * - App version, uptime, environment
 * - Config state (keys masked, no plaintext secrets)
 * - Library stats (item count, transcoding queue)
 * - Recent errors (last 20)
 * - System info (platform, memory, node version)
 * - Developer lock state
 *
 * Usage:
 *   1. Log in to HomeStream
 *   2. Hit: https://your-server/api/dev/diagnostics
 *   3. Copy the JSON → paste into chat
 *   4. AI has everything needed to diagnose and fix
 */
import type { Request, Response } from 'express';
import os from 'os';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig, isSetupComplete } from '../../../configStore.js';
import { readLibrary } from '../../../libraryStore.js';
import { getCrashLog } from '../../../crashLogger.js';
import { isDeveloperLocked } from '../../../ownershipSeed.js';

const START_TIME = Date.now();

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const cfg = readConfig();
  const library = readLibrary();
  const recentErrors = getCrashLog().slice(-20);

  // Mask sensitive values — never return plaintext secrets
  const configSnapshot = {
    hasAdminPassword: !!cfg.adminPassword,
    hasTmdbKey: !!cfg.tmdbApiKey,
    hasGoogleAiKey: !!cfg.googleAiApiKey,
    hasOmdbKey: !!cfg.omdbApiKey,
    hasVirusTotalKey: !!cfg.virusTotalApiKey,
    mediaDir: cfg.mediaDir || null,
    setupComplete: isSetupComplete(),
    watchFolderEnabled: cfg.watchFolderEnabled ?? false,
    autoTranscode: cfg.autoTranscode ?? false,
    aiProvider: cfg.aiProvider || 'google',
    preferredQuality: cfg.preferredQuality || '1080p',
    jellyfinUrl: cfg.jellyfinUrl ? cfg.jellyfinUrl.replace(/\/\/.*@/, '//***@') : null,
    qbitUrl: cfg.qbitUrl || null,
    vpnEnabled: (cfg as unknown as Record<string, unknown>).vpnEnabled ?? false,
  };

  // Library stats
  type LibItem = { type?: string; transcoding?: boolean; watchProgress?: number };
  const items = Object.values(library) as LibItem[];
  const libraryStats = {
    total: items.length,
    movies: items.filter(i => i.type === 'movie').length,
    shows: items.filter(i => i.type === 'series').length,
    transcoding: items.filter(i => i.transcoding).length,
    withProgress: items.filter(i => (i.watchProgress ?? 0) > 0).length,
  };

  // System info
  const memUsage = process.memoryUsage();
  const systemInfo = {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    processUptimeSeconds: Math.floor(process.uptime()),
    memoryMB: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    freeMemMB: Math.round(os.freemem() / 1024 / 1024),
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    cpuCount: os.cpus().length,
    hostname: os.hostname(),
    isElectron: !!process.env.ELECTRON_RUN_AS_NODE || !!process.versions.electron,
  };

  res.json({
    app: 'HomeStream',
    version: process.env.npm_package_version || 'unknown',
    timestamp: new Date().toISOString(),
    developerLocked: isDeveloperLocked(),
    config: configSnapshot,
    library: libraryStats,
    recentErrors,
    system: systemInfo,
    // Hint for AI: paste this entire response into chat for diagnostics
    _hint: 'Paste this JSON into your AI chat session for instant diagnostics.',
  });
}
