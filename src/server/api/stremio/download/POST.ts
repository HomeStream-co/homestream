import type { Request, Response } from 'express';
import { pickBestStream } from '../../../torrentManager.js';
import { addMagnet, isReachable } from '../../../qbittorrentClient.js';
import { readConfig, DEFAULT_TORRENT_SOURCES } from '../../../configStore.js';
import { runPreDownloadScan } from '../../../security/threatScanner.js';
import { connectForDownload, disconnectAfterDownload } from '../../../vpnService.js';
import type { VPNConfig } from '../../../vpnService.js';
import { upsertJob, getAllPersistedJobs, findJobByInfoHash, updateJobProgress } from '../../../downloadJobStore.js';
import { requireAuth } from '../../../authMiddleware.js';
import { resolvemagnet, downloadUrl } from '../../../realDebridClient.js';
import { runPostDownloadPipeline } from '../../../postDownloadPipeline.js';
import { fetchAllCustomSources } from '../../../customSourceFetcher.js';

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
 *   1. Real-Debrid (preferred) — premium cached downloads, no torrent client needed
 *   2. qBittorrent (fallback)  — full BitTorrent swarm, resume on restart
 *
 * Stream sources (queried in parallel, respecting torrentSources enabled flags):
 *   1. Torrentio  — built-in, public
 *   2. Prowlarr   — built-in, requires config
 *   3. Nyaa.si    — built-in, public
 *   4. Custom     — user-added Jackett / Torznab / RSS sources
 *
 * For MOVIES: picks the best single stream and queues one download.
 * For SERIES: fetches streams per episode, picks best, queues all.
 *
 * After download completes, both RD and qBit paths call runPostDownloadPipeline
 * which handles: transcode → OMDB metadata → category assignment → library add.
 */

interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
  source: 'torrentio' | 'prowlarr' | 'nyaa' | 'jackett' | 'torznab' | 'rss';
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
  streamCache.delete(key);
  streamCache.set(key, entry);
  return entry.streams;
}
function setCached(key: string, streams: StreamResult[]) {
  streamCache.delete(key);
  streamCache.set(key, { streams, expiresAt: Date.now() + 5 * 60 * 1000 });
  if (streamCache.size > 200) {
    const lru = streamCache.keys().next().value;
    if (lru) streamCache.delete(lru);
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
      headers: { 'User-Agent': 'HomeStream/1.6' },
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
  } catch {
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
      headers: { 'X-Api-Key': prowlarrApiKey, 'User-Agent': 'HomeStream/1.6' },
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
  } catch {
    clearTimeout(t);
    return [];
  }
}

async function fetchNyaa(query: string): Promise<StreamResult[]> {
  const url = `${NYAA_API}?q=${encodeURIComponent(query)}&c=1_0&f=0&limit=20`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'HomeStream/1.6' } });
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
  } catch {
    clearTimeout(t);
    return [];
  }
}

