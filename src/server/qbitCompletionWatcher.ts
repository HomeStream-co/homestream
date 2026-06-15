/**
 * qbitCompletionWatcher — polls qBittorrent for completed downloads
 *
 * Runs as a background interval (every 15 s) after server startup.
 * When a torrent transitions to state "seeding" or progress reaches 1.0,
 * it fires the postDownloadPipeline for that torrent so the file is
 * transcoded and added to the library automatically.
 *
 * Only processes torrents that have a matching HomeStream job record
 * (tagged with category "homestream" when added via queueViaQbit).
 * Ignores torrents added directly by the user in the qBit UI.
 *
 * Completion is idempotent — once a job is marked 'done' in the
 * downloadJobStore it is skipped on all future poll cycles.
 */

import { getAllTorrents, isReachable } from './qbittorrentClient.js';
import { getAllPersistedJobs, upsertJob, updateJobStatus } from './downloadJobStore.js';
import { runPostDownloadPipeline } from './postDownloadPipeline.js';

// ── State ─────────────────────────────────────────────────────────────────────

/** infoHashes currently being processed — prevents concurrent pipeline runs */
const processing = new Set<string>();

// ── Poll ──────────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  const reachable = await isReachable();
  if (!reachable) return;

  let torrents: Awaited<ReturnType<typeof getAllTorrents>>;
  try {
    torrents = await getAllTorrents('homestream');
  } catch {
    return; // qBit reachable but API call failed — try again next cycle
  }

  // Load all qBit jobs that are in 'queued', 'downloading', or 'error' state (max 3 retries)
  const pendingJobs = getAllPersistedJobs().filter(
    j => j.backend === 'qbittorrent' && (
      j.status === 'queued' ||
      j.status === 'downloading' ||
      (j.status === 'error' && (j.errorCount ?? 0) < 3)
    ),
  );

  for (const job of pendingJobs) {
    const torrent = torrents.find(
      t => t.hash.toLowerCase() === job.infoHash.toLowerCase(),
    );

    if (!torrent) continue;

    // Update progress for downloading torrents
    if (torrent.progress < 1 && torrent.state.toLowerCase().includes('download')) {
      upsertJob({ ...job, status: 'downloading', progress: Math.round(torrent.progress * 100) });
      continue;
    }
    // Completed states: seeding, pausedUP, forcedUP, or progress === 1
    const isComplete =
      torrent.progress >= 1 ||
      torrent.state.toLowerCase().includes('seeding') ||
      torrent.state.toLowerCase().includes('uploading') ||
      (torrent.state.toLowerCase().includes('paused') && torrent.progress >= 1);

    if (!isComplete) continue;
    if (processing.has(job.infoHash)) continue;

    // Find the downloaded file path from qBit
    const filePath = torrent.content_path || torrent.save_path;
    if (!filePath) {
      console.warn(`[qbit-watcher] No file path for completed torrent "${job.title}" — skipping`);
      continue;
    }

    processing.add(job.infoHash);
    console.log(`[qbit-watcher] "${job.title}" complete — starting pipeline`);

    // Fire pipeline in background — don't await so the poll loop continues
    runPostDownloadPipeline({
      filePath,
      title: job.title,
      quality: job.quality,
      type: job.type as 'movie' | 'series',
      season: job.season,
      episode: job.episode,
      imdbId: job.imdbId,
      poster: job.poster,
      year: undefined,
      jobId: job.jobId,
      backend: 'qbittorrent',
    })
      .catch(err => {
        console.error(`[qbit-watcher] Pipeline failed for "${job.title}":`, err);
        const errorCount = (job.errorCount ?? 0) + 1;
        upsertJob({
          ...job,
          status: 'error',
          errorCount,
        });
      })
      .finally(() => {
        processing.delete(job.infoHash);
      });
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

let _started = false;

export function startQbitCompletionWatcher(): void {
  if (_started) return;
  _started = true;

  // Initial poll after a short delay (let qBit settle on startup)
  setTimeout(() => {
    poll().catch(() => {});
    setInterval(() => poll().catch(() => {}), 15_000);
  }, 5_000);

  console.log('[qbit-watcher] Started (polling every 15 s)');
}
