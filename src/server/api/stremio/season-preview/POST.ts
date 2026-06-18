import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';
import { pickBestStream } from '../../../torrentManager.js';

export const middleware = [requireAuth];

interface StreamPreview {
  episode: number;
  sizeBytes: number;
  quality: string;
}

function buildMagnet(infoHash: string, trackers?: string[]): string {
  let url = `magnet:?xt=urn:btih:${infoHash}`;
  if (trackers) {
    trackers.forEach(tr => { url += `&tr=${encodeURIComponent(tr)}`; });
  }
  return url;
}

async function fetchStreamsForEpisode(imdbId: string, season: number, episode: number) {
  const streamId = `${imdbId}:${season}:${episode}`;
  const url = `https://torrentio.strem.fun/stream/series/${streamId}.json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'HomeStream/1.0' } });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as { streams?: Array<any> };
    return (data.streams ?? [])
      .filter(s => !!s.infoHash)
      .slice(0, 10)
      .map(s => ({
        infoHash: s.infoHash!,
        magnet: buildMagnet(s.infoHash!, s.sources),
        quality: (s.name ?? 'Unknown').split('\n')[0],
        name: s.name ?? 'Stream',
        size: s.name ? (s.name.match(/\b\d+(\.\d+)?\s*(GB|MB)\b/i)?.[0] || '0 MB') : '0 MB',
        seeds: s.name ? (s.name.match(/👤\s*(\d+)/)?.[1] || '0') : '0'
      }));
  } catch {
    clearTimeout(t);
    return [];
  }
}

/**
 * POST /api/stremio/season-preview
 *
 * Scans an entire season to find the best streams and calculates the total data required.
 * Returns a breakdown of sizes per episode.
 */
export async function handler(req: Request, res: Response) {
  try {
    const { imdbId, title, season } = req.body;
    if (!imdbId || !title || season == null) {
      return res.status(400).json({ error: 'imdbId, title, and season are required' });
    }

    const cfg = readConfig();
    const preferredQuality = (cfg.preferredQuality as '720p' | '1080p' | '4k' | 'best') ?? '1080p';

    const MAX_EPISODES = 50;
    const CONCURRENCY = 5;
    
    // We fetch in chunks of 5
    const previews: StreamPreview[] = [];
    let emptyCount = 0;

    for (let i = 1; i <= MAX_EPISODES; i += CONCURRENCY) {
      const batch = [];
      for (let j = 0; j < CONCURRENCY; j++) {
        const ep = i + j;
        if (ep > MAX_EPISODES) break;
        batch.push((async () => {
          try {
            const streams = await fetchStreamsForEpisode(imdbId, season, ep);
            return { ep, streams };
          } catch (err) {
            console.error(`[season-preview] Error fetching S${season}E${ep}:`, err);
            return { ep, streams: [] };
          }
        })());
      }

      const results = await Promise.all(batch);
      for (const res of results) {
        if (res.streams.length === 0) {
          emptyCount++;
          continue;
        }
        
        const best = pickBestStream(res.streams, preferredQuality);
        if (best) {
          // Convert size string (e.g. "1.2 GB") to bytes for calculation
          let bytes = 0;
          const sizeStr = best.size.toLowerCase().trim();
          const num = parseFloat(sizeStr);
          if (!isNaN(num)) {
            if (sizeStr.includes('gb')) bytes = num * 1024 * 1024 * 1024;
            else if (sizeStr.includes('mb')) bytes = num * 1024 * 1024;
            else if (sizeStr.includes('kb')) bytes = num * 1024;
            else bytes = num;
          }

          previews.push({
            episode: res.ep,
            sizeBytes: bytes,
            quality: best.quality
          });
        } else {
          emptyCount++;
        }
      }

      // If we hit 3 empty episodes in a row, assume the season is over
      if (emptyCount >= 3) break;
    }

    // Sort by episode
    previews.sort((a, b) => a.episode - b.episode);
    
    const totalBytes = previews.reduce((sum, p) => sum + p.sizeBytes, 0);

    res.json({
      season,
      totalBytes,
      episodeCount: previews.length,
      previews
    });
  } catch (err) {
    console.error('[season-preview] Error:', err);
    res.status(500).json({ error: 'Failed to calculate season sizes' });
  }
}
