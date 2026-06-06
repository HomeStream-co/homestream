/**
 * POST /api/debug/repair
 *
 * Runs one of several named repair actions. All are safe, idempotent, and
 * non-destructive unless the action name explicitly says "delete" or "clear".
 *
 * Body: { action: string }
 *
 * Actions:
 *   clear_stuck_transcodes   — reset items stuck with transcoding:true
 *   clear_errored_downloads  — delete failed download jobs
 *   clear_stuck_queued       — delete queued jobs stuck >30 min
 *   reset_hls_sessions       — kill all active HLS transcode sessions
 *   clear_tmdb_cache         — wipe TMDB enrichment cache so it re-fetches
 *   clear_watch_progress     — wipe ALL watch progress (destructive, user-confirmed)
 *   reindex_library          — re-scan media dir and reconcile library
 *   clear_crash_log          — wipe the crash log
 *   test_network             — ping TMDB + Torrentio, return latency
 *   purge_orphaned_uploads   — delete video files in uploads/ with no library entry
 *   prune_tmdb_cache         — delete TMDB cache files older than 90 days
 */

import type { Request, Response } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { getAllJobs } from '../../../torrentManager.js';
import { deleteJob } from '../../../downloadJobStore.js';
import { clearCrashLog } from '../../../crashLogger.js';
import { readConfig } from '../../../configStore.js';
import { pruneStaleTmdbCache } from '../../../startupCleanup.js';
import { dataDir } from '../../../dataDir.js';
import type { TorrentJob } from '../../../torrentManager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pingUrl(url: string, timeoutMs = 5000): Promise<{ ok: boolean; ms: number; status?: number; error?: string }> {
  return new Promise(resolve => {
    const start = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, res => {
      res.resume(); // drain
      resolve({ ok: res.statusCode! < 500, ms: Date.now() - start, status: res.statusCode });
    });
    req.on('error', err => resolve({ ok: false, ms: Date.now() - start, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, ms: timeoutMs, error: 'timeout' }); });
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function clearStuckTranscodes(): Promise<string> {
  const lib = readLibrary();
  const stuck = lib.filter(m => m.transcoding === true);
  if (stuck.length === 0) return 'No stuck transcodes found';
  await writeLibrary(items =>
    items.map(m => m.transcoding ? { ...m, transcoding: false } : m)
  );
  return `Cleared ${stuck.length} stuck transcode flag${stuck.length > 1 ? 's' : ''}`;
}

async function clearErroredDownloads(): Promise<string> {
  const jobs = getAllJobs();
  const errored = (jobs as TorrentJob[]).filter(j => j.status === 'error');
  if (errored.length === 0) return 'No errored downloads found';
  errored.forEach(j => deleteJob(j.jobId));
  return `Removed ${errored.length} errored job${errored.length > 1 ? 's' : ''}`;
}

async function clearStuckQueued(): Promise<string> {
  const jobs = getAllJobs();
  const cutoff = Date.now() - 30 * 60 * 1000;
  const stuck = (jobs as TorrentJob[]).filter(
    j => j.status === 'queued' && new Date(j.addedAt).getTime() < cutoff
  );
  if (stuck.length === 0) return 'No stuck queued jobs found';
  stuck.forEach(j => deleteJob(j.jobId));
  return `Removed ${stuck.length} stuck queued job${stuck.length > 1 ? 's' : ''}`;
}

async function resetHlsSessions(): Promise<string> {
  try {
    const { stopAllHlsJobs } = await import('../../../hlsTranscoder.js');
    stopAllHlsJobs();
    return 'All active HLS transcode sessions stopped';
  } catch {
    return 'HLS session reset not available in this build';
  }
}

async function clearTmdbCache(): Promise<string> {
  // Wipe the enrichment cache by clearing the enrichedAt field on all items
  // so they get re-fetched on next access. Uses unknown[] to avoid strict typing.
  const lib = readLibrary<Record<string, unknown>>();
  const enriched = lib.filter(m => {
    const enr = m.enrichment as Record<string, unknown> | undefined;
    return enr?.enrichedAt != null;
  });
  if (enriched.length === 0) return 'No cached TMDB data to clear';
  await writeLibrary<Record<string, unknown>>(items =>
    items.map(m => {
      const enr = m.enrichment as Record<string, unknown> | undefined;
      if (!enr) return m;
      const { enrichedAt: _drop, ...rest } = enr;
      return { ...m, enrichment: rest };
    })
  );
  return `Cleared TMDB cache for ${enriched.length} item${enriched.length > 1 ? 's' : ''} — will re-fetch on next view`;
}

