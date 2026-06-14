import type { Request, Response } from 'express';
import { getAllJobs } from '../../../torrentManager.js';
import { getAllTorrents, getTransferInfo, isReachable } from '../../../qbittorrentClient.js';
import { getQbitJobs } from '../download/POST.js';
import { getAllPersistedJobs } from '../../../downloadJobStore.js';
import { requireAuth } from '../../../authMiddleware.js';

/**
 * GET /api/stremio/downloads
 *
 * Returns a unified view of ALL active downloads:
 *   - qBittorrent torrents (live data from qBit REST API)
 *   - WebTorrent jobs (in-memory fallback jobs)
 *   - Global transfer stats (total speed, session data)
 *
 * Polled every 2s by the Downloads page.
 */

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const wtJobs = getAllJobs();
  const qbitJobMeta = getQbitJobs(); // metadata we stored when adding (title, poster, etc.)
  // Real-Debrid jobs — always included so the Downloads page stays consistent
  // whether it's reading from the WebSocket push or this REST fallback.
  const rdJobs = getAllPersistedJobs().filter(j => j.backend === 'real-debrid');

  const qbitReachable = await isReachable();

  if (!qbitReachable) {
    // qBit offline — return persisted jobs + RD jobs
    return res.json({
      jobs: [...wtJobs, ...rdJobs],
      qbitTorrents: [],
      transferInfo: null,
      backend: 'none',
      qbitOnline: false,
      rdJobs,
    });
  }

  try {
    const [qbitTorrents, transferInfo] = await Promise.all([
      getAllTorrents('homestream'),
      getTransferInfo(),
    ]);

    // Merge qBit live data with our stored metadata (title, poster, imdbId)
    const enrichedTorrents = qbitTorrents.map(t => {
      const meta = qbitJobMeta.find(j => j.infoHash === t.hash || j.jobId === t.hash);
      return {
        // Live qBit fields
        hash: t.hash,
        name: t.name,
        size: t.size,
        progress: Math.round(t.progress * 100),
        dlspeed: t.dlspeed,
        upspeed: t.upspeed,
        seeds: t.num_seeds,
        peers: t.num_leechs,
        eta: t.eta,
        state: t.state,
        savePath: t.save_path,
        addedOn: t.added_on,
        completionOn: t.completion_on,
        ratio: t.ratio,
        // Our metadata
        title: meta?.title ?? t.name,
        quality: meta?.quality ?? '',
        type: meta?.type ?? 'movie',
        season: meta?.season,
        episode: meta?.episode,
        poster: meta?.poster ?? '',
        imdbId: meta?.imdbId ?? '',
        backend: 'qbittorrent' as const,
        // Normalised status
        status: normaliseQbitState(t.state, t.progress),
      };
    });

    res.json({
      jobs: [...wtJobs, ...rdJobs, ...enrichedTorrents],
      qbitTorrents: enrichedTorrents,
      transferInfo,
      backend: 'qbittorrent',
      qbitOnline: true,
      rdJobs,
    });
  } catch (err) {
    // qBit reachable but API call failed — return what we have
    res.json({
      jobs: [...wtJobs, ...rdJobs],
      qbitTorrents: [],
      transferInfo: null,
      backend: 'qbittorrent',
      qbitOnline: false,
      rdJobs,
      error: String(err),
    });
  }
}

function normaliseQbitState(
  state: string,
  progress: number,
): 'queued' | 'downloading' | 'done' | 'paused' | 'error' | 'seeding' | 'stalled' {
  const s = state.toLowerCase();
  if (s.includes('error') || s.includes('missingfiles')) return 'error';
  if (s.includes('seeding') || s.includes('uploading')) return 'seeding';
  if (s.includes('paused') && progress >= 1) return 'done';
  if (s.includes('paused')) return 'paused';
  if (s.includes('stalled')) return 'stalled';
  if (s.includes('queued') || s.includes('checking') || s.includes('allocating')) return 'queued';
  if (progress >= 1) return 'done';
  return 'downloading';
}
