import type { Request, Response } from 'express';
import { pickBestStream } from '../../../torrentManager.js';
import { addMagnet, isReachable } from '../../../qbittorrentClient.js';
import { readConfig } from '../../../configStore.js';
import { runPreDownloadScan } from '../../../security/threatScanner.js';
import { connectForDownload, disconnectAfterDownload } from '../../../vpnService.js';
import type { VPNConfig } from '../../../vpnService.js';
import { upsertJob, getAllPersistedJobs, findJobByInfoHash } from '../../../downloadJobStore.js';
import { requireAuth } from '../../../authMiddleware.js';

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

// ── 5-minute in-memory stream cache (avoids duplicate Torrentio fetches) ──────
interface CacheEntry { streams: StreamResult[]; expiresAt: number }
const streamCache = new Map<string, CacheEntry>();

function getCached(key: string): StreamResult[] | null {
  const entry = streamCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { streamCache.delete(key); return null; }
  return entry.streams;
}
function setCached(key: string, streams: StreamResult[]) {
  streamCache.set(key, { streams, expiresAt: Date.now() + 5 * 60 * 1000 });
  // Evict entries beyond 200 to prevent unbounded growth
  if (streamCache.size > 200) {
    const oldest = streamCache.keys().next().value;
    if (oldest) streamCache.delete(oldest);
  }
}

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

  const cacheKey = `${type}:${streamId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

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
    const streams = (data.streams ?? [])
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
    setCached(cacheKey, streams);
    return streams;
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
  // Merge in-memory jobs with persisted jobs from disk.
  // In-memory jobs take precedence (they have live status).
  const persisted = getAllPersistedJobs()
    .filter(j => j.backend === 'qbittorrent')
    .map(j => ({
      jobId: j.jobId,
      infoHash: j.infoHash,
      title: j.title,
      quality: j.quality,
      type: j.type as 'movie' | 'series',
      season: j.season,
      episode: j.episode,
      status: j.status as QbitJob['status'],
      addedAt: j.addedAt,
      poster: j.poster,
      imdbId: j.imdbId,
      backend: 'qbittorrent' as const,
    }));

  const inMemoryIds = new Set(qbitJobs.keys());
  const merged = [...Array.from(qbitJobs.values())];
  for (const p of persisted) {
    if (!inMemoryIds.has(p.jobId)) merged.push(p);
  }
  return merged;
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

  // Persist to disk so job survives server restarts
  upsertJob({
    jobId: job.jobId,
    infoHash: job.infoHash,
    title: job.title,
    quality: job.quality,
    type: job.type,
    season: job.season,
    episode: job.episode,
    status: job.status,
    addedAt: job.addedAt,
    poster: job.poster,
    imdbId: job.imdbId,
    backend: 'qbittorrent',
  });

  return job;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const {
    imdbId,
    type,
    title,
    poster,
    year,
    season,
    episode,
    totalSeasons = 1,
    streams: preloadedStreams,
  } = req.body as {
    imdbId?: string;
    type?: 'movie' | 'series';
    title?: string;
    poster?: string;
    year?: string;
    season?: number;
    episode?: number;
    totalSeasons?: number;
    streams?: StreamResult[];
  };

  if (!imdbId || !type || !title) {
    res.status(400).json({ error: 'imdbId, type, and title are required' });
    return;
  }

  // Determine backend
  const useQbit = await isReachable();
  console.log(`[download] Backend: ${useQbit ? 'qBittorrent' : 'WebTorrent (fallback)'}`);

  // ── VPN: connect before download (download-only, never affects streaming) ──
  const fullConfig = readConfig() as unknown as Record<string, unknown>;
  const vpnCfg = fullConfig.vpn as VPNConfig | undefined;
  let vpnConnected = false;

  if (vpnCfg?.enabled) {
    const vpnResult = await connectForDownload(vpnCfg);
    if (!vpnResult.ok) {
      console.warn(`[vpn] Failed to connect: ${vpnResult.error} — proceeding without VPN`);
    } else {
      vpnConnected = true;
      console.log(`[vpn] Tunnel up (${vpnCfg.protocol}) — download traffic protected`);
    }
  }

  // Helper to disconnect VPN after all downloads are queued
  const releaseVPN = async () => {
    if (vpnConnected && vpnCfg) {
      await disconnectAfterDownload(vpnCfg);
    }
  };

  // ── Duplicate detection helper ─────────────────────────────────────────────
  // Returns true (and sends 409) if the infoHash is already active.
  const checkDuplicate = (infoHash: string, label: string): boolean => {
    const existing = findJobByInfoHash(infoHash);
    if (existing) {
      console.log(`[download] Duplicate detected for "${label}" — infoHash ${infoHash} already ${existing.status}`);
      res.status(409).json({
        error: 'duplicate',
        message: `"${label}" is already in the download queue (${existing.status})`,
        existingJobId: existing.jobId,
        infoHash,
      });
      return true;
    }
    return false;
  };

  try {
    if (type === 'movie') {
      let streams = preloadedStreams;
      if (!streams || streams.length === 0) {
        streams = await fetchStreamsForEpisode(imdbId, 'movie');
      }
      const best = pickBestStream(streams ?? []);
      if (!best) {
        await releaseVPN();
        res.status(404).json({ error: 'No suitable streams found for this title' });
        return;
      }

      if (useQbit) {
        // ── Duplicate check ───────────────────────────────────────────────────
        if (checkDuplicate(best.infoHash, title)) { await releaseVPN(); return; }
        // ── Security scan before queuing ──────────────────────────────────────
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title });
        if (!scan.allowed) {
          await releaseVPN();
          res.status(403).json({
            error: 'Download blocked by security scan',
            reason: scan.reason,
            layer: scan.layer,
            details: scan.details,
            threatLevel: scan.threatLevel,
          });
          return;
        }
        const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId, poster });
        await releaseVPN();
        res.json({ queued: 1, jobs: [job], backend: 'qbittorrent', securityScan: scan, vpnUsed: vpnConnected });
      } else {
        // ── Duplicate check ───────────────────────────────────────────────────
        if (checkDuplicate(best.infoHash, title)) { await releaseVPN(); return; }
        // ── Security scan before queuing ──────────────────────────────────────
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title });
        if (!scan.allowed) {
          await releaseVPN();
          res.status(403).json({
            error: 'Download blocked by security scan',
            reason: scan.reason,
            layer: scan.layer,
            details: scan.details,
            threatLevel: scan.threatLevel,
          });
          return;
        }
        // Fallback to WebTorrent
        const { queueDownload } = await import('../../../torrentManager.js');
        const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId, poster, year });
        await releaseVPN();
        res.json({ queued: 1, jobs: [job], backend: 'webtorrent', securityScan: scan, vpnUsed: vpnConnected });
      }

    } else {
      // ── Single episode fast path ─────────────────────────────────────────
      // When both season AND episode are specified, skip the probe loop and
      // just fetch + queue that one episode directly.
      if (season != null && episode != null) {
        const epTitle = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        const streams = await fetchStreamsForEpisode(imdbId, 'series', season, episode);
        const best = pickBestStream(streams);
        if (!best) {
          await releaseVPN();
          res.status(404).json({ error: `No streams found for ${epTitle}` });
          return;
        }
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
        if (!scan.allowed) {
          await releaseVPN();
          res.status(403).json({ error: 'Download blocked by security scan', reason: scan.reason });
          return;
        }
        if (useQbit) {
          if (checkDuplicate(best.infoHash, epTitle)) { await releaseVPN(); return; }
          const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season, episode, imdbId, poster });
          await releaseVPN();
          res.json({ queued: 1, jobs: [job], backend: 'qbittorrent', vpnUsed: vpnConnected });
        } else {
          const { queueDownload } = await import('../../../torrentManager.js');
          const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season, episode, imdbId, poster, year });
          await releaseVPN();
          res.json({ queued: 1, jobs: [job], backend: 'webtorrent', vpnUsed: vpnConnected });
        }
        return;
      }

      // Series — probe each season dynamically to find real episode counts.
      // We fetch episodes one-by-one and stop when Torrentio returns nothing,
      // which is the natural signal that the season has ended. This avoids
      // hammering Torrentio for episodes that don't exist (e.g. assuming every
      // season has the same number of episodes).
      const seasonsToFetch: number[] = [];
      if (season != null) {
        seasonsToFetch.push(season);
      } else {
        for (let s = 1; s <= totalSeasons; s++) seasonsToFetch.push(s);
      }

      // Max episodes we'll probe per season before giving up (safety cap)
      const MAX_EPISODES_PER_SEASON = 50;

      const episodeTasks: Array<{ season: number; episode: number }> = [];
      for (const s of seasonsToFetch) {
        for (let ep = 1; ep <= MAX_EPISODES_PER_SEASON; ep++) {
          // Probe this episode — if Torrentio returns nothing, season is done
          const probe = await fetchStreamsForEpisode(imdbId, 'series', s, ep);
          if (probe.length === 0) {
            console.log(`[download] S${s} ends at E${ep - 1} (no streams found for E${ep})`);
            break;
          }
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
            const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
            if (!scan.allowed) {
              console.warn(`[security] Blocked episode ${epTitle}: ${scan.reason}`);
              continue; // skip this episode, continue with others
            }
            // Skip duplicates silently in batch mode
            if (findJobByInfoHash(best.infoHash)) {
              console.log(`[download] Skipping duplicate episode ${epTitle}`);
              continue;
            }
            const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId, poster });
            queuedJobs.push(job);
          } else {
            const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
            if (!scan.allowed) {
              console.warn(`[security] Blocked episode ${epTitle}: ${scan.reason}`);
              continue;
            }
            if (findJobByInfoHash(best.infoHash)) {
              console.log(`[download] Skipping duplicate episode ${epTitle}`);
              continue;
            }
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
        await releaseVPN();
        res.status(404).json({ error: 'No episodes found to download' });
        return;
      }

      await releaseVPN();
      res.json({ queued: queuedJobs.length, jobs: queuedJobs, backend: useQbit ? 'qbittorrent' : 'webtorrent', vpnUsed: vpnConnected });
    }
  } catch (err) {
    await releaseVPN();
    res.status(500).json({ error: 'Download queue failed', message: String(err) });
  }
}
