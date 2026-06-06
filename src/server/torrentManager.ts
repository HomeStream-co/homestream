/**
 * torrentManager — job store + quality helpers for the download pipeline
 *
 * WebTorrent has been removed. Downloads are handled by two backends:
 *   1. Real-Debrid (primary)   — resolves magnet → HTTPS download → pipeline
 *   2. qBittorrent (fallback)  — adds magnet to qBit → watcher polls → pipeline
 *
 * This module provides:
 *   - TorrentJob type + in-memory job store (used by the downloads UI)
 *   - getAllJobs / getActiveJobs — merged in-memory + persisted jobs
 *   - pickBestStream — quality-aware stream selector
 *   - getDownloadsDir — resolves the active downloads directory
 *
 * The actual download logic lives in:
 *   - realDebridClient.ts      (RD resolve + HTTP download)
 *   - qbittorrentClient.ts     (qBit REST API)
 *   - qbitCompletionWatcher.ts (polls qBit for completion)
 *   - postDownloadPipeline.ts  (transcode + OMDB + library add)
 */

import path from 'path';
import fs from 'fs';
import { upsertJob, updateJobStatus, getAllPersistedJobs } from './downloadJobStore.js';
import { readConfig } from './configStore.js';
import { dataDir } from './dataDir.js';

// ── Downloads directory ───────────────────────────────────────────────────────

/** Returns the active downloads directory, preferring mediaDir/downloads from config. */
export function getDownloadsDir(): string {
  const cfg = readConfig();
  if (cfg.mediaDir) {
    const dir = path.join(cfg.mediaDir, 'downloads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const fallback = path.join(dataDir(), 'uploads');
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TorrentJobStatus = 'queued' | 'downloading' | 'transcoding' | 'done' | 'error';

export interface TorrentJob {
  jobId: string;
  mediaId: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: TorrentJobStatus;
  progress: number;       // 0–100
  downloadSpeed: number;  // bytes/s
  uploadSpeed: number;    // bytes/s
  peers: number;
  eta: number;            // seconds remaining
  error?: string;
  addedAt: string;
  completedAt?: string;
  infoHash: string;
  imdbId: string;
  poster?: string;
}

// ── In-memory job store ───────────────────────────────────────────────────────

const jobs = new Map<string, TorrentJob>();

export function getJob(jobId: string): TorrentJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): TorrentJob[] {
  // Merge in-memory jobs with persisted jobs from disk.
  // In-memory jobs take precedence (they have live progress/speed/etc).
  const persisted = getAllPersistedJobs()
    .map(j => ({
      jobId: j.jobId,
      mediaId: '',
      title: j.title,
      quality: j.quality,
      type: j.type as 'movie' | 'series',
      season: j.season,
      episode: j.episode,
      status: j.status as TorrentJobStatus,
      progress: j.status === 'done' ? 100 : (j.progress ?? 0),
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 0,
      eta: 0,
      addedAt: j.addedAt,
      completedAt: j.completedAt,
      infoHash: j.infoHash,
      imdbId: j.imdbId,
      poster: j.poster,
    }));

  const inMemoryIds = new Set(jobs.keys());
  const merged = [...Array.from(jobs.values()).sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  )];
  for (const p of persisted) {
    if (!inMemoryIds.has(p.jobId)) merged.push(p);
  }
  return merged;
}

export function getActiveJobs(): TorrentJob[] {
  return getAllJobs().filter(j =>
    j.status === 'queued' || j.status === 'downloading' || j.status === 'transcoding'
  );
}

// ── Quality helpers ───────────────────────────────────────────────────────────

/**
 * Parse a resolution number from a quality string.
 * "1080p BluRay" → 1080, "4K HDR" → 2160, "720p" → 720, unknown → 0
 */
export function parseResolution(quality: string): number {
  const q = quality.toLowerCase();
  if (q.includes('2160') || q.includes('4k') || q.includes('uhd')) return 2160;
  if (q.includes('1080')) return 1080;
  if (q.includes('720')) return 720;
  if (q.includes('480')) return 480;
  if (q.includes('360')) return 360;
  return 0;
}

/**
 * Pick the best stream, respecting the user's preferredQuality setting.
 *
 * preferredQuality values (from homestream-config.json):
 *   '720p'  → target 720p; fallback to any HD
 *   '1080p' → target 1080p; fallback to 720p, then any HD  (default)
 *   '4k'    → target 2160p/4K; fallback to 1080p, then any HD
 *   'best'  → highest resolution available, most seeds as tiebreaker
 *
 * Within each tier, the stream with the most seeds is preferred.
 * If nothing matches the target tier, we fall back progressively until
 * we find something, and as a last resort return the most-seeded stream.
 */
export function pickBestStream(
  streams: Array<{ quality: string; seeds: string; infoHash: string; magnet: string; size: string; name: string }>,
  preferredQuality: '720p' | '1080p' | '4k' | 'best' = '1080p',
): typeof streams[0] | null {
  if (streams.length === 0) return null;

  const withRes = streams.map(s => ({
    ...s,
    res: parseResolution(s.quality),
    seedCount: parseInt(s.seeds) || 0,
  }));

  const bySeed = (a: typeof withRes[0], b: typeof withRes[0]) => b.seedCount - a.seedCount;

  if (preferredQuality === 'best') {
    return withRes.sort((a, b) => b.res - a.res || bySeed(a, b))[0];
  }

  const targetRes = preferredQuality === '4k' ? 2160 : preferredQuality === '1080p' ? 1080 : 720;

  // 1. Exact target resolution, most seeds
  const exact = withRes.filter(s => s.res === targetRes).sort(bySeed);
  if (exact.length > 0) return exact[0];

  // 2. Nearest resolution below target
  const below = withRes.filter(s => s.res > 0 && s.res < targetRes).sort((a, b) => b.res - a.res || bySeed(a, b));
  if (below.length > 0) return below[0];

  // 3. Any HD stream (≥ 720p), most seeds
  const hd = withRes.filter(s => s.res >= 720).sort(bySeed);
  if (hd.length > 0) return hd[0];

  // 4. Last resort: most seeds regardless of resolution
  return withRes.sort(bySeed)[0];
}

// ── Re-exports for backwards compatibility ────────────────────────────────────
// These are used by the downloads UI and other modules that import from torrentManager.

export { upsertJob, updateJobStatus };
