import type { Request, Response } from 'express';
import path from 'path';
import { pickBestStream } from '../../../torrentManager.js';
import { addMagnet, testConnection } from '../../../qbittorrentClient.js';
import { readConfig } from '../../../configStore.js';
import { runPreDownloadScan } from '../../../security/threatScanner.js';
import { connectForDownload, disconnectAfterDownload } from '../../../vpnService.js';
import type { VPNConfig } from '../../../vpnService.js';
import { upsertJob, getAllPersistedJobs, findJobByInfoHash } from '../../../downloadJobStore.js';
import { requireAuth } from '../../../authMiddleware.js';
import { resolvemagnet, downloadUrl } from '../../../realDebridClient.js';

const CINEMETA   = 'https://v3-cinemeta.strem.io';
const TIMEOUT_MS = 15_000;

/** Resolve an IMDB ID from a title via Cinemeta when the caller doesn't have one. */
async function resolveImdbId(title: string, type: string): Promise<string | null> {
  const t = type === 'series' ? 'series' : 'movie';
  const url = `${CINEMETA}/catalog/${t}/top/search=${encodeURIComponent(title)}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { metas?: { id: string }[] };
    return data.metas?.[0]?.id ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * POST /api/stremio/download
 *
 * Routes magnet links to the best available download backend:
 *   1. qBittorrent (preferred) — full BitTorrent swarm, resume on restart
 *   2. WebTorrent (fallback)   — built-in, works without qBittorrent
 *
 * Stream sources (queried in parallel, same as /api/stremio/stream):
 *   1. Torrentio  — always queried (public, no config needed)
 *   2. Prowlarr   — queried when prowlarrUrl + prowlarrApiKey are set in config
 *   3. Nyaa.si    — queried for anime (always, public API, no auth)
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
  source: 'torrentio' | 'prowlarr' | 'nyaa';
}

interface TorrentioResponse {
  streams?: Array<{
    name?: string;
    title?: string;
    infoHash?: string;
    sources?: string[];
  }>;
}

interface ProwlarrResult {
  title: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoHash?: string;
  seeders?: number;
  size?: number;
}
interface ProwlarrResponse { results?: ProwlarrResult[] }

interface NyaaItem {
  id: number;
  title: string;
  magnet: string;
  seeders: number;
  leechers: number;
  size: string;
  hash: string;
}

const TORRENTIO  = 'https://torrentio.strem.fun';
const NYAA_API   = 'https://nyaa.si/api';

// ── 5-minute in-memory stream cache (avoids duplicate fetches) ────────────────
interface CacheEntry { streams: StreamResult[]; expiresAt: number }
const streamCache = new Map<string, CacheEntry>();

function getCached(key: string): StreamResult[] | null {
  const entry = streamCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { streamCache.delete(key); return null; }
  return entry.streams;
}
function setCached(key: string, streams: StreamResult[]) {
  streamCache.set(key, { streams, expiresAt: Date.now() + 5 * 60 * 1000 });
  if (streamCache.size > 200) {
    const oldest = streamCache.keys().next().value;
    if (oldest) streamCache.delete(oldest);
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

// ── Per-source fetchers ───────────────────────────────────────────────────────

async function fetchTorrentio(
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
      headers: { 'User-Agent': 'HomeStream/1.5' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as TorrentioResponse;
    return (data.streams ?? [])
      .filter(s => s.infoHash)
      .map(s => {
        const { quality, size, seeds } = parseStreamTitle(s.title ?? s.name ?? '');
        return {
          name: s.name ?? 'Torrentio',
          quality,
          size,
          seeds,
          infoHash: s.infoHash!,
          magnet: buildMagnet(s.infoHash!, s.sources),
          source: 'torrentio' as const,
        };
      });
  } catch { // non-fatal — Torrentio unreachable or returned bad data; caller falls back to other sources
    clearTimeout(t);
    return [];
  }
}

async function fetchProwlarr(
  query: string,
  prowlarrUrl: string,
  prowlarrApiKey: string,
): Promise<StreamResult[]> {
  if (!prowlarrUrl || !prowlarrApiKey) return [];
  const url = `${prowlarrUrl.replace(/\/$/, '')}/api/v1/search?query=${encodeURIComponent(query)}&type=search&limit=30`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'X-Api-Key': prowlarrApiKey, 'User-Agent': 'HomeStream/1.5' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as ProwlarrResponse;
    const mapped: (StreamResult | null)[] = (data.results ?? [])
      .filter(r => r.magnetUrl || r.infoHash)
      .map(r => {
        const infoHash = r.infoHash ?? r.magnetUrl?.match(/btih:([a-fA-F0-9]{40})/i)?.[1] ?? '';
        const magnet = r.magnetUrl ?? (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : '');
        if (!infoHash && !magnet) return null;
        return {
          name: r.title,
          quality: r.title.match(/\b(2160p|4K|1080p|720p|480p)\b/i)?.[1] ?? 'Unknown',
          size: formatBytes(r.size ?? 0),
          seeds: String(r.seeders ?? 0),
          infoHash: infoHash || magnet,
          magnet,
          source: 'prowlarr' as const,
        } satisfies StreamResult;
      });
    return mapped.filter((r): r is StreamResult => r !== null);
  } catch { // non-fatal — Prowlarr unreachable or returned bad data; caller falls back to other sources
    clearTimeout(t);
    return [];
  }
}

async function fetchNyaa(query: string): Promise<StreamResult[]> {
  const url = `${NYAA_API}?q=${encodeURIComponent(query)}&c=1_0&f=0&limit=20`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'HomeStream/1.5' } });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as { results?: NyaaItem[] } | NyaaItem[];
    const items: NyaaItem[] = Array.isArray(data) ? data : (data.results ?? []);
    return items
      .filter(i => i.hash && i.magnet)
      .map(i => ({
        name: i.title,
        quality: i.title.match(/\b(2160p|4K|1080p|720p|480p)\b/i)?.[1] ?? 'Unknown',
        size: i.size ?? '',
        seeds: String(i.seeders ?? 0),
        infoHash: i.hash,
        magnet: i.magnet,
        source: 'nyaa' as const,
      }));
  } catch { // non-fatal — Nyaa unreachable or returned bad data; caller falls back to other sources
    clearTimeout(t);
    return [];
  }
}

// ── Multi-source fetch + merge (mirrors /api/stremio/stream logic) ────────────

async function fetchStreamsForEpisode(
  imdbId: string,
  type: 'movie' | 'series',
  title: string,
  season?: number,
  episode?: number,
): Promise<StreamResult[]> {
  const streamId =
    type === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;

  const cacheKey = `dl:${type}:${streamId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Build search query for Prowlarr + Nyaa (same format as stream/POST.ts)
  let searchQuery = title || imdbId;
  if (type === 'series' && season != null && episode != null) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    searchQuery = `${title || imdbId} S${s}E${e}`;
  }

  const config = readConfig();

  // Fire all sources in parallel — failures are isolated via allSettled
  const [torrentioRes, prowlarrRes, nyaaRes] = await Promise.allSettled([
    fetchTorrentio(imdbId, type, season, episode),
    fetchProwlarr(searchQuery, config.prowlarrUrl, config.prowlarrApiKey),
    fetchNyaa(searchQuery),
  ]);

  const torrentioStreams = torrentioRes.status === 'fulfilled' ? torrentioRes.value : [];
  const prowlarrStreams  = prowlarrRes.status  === 'fulfilled' ? prowlarrRes.value  : [];
  const nyaaStreams      = nyaaRes.status      === 'fulfilled' ? nyaaRes.value      : [];

  // Merge + deduplicate by infoHash (case-insensitive), sort by seeds desc
  const seen = new Set<string>();
  const merged: StreamResult[] = [];
  for (const stream of [...torrentioStreams, ...prowlarrStreams, ...nyaaStreams]) {
    const key = stream.infoHash.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(stream);
    }
  }
  merged.sort((a, b) => (parseInt(b.seeds) || 0) - (parseInt(a.seeds) || 0));

  setCached(cacheKey, merged);
  return merged;
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

  if (!type || !title) {
    res.status(400).json({ error: 'type and title are required' });
    return;
  }

  // Resolve IMDB ID — either provided directly or looked up via Cinemeta.
  // TMDB cards don't carry an imdbId, so we fall back to a title search.
  let resolvedImdbId = imdbId;
  if (!resolvedImdbId) {
    console.log(`[download] No imdbId provided for "${title}" — resolving via Cinemeta…`);
    resolvedImdbId = (await resolveImdbId(title, type)) ?? undefined;
    if (!resolvedImdbId) {
      res.status(404).json({ error: `Could not find "${title}" in Cinemeta — try searching by exact title` });
      return;
    }
    console.log(`[download] Resolved imdbId for "${title}": ${resolvedImdbId}`);
  }
  const finalImdbId = resolvedImdbId;

  // ── Backend selection: RD > qBit > WebTorrent ─────────────────────────────
  const cfg = readConfig();
  const rdApiKey = cfg.realDebridApiKey?.trim();
  const useRD = !!rdApiKey;

  // Only check qBit / WebTorrent if RD is not configured
  let useQbit = false;
  let wtAvailable = false;
  if (!useRD) {
    const qbitResult = await testConnection();
    useQbit = qbitResult.ok;
    if (!useQbit) {
      try { await import('webtorrent'); wtAvailable = true; } catch { /* not bundled */ }
      if (!wtAvailable) {
        res.status(503).json({
          error: 'No download backend available',
          message: qbitResult.error
            ? `qBittorrent is offline (${qbitResult.error}) and the built-in downloader is not available. Configure Real-Debrid in Settings → Downloads for dependency-free downloads, or start qBittorrent.`
            : 'No download backend available. Configure Real-Debrid in Settings → Downloads, or start qBittorrent.',
          hint: 'real-debrid',
        });
        return;
      }
      if (qbitResult.error) {
        console.warn(`[download] qBittorrent unavailable: ${qbitResult.error} — falling back to WebTorrent`);
      }
    }
  }

  const backendLabel = useRD ? 'Real-Debrid' : useQbit ? 'qBittorrent' : 'WebTorrent (fallback)';
  console.log(`[download] Backend: ${backendLabel}`);

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
  // Errored jobs are NOT considered duplicates — allow the user to retry them.
  const checkDuplicate = (infoHash: string, label: string): boolean => {
    const existing = findJobByInfoHash(infoHash);
    if (existing && existing.status !== 'error') {
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
        streams = await fetchStreamsForEpisode(finalImdbId, 'movie', title);
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
        const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId: finalImdbId, poster });
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
        const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId: finalImdbId, poster, year });
        await releaseVPN();
        res.json({ queued: 1, jobs: [job], backend: 'webtorrent', securityScan: scan, vpnUsed: vpnConnected });
      }

    } else {
      // ── Single episode fast path ─────────────────────────────────────────
      // When both season AND episode are specified, skip the probe loop and
      // just fetch + queue that one episode directly.
      if (season != null && episode != null) {
        const epTitle = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        const streams = await fetchStreamsForEpisode(finalImdbId, 'series', title, season, episode);
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
          const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season, episode, imdbId: finalImdbId, poster });
          await releaseVPN();
          res.json({ queued: 1, jobs: [job], backend: 'qbittorrent', vpnUsed: vpnConnected });
        } else {
          const { queueDownload } = await import('../../../torrentManager.js');
          const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season, episode, imdbId: finalImdbId, poster, year });
          await releaseVPN();
          res.json({ queued: 1, jobs: [job], backend: 'webtorrent', vpnUsed: vpnConnected });
        }
        return;
      }

      // Series — probe each season dynamically to find real episode counts.
      const seasonsToFetch: number[] = [];
      if (season != null) {
        seasonsToFetch.push(season);
      } else {
        for (let s = 1; s <= totalSeasons; s++) seasonsToFetch.push(s);
      }

      const MAX_EPISODES_PER_SEASON = 50;

      const episodeTasks: Array<{ season: number; episode: number }> = [];
      for (const s of seasonsToFetch) {
        for (let ep = 1; ep <= MAX_EPISODES_PER_SEASON; ep++) {
          const probe = await fetchStreamsForEpisode(finalImdbId, 'series', title, s, ep);
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
            fetchStreamsForEpisode(finalImdbId, 'series', title, s, ep)
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
              continue;
            }
            if (findJobByInfoHash(best.infoHash)) {
              console.log(`[download] Skipping duplicate episode ${epTitle}`);
              continue;
            }
            const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId: finalImdbId, poster });
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
            const job = queueDownload({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId: finalImdbId, poster, year });
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
    const msg = err instanceof Error ? err.message : String(err);
    // Surface WebTorrent-unavailable errors with a clear actionable message
    if (msg.includes('WebTorrent is not available')) {
      res.status(503).json({
        error: 'Built-in downloader unavailable',
        message: 'qBittorrent is not running and the built-in downloader is not available in this environment. Please start qBittorrent or configure it in Settings → Downloads.',
      });
    } else {
      res.status(500).json({ error: 'Download queue failed', message: msg });
    }
  }
}
