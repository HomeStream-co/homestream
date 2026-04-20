import type { Request, Response } from 'express';
import { requireAuth } from '../../authMiddleware.js';

/**
 * POST /api/stremio/stream
 * Body: { imdbId: string, type: 'movie' | 'series', season?: number, episode?: number }
 *
 * Resolves torrent/magnet streams for a given IMDB ID using public Stremio
 * addon endpoints (no auth required). Returns a list of stream options with
 * magnet links and quality labels so the UI can let the user pick one.
 *
 * Uses the public Torrentio addon — the most popular Stremio stream source.
 * Torrentio aggregates public torrent trackers (RARBG, 1337x, YTS, etc.)
 * and returns magnet links. No account needed for basic use.
 */

interface TorrentioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: { bingeGroup?: string };
  sources?: string[];
}

interface TorrentioResponse {
  streams?: TorrentioStream[];
}

interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
}

const TORRENTIO = 'https://torrentio.strem.fun';
const TIMEOUT_MS = 15_000;

function parseStreamTitle(raw: string): { quality: string; size: string; seeds: string } {
  // Torrentio title format: "Quality\nSize 👤 Seeds\nSource"
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

export default async function handler(req: Request, res: Response) {
  const { imdbId, type, season, episode } = req.body as {
    imdbId?: string;
    type?: string;
    season?: number;
    episode?: number;
  };

  if (!imdbId || !type) {
    res.status(400).json({ error: 'imdbId and type are required' });
    return;
  }

  // Build Torrentio path
  // Movie:  /stream/movie/tt1234567.json
  // Series: /stream/series/tt1234567:1:1.json
  const streamId =
    type === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;

  const url = `${TORRENTIO}/stream/${type}/${streamId}.json`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fetchRes = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.0' },
    });
    clearTimeout(t);

    if (!fetchRes.ok) {
      res.status(502).json({ error: 'Torrentio returned an error', status: fetchRes.status });
      return;
    }

    const data = await fetchRes.json() as TorrentioResponse;
    const streams = data.streams ?? [];

    const results: StreamResult[] = streams
      .filter(s => s.infoHash)
      .slice(0, 20)
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

    res.json({ streams: results });
  } catch (err) {
    clearTimeout(t);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Stream lookup timed out' : 'Failed to fetch streams',
      message: String(err),
    });
  }
}
