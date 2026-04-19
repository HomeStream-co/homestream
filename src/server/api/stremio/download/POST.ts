import type { Request, Response } from 'express';
import { pickBestStream } from '../../../torrentManager.js';
import { addMagnet, isReachable } from '../../../qbittorrentClient.js';
import { readConfig } from '../../../configStore.js';

/**
 * POST /api/stremio/download
 *
 * Routes magnet links to the best available download backend:
 *   1. qBittorrent (preferred) — full BitTorrent swarm, resume on restart
 *   2. WebTorrent (fallback)   — built-in, works without qBittorrent
 *
 * For MOVIES: picks the best single stream and queues one download.
 * For SERIES: fetches streams per episode, picks best, queues all.
 */

interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
}

interface TorrentioResponse {
  streams?: Array<{
    name?: string;
    title?: string;
    infoHash?: string;
    sources?: string[];
  }>;
}

const TORRENTIO = 'https://torrentio.strem.fun';
const TIMEOUT_MS = 15_000;

function parseStreamTitle(raw: string): { quality: string; size: string; seeds: string } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const quality = lines[0] ?? 'Unknown';
  const sizeLine = lines[1] ?? '';
  const sizeMatch = sizeLine.match(/[\d.]+\s*(?:GB|MB)/i);
  const seedMatch = sizeLine.match(/👤\s*(\d+)/);
  return {
    quality,
    size: sizeMatch ? sizeMatch[0] : '',
    seeds: seedMatch ? seedMatch[1] : '',
  };
}

function buildMagnet(infoHash: string, sources?: string[]): string {
  const trackers = (sources ?? [])
    .filter(s => s.startsWith('tracker:'))
    .map(s => `&tr=${encodeURIComponent(s.replace('tracker:', ''))}`)
    .join('');
  return `magnet:?xt=urn:btih:${infoHash}${trackers}`;
}

async function fetchStreamsForEpisode(
  imdbId: string,
  type: 'movie' | 'series',
  season?: number,
  episode?: number,
): Promise<StreamResult[]> {
  const streamId =
    type === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;

  const url = `${TORRENTIO}/stream/${type}/${streamId}.json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.0' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as TorrentioResponse;
    return (data.streams ?? [])
      .filter(s => s.infoHash)
      .map(s => {
        const { quality, size, seeds } = parseStreamTitle(s.title ?? s.name ?? '');
        return {
          name: s.name ?? 'Stream',
          quality,
          size,
          seeds,
          infoHash: s.infoHash!,
          magnet: buildMagnet(s.infoHash!, s.sources),
        };
      });
  } catch {
    clearTimeout(t);
    return [];
  }
}

// ─── qBittorrent job tracker (in-memory, mirrors torrentManager shape) ────────

interface QbitJob {
  jobId: string;
  infoHash: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: 'queued' | 'downloading' | 'done' | 'error';
  addedAt: string;
  poster?: string;
  imdbId: string;
  backend: 'qbittorrent';
}

const qbitJobs = new Map<string, QbitJob>();

export function getQbitJobs(): QbitJob[] {
  return Array.from(qbitJobs.values());
}

async function queueViaQbit(params: {
  magnet: string;
  infoHash: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  imdbId: string;
  poster?: string;
}): Promise<QbitJob> {
  const config = readConfig();
  const savePath = config.mediaDir
    ? `${config.mediaDir}/downloads`
    : '/downloads';

  const hash = await addMagnet(params.magnet, {
    savepath: savePath,
    category: 'homestream',
    tags: params.type,
  });

  const job: QbitJob = {
    jobId: hash || params.infoHash,
    infoHash: hash || params.infoHash,
    title: params.title,
    quality: params.quality,
    type: params.type,
    season: params.season,
    episode: params.episode,
    status: 'queued',
    addedAt: new Date().toISOString(),
    poster: params.poster,
    imdbId: params.imdbId,
    backend: 'qbittorrent',
  };

  qbitJobs.set(job.jobId, job);
  return job;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const {
    imdbId,
    type,
    title,
    poster,
    year,
    season,
    totalSeasons = 1,
    totalEpisodes = 10,
    streams: preloadedStreams,
  } = req.body as {
    imdbId?: string;
    type?: 'movie' | 'series';
    title?: string;
    poster?: string;
    year?: string;
    season?: number;
    totalSeasons?: number;
    totalEpisodes?: number;
    streams?: StreamResult[];
  };

  if (!imdbId || !type || !title) {
    res.status(400).json({ error: 'imdbId, type, and title are required' });
    return;
  }

  // Determine backend
  const useQbit = await isReachable();
  console.log(`[download] Backend: ${useQbit ? 'qBittorrent' : 'WebTorrent (fallback)'}`);

  try {
    if (type === 'movie') {
      let streams = preloadedStreams;
      if (!streams || streams.length === 0) {
        streams = await fetchStreamsForEpisode(imdbId, 'movie');
      }
      const best = pickBestStream(streams ?? []);
      if (!best) {
        res.status(404).json({ error: 'No suitable streams found for this title' });
        return;
      }

      if (useQbit) {
        const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId, poster });
        res.json({ queued: 1, jobs: [job], backend: 'qbittorrent' });
      } else {
        // Fallback to WebTorrent
        const { queueDownload } = await import('../../../torrentManager.js');
        const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId, poster, year });
        res.json({ queued: 1, jobs: [job], backend: 'webtorrent' });
      }

    } else {
      // Series — batch fetch all episodes
      const seasonsToFetch: number[] = [];
      if (season != null) {
        seasonsToFetch.push(season);
      } else {
        for (let s = 1; s <= totalSeasons; s++) seasonsToFetch.push(s);
      }

      const episodeTasks: Array<{ season: number; episode: number }> = [];
      for (const s of seasonsToFetch) {
        for (let ep = 1; ep <= totalEpisodes; ep++) {
          episodeTasks.push({ season: s, episode: ep });
        }
      }

      const BATCH = 5;
      const queuedJobs = [];

      for (let i = 0; i < episodeTasks.length; i += BATCH) {
        const batch = episodeTasks.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(({ season: s, episode: ep }) =>
            fetchStreamsForEpisode(imdbId, 'series', s, ep)
          )
        );

        for (let j = 0; j < batch.length; j++) {
          const { season: s, episode: ep } = batch[j];
          const epStreams = batchResults[j];
          if (epStreams.length === 0) continue;

          const best = pickBestStream(epStreams);
          if (!best) continue;

          const epTitle = `${title} S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;

          if (useQbit) {
            const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId, poster });
            queuedJobs.push(job);
          } else {
            const { queueDownload } = await import('../../../torrentManager.js');
            const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId, poster, year });
            queuedJobs.push(job);
          }
        }

        if (i + BATCH < episodeTasks.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (queuedJobs.length === 0) {
        res.status(404).json({ error: 'No episodes found to download' });
        return;
      }

      res.json({ queued: queuedJobs.length, jobs: queuedJobs, backend: useQbit ? 'qbittorrent' : 'webtorrent' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Download queue failed', message: String(err) });
  }
}