// ── Multi-source fetch + merge (respects torrentSources enabled flags) ─────────

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

  // Build search query for Prowlarr / Nyaa / custom sources
  let searchQuery = title || imdbId;
  if (type === 'series' && season != null && episode != null) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    searchQuery = `${title || imdbId} S${s}E${e}`;
  }

  const config = readConfig();
  const sources = config.torrentSources ?? DEFAULT_TORRENT_SOURCES;
  const srcEnabled = (srcType: string) => sources.find(s => s.type === srcType)?.enabled ?? true;

  // Fire all enabled sources in parallel
  const [torrentioRes, prowlarrRes, nyaaRes, customRes] = await Promise.allSettled([
    srcEnabled('torrentio') ? fetchTorrentio(imdbId, type, season, episode) : Promise.resolve([]),
    srcEnabled('prowlarr')  ? fetchProwlarr(searchQuery, config.prowlarrUrl, config.prowlarrApiKey) : Promise.resolve([]),
    srcEnabled('nyaa')      ? fetchNyaa(searchQuery) : Promise.resolve([]),
    fetchAllCustomSources(sources, searchQuery),
  ]);

  const torrentioStreams = torrentioRes.status === 'fulfilled' ? torrentioRes.value : [];
  const prowlarrStreams  = prowlarrRes.status  === 'fulfilled' ? prowlarrRes.value  : [];
  const nyaaStreams      = nyaaRes.status      === 'fulfilled' ? nyaaRes.value      : [];
  const customStreams    = customRes.status    === 'fulfilled' ? customRes.value    : [];

  // Merge + deduplicate by infoHash (case-insensitive), sort by seeds desc
  const seen = new Set<string>();
  const merged: StreamResult[] = [];
  for (const stream of [...torrentioStreams, ...prowlarrStreams, ...nyaaStreams, ...customStreams]) {
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

  // Resolve IMDB ID
  let resolvedImdbId = imdbId;
  if (!resolvedImdbId) {
    console.log(`[download] No imdbId for "${title}" — resolving via Cinemeta…`);
    resolvedImdbId = (await resolveImdbId(title, type)) ?? undefined;
    if (!resolvedImdbId) {
      res.status(404).json({ error: `Could not find "${title}" in Cinemeta — try searching by exact title` });
      return;
    }
  }
  const finalImdbId = resolvedImdbId;

  // ── Backend selection: RD > qBit ──────────────────────────────────────────
  const cfg = readConfig();
  const rdApiKey = cfg.realDebridApiKey?.trim();
  const useRD = !!rdApiKey;
  const preferredQuality = (cfg.preferredQuality as '720p' | '1080p' | '4k' | 'best') ?? '1080p';

  let useQbit = false;
  if (!useRD) {
    useQbit = await isReachable();
    if (!useQbit) {
      res.status(503).json({
        error: 'No download backend available',
        message: 'Configure Real-Debrid in Settings → Downloads for instant downloads, or start qBittorrent.',
        hint: 'real-debrid',
      });
      return;
    }
  }

  const backendLabel = useRD ? 'Real-Debrid' : 'qBittorrent';
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

  const releaseVPN = async () => {
    if (vpnConnected && vpnCfg) {
      await disconnectAfterDownload(vpnCfg);
    }
  };

  // ── Duplicate detection ────────────────────────────────────────────────────
  const activeInThisRequest = new Set<string>();
  const checkDuplicate = (infoHash: string, label: string): boolean => {
    const normalized = (infoHash ?? '').toLowerCase();
    if (!normalized) return false;
    if (activeInThisRequest.has(normalized)) {
      res.status(409).json({ error: 'duplicate', message: `"${label}" is already being queued`, infoHash });
      return true;
    }
    const existing = findJobByInfoHash(infoHash);
    if (existing && existing.status !== 'error') {
      res.status(409).json({
        error: 'duplicate',
        message: `"${label}" is already in the download queue (${existing.status})`,
        existingJobId: existing.jobId,
        infoHash,
      });
      return true;
    }
    activeInThisRequest.add(normalized);
    return false;
  };

  // ── RD background download helper ─────────────────────────────────────────
  // Fires RD resolve + download + pipeline in the background.
  // Responds immediately with the job entry.
  function fireRdDownload(params: {
    jobEntry: {
      jobId: string; infoHash: string; title: string; quality: string;
      type: 'movie' | 'series'; season?: number; episode?: number;
      status: 'downloading'; addedAt: string; poster?: string;
      imdbId: string; backend: 'real-debrid';
    };
    magnet: string;
  }) {
    const { jobEntry, magnet } = params;
    const { jobId, title: jobTitle, quality, type: jobType, season: jobSeason, episode: jobEpisode, imdbId: jobImdbId, poster: jobPoster } = jobEntry;

    (async () => {
      try {
        const cfg2 = readConfig();
        const directUrl = await resolvemagnet(magnet, rdApiKey!, (pct, status) => {
          console.log(`[rd] ${jobTitle}: ${status} ${pct}%`);
        });
        const ext = directUrl.split('?')[0].split('.').pop() ?? 'mkv';
        const safeTitle = jobTitle.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
        const destDir = cfg2.downloadsDir || (cfg2.mediaDir ? `${cfg2.mediaDir}/downloads` : '/downloads');
        const destPath = `${destDir}/${safeTitle} [${quality}].${ext}`;

        let lastProgressWrite = 0;
        await downloadUrl(directUrl, destPath, (dl, total) => {
          const now = Date.now();
          if (total > 0 && now - lastProgressWrite > 1000) {
            lastProgressWrite = now;
            updateJobProgress(jobId, dl, total);
          }
        });

        console.log(`[rd] ✓ ${jobTitle} saved to ${destPath} — starting pipeline`);

        // Hand off to the shared post-download pipeline
        await runPostDownloadPipeline({
          filePath: destPath,
          title: jobTitle,
          quality,
          type: jobType,
          season: jobSeason,
          episode: jobEpisode,
          imdbId: jobImdbId,
          poster: jobPoster,
          year,
          jobId,
          backend: 'real-debrid',
        });

      } catch (err) {
        console.error(`[rd] ✗ ${jobTitle} failed:`, err);
        upsertJob({ ...jobEntry, status: 'error' });
      }
    })();
  }

  try {
    if (type === 'movie') {
      let streams = preloadedStreams;
      if (!streams || streams.length === 0) {
        streams = await fetchStreamsForEpisode(finalImdbId, 'movie', title);
      }
      const best = pickBestStream(streams ?? [], preferredQuality);
      if (!best) {
        await releaseVPN();
        res.status(404).json({ error: 'No suitable streams found for this title' });
        return;
      }

      if (useRD) {
        if (checkDuplicate(best.infoHash, title)) { await releaseVPN(); return; }
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title });
        if (!scan.allowed) {
          await releaseVPN();
          res.status(403).json({ error: 'Download blocked by security scan', reason: scan.reason, layer: scan.layer, details: scan.details, threatLevel: scan.threatLevel });
          return;
        }
        const jobId = `rd-${best.infoHash}-${Date.now()}`;
        const jobEntry = {
          jobId, infoHash: best.infoHash, title, quality: best.quality,
          type: 'movie' as const, status: 'downloading' as const,
          addedAt: new Date().toISOString(), poster, imdbId: finalImdbId, backend: 'real-debrid' as const,
        };
        upsertJob(jobEntry);
        res.json({ queued: 1, jobs: [jobEntry], backend: 'real-debrid', securityScan: scan, vpnUsed: vpnConnected });
        await releaseVPN();
        fireRdDownload({ jobEntry, magnet: best.magnet });

      } else {
        if (checkDuplicate(best.infoHash, title)) { await releaseVPN(); return; }
        const scan = await runPreDownloadScan({ infoHash: best.infoHash, title });
        if (!scan.allowed) {
          await releaseVPN();
          res.status(403).json({ error: 'Download blocked by security scan', reason: scan.reason, layer: scan.layer, details: scan.details, threatLevel: scan.threatLevel });
          return;
        }
        const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, type: 'movie', title, imdbId: finalImdbId, poster });
        await releaseVPN();
        res.json({ queued: 1, jobs: [job], backend: 'qbittorrent', securityScan: scan, vpnUsed: vpnConnected });
      }

    } else {
      // ── Single episode fast path ─────────────────────────────────────────
      if (season != null && episode != null) {
        const epTitle = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        const streams = await fetchStreamsForEpisode(finalImdbId, 'series', title, season, episode);
        const best = pickBestStream(streams, preferredQuality);
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

        if (useRD) {
          if (checkDuplicate(best.infoHash, epTitle)) { await releaseVPN(); return; }
          const jobId = `rd-${best.infoHash}-${Date.now()}`;
          const jobEntry = {
            jobId, infoHash: best.infoHash, title: epTitle, quality: best.quality,
            type: 'series' as const, season, episode, status: 'downloading' as const,
            addedAt: new Date().toISOString(), poster, imdbId: finalImdbId, backend: 'real-debrid' as const,
          };
          upsertJob(jobEntry);
          res.json({ queued: 1, jobs: [jobEntry], backend: 'real-debrid', vpnUsed: vpnConnected });
          await releaseVPN();
          fireRdDownload({ jobEntry, magnet: best.magnet });
        } else {
          if (checkDuplicate(best.infoHash, epTitle)) { await releaseVPN(); return; }
          const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season, episode, imdbId: finalImdbId, poster });
          await releaseVPN();
          res.json({ queued: 1, jobs: [job], backend: 'qbittorrent', vpnUsed: vpnConnected });
        }
        return;
      }

      // ── Full series / full season path ───────────────────────────────────
      const seasonsToFetch: number[] = [];
      if (season != null) {
        seasonsToFetch.push(season);
      } else {
        for (let s = 1; s <= totalSeasons; s++) seasonsToFetch.push(s);
      }

      const MAX_EPISODES_PER_SEASON = 50;
      const episodeTasks: Array<{ season: number; episode: number; streams: StreamResult[] }> = [];
      for (const s of seasonsToFetch) {
        for (let ep = 1; ep <= MAX_EPISODES_PER_SEASON; ep++) {
          const epStreams = await fetchStreamsForEpisode(finalImdbId, 'series', title, s, ep);
          if (epStreams.length === 0) {
            console.log(`[download] S${s} ends at E${ep - 1} (no streams found for E${ep})`);
            break;
          }
          episodeTasks.push({ season: s, episode: ep, streams: epStreams });
        }
      }

      const BATCH = 5;
      const queuedJobs = [];

      for (let i = 0; i < episodeTasks.length; i += BATCH) {
        const batch = episodeTasks.slice(i, i + BATCH);

        for (const { season: s, episode: ep, streams: epStreams } of batch) {
          if (epStreams.length === 0) continue;

          const best = pickBestStream(epStreams, preferredQuality);
          if (!best) continue;

          const epTitle = `${title} S${String(s).padStart(2, '0')}E${String(ep).padStart(2, '0')}`;

          const scan = await runPreDownloadScan({ infoHash: best.infoHash, title: epTitle });
          if (!scan.allowed) {
            console.warn(`[security] Blocked episode ${epTitle}: ${scan.reason}`);
            continue;
          }
          if (findJobByInfoHash(best.infoHash)) {
            console.log(`[download] Skipping duplicate episode ${epTitle}`);
            continue;
          }

          if (useRD) {
            const jobId = `rd-${best.infoHash}-${Date.now()}`;
            const jobEntry = {
              jobId, infoHash: best.infoHash, title: epTitle, quality: best.quality,
              type: 'series' as const, season: s, episode: ep, status: 'downloading' as const,
              addedAt: new Date().toISOString(), poster, imdbId: finalImdbId, backend: 'real-debrid' as const,
            };
            upsertJob(jobEntry);
            queuedJobs.push(jobEntry);
            fireRdDownload({ jobEntry, magnet: best.magnet });
          } else {
            const job = await queueViaQbit({ infoHash: best.infoHash, magnet: best.magnet, quality: best.quality, title: epTitle, type: 'series', season: s, episode: ep, imdbId: finalImdbId, poster });
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
      res.json({
        queued: queuedJobs.length,
        jobs: queuedJobs,
        backend: useRD ? 'real-debrid' : 'qbittorrent',
        vpnUsed: vpnConnected,
      });
    }
  } catch (err) {
    await releaseVPN();
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Download queue failed', message: msg });
  }
}
