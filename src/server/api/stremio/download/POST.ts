import type { Request, Response } from 'express';
import { queueDownload, pickBestStream } from '../../../torrentManager.js';

/**
 * POST /api/stremio/download
 *
 * Queues a server-side torrent download for a movie or TV series.
 *
 * For MOVIES: picks the best single stream (≥720p, not 4K, most seeds)
 * and queues one download job.
 *
 * For SERIES: fetches streams for every episode in the requested season
 * (or all seasons if none specified), picks the best stream per episode,
 * and queues one download job per episode. All run concurrently.
 *
 * Body:
 *   {
 *     imdbId: string,
 *     type: 'movie' | 'series',
 *     title: string,
 *     poster?: string,
 *     year?: string,
 *     // For series:
 *     season?: number,          // specific season, or omit for all
 *     totalSeasons?: number,    // how many seasons to fetch (default 1)
 *     totalEpisodes?: number,   // episodes per season (default 10, we probe)
 *     // Pre-fetched streams (optional — if already fetched by UI):
 *     streams?: StreamResult[],
 *   }
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

  try {
    if (type === 'movie') {
      // ── Movie: single download ──
      let streams = preloadedStreams;
      if (!streams || streams.length === 0) {
        streams = await fetchStreamsForEpisode(imdbId, 'movie');
      }
      const best = pickBestStream(streams ?? []);
      if (!best) {
        res.status(404).json({ error: 'No suitable streams found for this title' });
        return;
      }
      const job = queueDownload({
        infoHash: best.infoHash,
        magnet: best.magnet,
        title,
        quality: best.quality,
        type: 'movie',
        imdbId,
        poster,
        year,
      });
      res.json({ queued: 1, jobs: [job] });

    } else {
      // ── Series: download all episodes ──
      // Determine which seasons to fetch
      const seasonsToFetch: number[] = [];
      if (season != null) {
        seasonsToFetch.push(season);
      } else {
        for (let s = 1; s <= totalSeasons; s++) seasonsToFetch.push(s);
      }

      // Probe each season: try episodes 1..totalEpisodes, stop when no streams found
      const episodeTasks: Array<{ season: number; episode: number }> = [];

      for (const s of seasonsToFetch) {
        for (let ep = 1; ep <= totalEpisodes; ep++) {
          episodeTasks.push({ season: s, episode: ep });
        }
      }

      // Fetch streams for all episodes in parallel (batched to avoid hammering Torrentio)
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

          if (epStreams.length === 0) {
            // No streams for this episode — likely past the end of the season
            console.log(`[stremio/download] No streams for S${s}E${ep} — skipping`);
            continue;
          }

          const best = pickBestStream(epStreams);
          if (!best) continue;

          const epTitle = `${title} S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;
          const job = queueDownload({
            infoHash: best.infoHash,
            magnet: best.magnet,
            title: epTitle,
            quality: best.quality,
            type: 'series',
            season: s,
            episode: ep,
            imdbId,
            poster,
            year,
          });
          queuedJobs.push(job);
        }

        // Small delay between batches to be polite to Torrentio
        if (i + BATCH < episodeTasks.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (queuedJobs.length === 0) {
        res.status(404).json({ error: 'No episodes found to download' });
        return;
      }

      res.json({ queued: queuedJobs.length, jobs: queuedJobs });
    }
  } catch (err) {
    res.status(500).json({ error: 'Download queue failed', message: String(err) });
  }
}