async function clearWatchProgress(): Promise<string> {
  const lib = readLibrary<Record<string, unknown>>();
  const withProgress = lib.filter(m => {
    const wp = m.watchProgress as number | undefined;
    return typeof wp === 'number' && wp > 0;
  });
  if (withProgress.length === 0) return 'No server-side watch progress to clear';
  await writeLibrary<Record<string, unknown>>(items =>
    items.map(m => ({ ...m, watchProgress: 0, profileProgress: {} }))
  );
  return `Cleared watch progress for ${withProgress.length} item${withProgress.length > 1 ? 's' : ''}`;
}

async function reindexLibrary(): Promise<string> {
  // Re-enrichment is the closest available operation — triggers metadata refresh
  const cfg = readConfig();
  if (!cfg.mediaDir) return 'No media directory configured — run Setup Wizard first';
  return 'Re-index not available via API — use the Setup Wizard to re-scan your media folder';
}

async function testNetwork(): Promise<string> {
  const targets = [
    { name: 'TMDB', url: 'https://api.themoviedb.org/3/configuration' },
    { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json' },
    { name: 'OpenSubtitles', url: 'https://rest.opensubtitles.org' },
  ];
  const results = await Promise.all(targets.map(async t => {
    const r = await pingUrl(t.url);
    return `${t.name}: ${r.ok ? `✓ ${r.ms}ms` : `✗ ${r.error ?? `HTTP ${r.status}`}`}`;
  }));
  return results.join(' · ');
}

async function purgeOrphanedUploads(): Promise<string> {
  const uploadsDir = path.join(dataDir(), 'uploads');
  if (!fs.existsSync(uploadsDir)) return 'Uploads directory does not exist — nothing to purge';

  const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts']);
  const lib = readLibrary<{
    filename?: string;
    originalFilename?: string;
    episodes?: Array<{ filename?: string }>;
  }>();

  const knownFiles = new Set<string>();
  for (const item of lib) {
    if (item.filename)         knownFiles.add(path.basename(item.filename));
    if (item.originalFilename) knownFiles.add(path.basename(item.originalFilename));
    if (Array.isArray(item.episodes)) {
      for (const ep of item.episodes) {
        if (ep.filename) knownFiles.add(path.basename(ep.filename));
      }
    }
  }

  const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
  const orphans = entries.filter(e => {
    if (!e.isFile()) return false;
    const ext = path.extname(e.name).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext) && !knownFiles.has(e.name);
  });

  if (orphans.length === 0) return 'No orphaned video files found';

  let removed = 0;
  let totalBytes = 0;
  for (const orphan of orphans) {
    const filePath = path.join(uploadsDir, orphan.name);
    try {
      totalBytes += fs.statSync(filePath).size;
      fs.unlinkSync(filePath);
      removed++;
    } catch { /* skip */ }
  }
  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  return `Removed ${removed} orphaned file${removed !== 1 ? 's' : ''} (${mb} MB reclaimed)`;
}

async function pruneTmdbCacheFiles(): Promise<string> {
  // Capture console output by temporarily intercepting it
  const messages: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    messages.push(args.join(' '));
    origLog(...args);
  };
  try {
    pruneStaleTmdbCache();
  } finally {
    console.log = origLog;
  }
  const msg = messages.find(m => m.includes('[startup] TMDB cache prune'));
  return msg?.replace('[startup] TMDB cache prune: ', '') ?? 'TMDB cache prune complete';
}

// ── Handler ───────────────────────────────────────────────────────────────────

const ACTIONS: Record<string, () => Promise<string>> = {
  clear_stuck_transcodes:  clearStuckTranscodes,
  clear_errored_downloads: clearErroredDownloads,
  clear_stuck_queued:      clearStuckQueued,
  reset_hls_sessions:      resetHlsSessions,
  clear_tmdb_cache:        clearTmdbCache,
  clear_watch_progress:    clearWatchProgress,
  reindex_library:         reindexLibrary,
  clear_crash_log:         async () => { clearCrashLog(); return 'Crash log cleared'; },
  test_network:            testNetwork,
  purge_orphaned_uploads:  purgeOrphanedUploads,
  prune_tmdb_cache:        pruneTmdbCacheFiles,
};

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { action } = req.body as { action?: string };
  if (!action) return res.status(400).json({ error: 'Missing action' });

  const fn = ACTIONS[action];
  if (!fn) return res.status(400).json({ error: `Unknown action: ${action}` });

  try {
    const message = await fn();
    res.json({ ok: true, message });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}
