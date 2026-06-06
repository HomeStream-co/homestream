/**
 * torrentManager — server-side torrent download engine
 *
 * Uses WebTorrent (pure-JS, no native binaries) to download torrents
 * directly on the server into the uploads/ folder, then automatically
 * triggers the same transcode + metadata pipeline as a manual upload.
 *
 * Quality selection strategy (for series "download all episodes"):
 *   - Prefer streams that are ≥ 720p but NOT 4K (to save storage)
 *   - Among qualifying streams, pick the one with the most seeds
 *   - If nothing ≥ 720p is found, fall back to the best available
 *
 * Job lifecycle:
 *   queued → downloading (0–100%) → transcoding → done | error
 */

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { writeLibrary } from './libraryStore.js';
import { createJob } from './transcodeStore.js';
import { transcodeFile } from './transcodeWorker.js';
import { fetchOMDB } from './mediaUtils.js';
import { upsertJob, updateJobStatus, getAllPersistedJobs } from './downloadJobStore.js';
import { readConfig } from './configStore.js';
import { dataDir } from './dataDir.js';

/** Returns the active downloads directory, preferring mediaDir/downloads from config. */
function getDownloadsDir(): string {
  const cfg = readConfig();
  if (cfg.mediaDir) {
    const dir = path.join(cfg.mediaDir, 'downloads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // Fallback: uploads inside the data directory (writable on all platforms,
  // including packaged Electron on Linux where process.cwd() is read-only).
  const fallback = path.join(dataDir(), 'uploads');
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── In-memory job store ──────────────────────────────────────────────────────

const jobs = new Map<string, TorrentJob>();

export function getJob(jobId: string): TorrentJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): TorrentJob[] {
  // Merge in-memory jobs with persisted jobs from disk.
  // In-memory jobs take precedence (they have live progress/speed/etc).
  const persisted = getAllPersistedJobs()
    .filter(j => j.backend === 'webtorrent')
    .map(j => ({
      jobId: j.jobId,
      mediaId: '',
      title: j.title,
      quality: j.quality,
      type: j.type as 'movie' | 'series',
      season: j.season,
      episode: j.episode,
      status: j.status as TorrentJobStatus,
      progress: j.status === 'done' ? 100 : 0,
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
  return getAllJobs().filter(j => j.status === 'queued' || j.status === 'downloading' || j.status === 'transcoding');
}

// ─── Quality helpers ──────────────────────────────────────────────────────────

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
 *
 * FIX (🔴): Previously ignored preferredQuality entirely — always capped at
 * 1080p even when the user explicitly chose '4k' or 'best'. Now the caller
 * passes preferredQuality from readConfig() and the function honours it.
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
    // Highest resolution first, then most seeds
    return withRes.sort((a, b) => b.res - a.res || bySeed(a, b))[0];
  }

  const targetRes = preferredQuality === '4k' ? 2160 : preferredQuality === '1080p' ? 1080 : 720;

  // 1. Exact target resolution, most seeds
  const exact = withRes.filter(s => s.res === targetRes).sort(bySeed);
  if (exact.length > 0) return exact[0];

  // 2. Nearest resolution below target (e.g. asked for 4K, try 1080p)
  const below = withRes.filter(s => s.res > 0 && s.res < targetRes).sort((a, b) => b.res - a.res || bySeed(a, b));
  if (below.length > 0) return below[0];

  // 3. Any HD stream (≥ 720p), most seeds
  const hd = withRes.filter(s => s.res >= 720).sort(bySeed);
  if (hd.length > 0) return hd[0];

  // 4. Last resort: most seeds regardless of resolution
  return withRes.sort(bySeed)[0];
}

// ─── Core download function ───────────────────────────────────────────────────

export async function startTorrentDownload(params: {
  jobId: string;
  mediaId: string;
  infoHash: string;
  magnet: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  imdbId: string;
  poster?: string;
  year?: string;
}): Promise<void> {
  const { jobId, mediaId, magnet, title, quality, type, season, episode, imdbId, poster, year } = params;

  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'downloading';
  job.progress = 0;

  try {
    // Lazy-load WebTorrent so the module can be imported in production
    // even when webtorrent is not bundled (it's externalized in the build).
    // This avoids a top-level ERR_MODULE_NOT_FOUND crash on startup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let WebTorrentCtor: new (...args: any[]) => any;
    try {
      const wt = await import('webtorrent');
      WebTorrentCtor = (wt.default ?? wt) as typeof WebTorrentCtor;
    } catch {
      throw new Error('WebTorrent is not available in this environment. Use qBittorrent for downloads.');
    }
    const client = new WebTorrentCtor();

    await new Promise<void>((resolve, reject) => {
      const downloadsDir = getDownloadsDir();
      const torrent = client.add(magnet, { path: downloadsDir });

      torrent.on('metadata', () => {
        console.log(`[torrent] Metadata received for "${title}" — ${torrent.files.length} file(s)`);
      });

      torrent.on('download', () => {
        const j = jobs.get(jobId);
        if (!j) return;
        j.progress = Math.round(torrent.progress * 100);
        j.downloadSpeed = torrent.downloadSpeed;
        j.uploadSpeed = torrent.uploadSpeed;
        j.peers = torrent.numPeers;
        j.eta = torrent.timeRemaining / 1000;
      });

      torrent.on('done', async () => {
        console.log(`[torrent] Download complete for "${title}"`);

        // Find the largest video file in the torrent
        const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm'];
        const videoFile = torrent.files
          .filter((f: { name: string; length: number; path: string }) => videoExts.includes(path.extname(f.name).toLowerCase()))
          .sort((a: { name: string; length: number; path: string }, b: { name: string; length: number; path: string }) => b.length - a.length)[0];

        if (!videoFile) {
          client.destroy();
          reject(new Error('No video file found in torrent'));
          return;
        }

        const downloadedPath = path.join(downloadsDir, videoFile.path);
        const safeName = `${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const inputFilename = safeName;
        const destPath = path.join(downloadsDir, inputFilename);

        // Rename/move to uploads root with safe name
        try {
          fs.renameSync(downloadedPath, destPath);
        } catch {
          // If rename fails across devices, copy then delete
          fs.copyFileSync(downloadedPath, destPath);
          fs.unlinkSync(downloadedPath);
        }

        client.destroy();

        // Update job to transcoding phase
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'transcoding';
          j.progress = 0;
        }

        // Fetch OMDB metadata
        const omdb = await fetchOMDB(title, year);

        const outputFilename = inputFilename.replace(/\.[^.]+$/, '') + '_tc.mp4';
        const genres = omdb?.Genre
          ? omdb.Genre.split(',').map((g: string) => g.trim())
          : ['Unknown'];

        // Build episode label for series
        const episodeLabel = type === 'series' && season != null && episode != null
          ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
          : '';

        const mediaItem = {
          id: mediaId,
          filename: outputFilename,
          originalFilename: videoFile.name,
          filepath: destPath,
          filePath: destPath,
          title: omdb?.Title || title,
          year: omdb?.Year || year || 'Unknown',
          genre: genres,
          plot: omdb?.Plot || '',
          director: omdb?.Director || '',
          actors: omdb?.Actors || '',
          imdbRating: omdb?.imdbRating || 'N/A',
          poster: (omdb?.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : (poster || ''),
          type,
          runtime: omdb?.Runtime || 'Unknown',
          rated: omdb?.Rated && omdb.Rated !== 'N/A' ? omdb.Rated.trim() : 'NR',
          addedAt: new Date().toISOString(),
          watchProgress: 0,
          fileSize: fs.statSync(destPath).size,
          transcoding: true,
          needsMetadata: !omdb,
          metadataAvailable: !!omdb,
          imdbId,
          season,
          episode,
          episodeLabel,
          downloadedVia: 'stremio',
          quality,
        };

        // Register transcode job
        createJob(mediaId, inputFilename, outputFilename);

        // Write to library
        await writeLibrary(lib => {
          lib.unshift(mediaItem as unknown as Record<string, unknown>);
          return lib;
        });

        // Kick off transcode
        try {
          const result = await transcodeFile(mediaId, destPath, path.join(downloadsDir, outputFilename));
          const finalPath = path.join(downloadsDir, result.outputFilename);
          await writeLibrary(lib => {
            const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
            if (idx !== -1) {
              const item = lib[idx] as Record<string, unknown>;
              item.transcoding = false;
              item.filename = result.outputFilename;
              item.filepath = finalPath;
              item.filePath = finalPath;
              item.fileSize = result.finalSize;
              item.originalSize = result.originalSize;
              item.savedBytes = result.savedBytes;
              item.transcodeStrategy = result.strategy;
            }
            return lib;
          });
        } catch (transcodeErr) {
          console.error(`[torrent] Transcode failed for ${mediaId}:`, transcodeErr);
          await writeLibrary(lib => {
            const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
            if (idx !== -1) {
              (lib[idx] as Record<string, unknown>).transcoding = false;
            }
            return lib;
          });
        }

        // Mark job done
        const jFinal = jobs.get(jobId);
        if (jFinal) {
          jFinal.status = 'done';
          jFinal.progress = 100;
          jFinal.completedAt = new Date().toISOString();
          updateJobStatus(jobId, 'done', jFinal.completedAt);
        }

        resolve();
      });

      torrent.on('error' as 'download', (err: unknown) => {
        client.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

  } catch (err) {
    const j = jobs.get(jobId);
    if (j) {
      j.status = 'error';
      j.error = err instanceof Error ? err.message : String(err);
      updateJobStatus(jobId, 'error', new Date().toISOString());
    }
    console.error(`[torrent] Download failed for "${title}":`, err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue a torrent download job. Returns the jobId immediately.
 * The download runs in the background.
 */
export function queueDownload(params: {
  infoHash: string;
  magnet: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  imdbId: string;
  poster?: string;
  year?: string;
}): TorrentJob {
  const jobId = randomUUID();
  const mediaId = randomUUID();

  const job: TorrentJob = {
    jobId,
    mediaId,
    title: params.title,
    quality: params.quality,
    type: params.type,
    season: params.season,
    episode: params.episode,
    status: 'queued',
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    peers: 0,
    eta: 0,
    addedAt: new Date().toISOString(),
    infoHash: params.infoHash,
    imdbId: params.imdbId,
    poster: params.poster,
  };

  jobs.set(jobId, job);

  // Persist to disk so job survives server restarts
  upsertJob({
    jobId,
    infoHash: params.infoHash,
    title: params.title,
    quality: params.quality,
    type: params.type,
    season: params.season,
    episode: params.episode,
    status: 'queued',
    addedAt: job.addedAt,
    poster: params.poster,
    imdbId: params.imdbId,
    backend: 'webtorrent',
  });

  // Fire and forget — runs in background
  startTorrentDownload({ jobId, mediaId, ...params }).catch(err => {
    console.error('[torrentManager] Unhandled error:', err);
  });

  return job;
}
