import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig, DEFAULT_TORRENT_SOURCES } from '../../../configStore.js';
import { fetchAllCustomSources } from '../../../customSourceFetcher.js';

/**
 * POST /api/stremio/stream
 * Body: { imdbId, type, season?, episode?, title? }
 *
 * Queries ALL configured sources in parallel and merges results:
 *   1. Torrentio  — always queried (public, no config needed)
 *   2. Prowlarr   — queried when prowlarrUrl + prowlarrApiKey are set in config
 *   3. Nyaa.si    — queried for anime (always, public API, no auth)
 *
 * Results are deduplicated by infoHash and sorted by seed count descending.
 * Each result carries a `source` label so the UI can show where it came from.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface TorrentioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
}
interface TorrentioResponse { streams?: TorrentioStream[] }

interface ProwlarrResult {
  title: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoHash?: string;
  seeders?: number;
  size?: number;
  publishDate?: string;
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

export interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
  source: 'torrentio' | 'prowlarr' | 'nyaa' | 'jackett' | 'torznab' | 'rss';
}

const TORRENTIO   = 'https://torrentio.strem.fun';
const NYAA_API    = 'https://nyaa.si/api';
const CINEMETA    = 'https://v3-cinemeta.strem.io';
const TIMEOUT_MS  = 15_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Source fetchers ───────────────────────────────────────────────────────────

async function fetchTorrentio(
  imdbId: string, type: string, season?: number, episode?: number,
): Promise<StreamResult[]> {
  const streamId =
    type === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;
  const url = `${TORRENTIO}/stream/${type}/${streamId}.json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'HomeStream/1.5' } });
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
  query: string, prowlarrUrl: string, prowlarrApiKey: string,
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
  } catch {
    clearTimeout(t);
    return [];
  }
}

async function fetchNyaa(query: string): Promise<StreamResult[]> {
  // Nyaa.si public RSS/JSON API — best for anime
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
  } catch {
    clearTimeout(t);
    return [];
  }
}

// ── IMDB ID resolver ──────────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { imdbId: rawImdbId, type, season, episode, title } = req.body as {
    imdbId?: string;
    type?: string;
    season?: number;
    episode?: number;
    title?: string;
  };

  if (!type) {
    res.status(400).json({ error: 'type is required' });
    return;
  }

  // Resolve IMDB ID — either provided directly or looked up via Cinemeta
  let imdbId = rawImdbId;
  if (!imdbId) {
    if (!title) {
      res.status(400).json({ error: 'imdbId or title is required' });
      return;
    }
    imdbId = (await resolveImdbId(title, type)) ?? undefined;
    if (!imdbId) {
      res.status(404).json({ error: 'Could not find title in Cinemeta — try a more specific title' });
      return;
    }
  }

  const config = readConfig();

  // Resolve which sources are enabled from the torrentSources registry
  const sources = config.torrentSources ?? DEFAULT_TORRENT_SOURCES;
  const srcEnabled = (type: string) => sources.find(s => s.type === type)?.enabled ?? true;

  // Build a human-readable search query for Prowlarr + Nyaa
  // e.g. "Breaking Bad S02E04" or "Spirited Away"
  let searchQuery = title ?? imdbId;
  if (type === 'series' && season != null && episode != null) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    searchQuery = `${title ?? imdbId} S${s}E${e}`;
  }

  // Fire all enabled sources in parallel — failures are isolated via allSettled
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

  // Merge + deduplicate by infoHash (case-insensitive)
  const seen = new Set<string>();
  const merged: StreamResult[] = [];
  for (const stream of [...torrentioStreams, ...prowlarrStreams, ...nyaaStreams, ...customStreams]) {
    const key = stream.infoHash.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(stream);
    }
  }

  // Sort by seed count descending
  merged.sort((a, b) => (parseInt(b.seeds) || 0) - (parseInt(a.seeds) || 0));

  // Count custom source results by type
  const customBySource: Record<string, number> = {};
  for (const s of customStreams) {
    customBySource[s.source] = (customBySource[s.source] ?? 0) + 1;
  }

  res.json({
    imdbId,
    streams: merged.slice(0, 60),
    sources: {
      torrentio: torrentioStreams.length,
      prowlarr: prowlarrStreams.length,
      nyaa: nyaaStreams.length,
      custom: customStreams.length,
      customBySource,
      prowlarrConfigured: !!(config.prowlarrUrl && config.prowlarrApiKey),
    },
  });
}
