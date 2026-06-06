/**
 * customSourceFetcher — queries user-added Jackett, Torznab, and RSS sources
 *
 * Supports three custom source types:
 *
 *   jackett   — Jackett aggregator REST API (/api/v2.0/indexers/all/results)
 *               Returns JSON with Results array, each having MagnetUri / InfoHash
 *
 *   torznab   — Torznab XML API (Jackett/Prowlarr torznab endpoint)
 *               Returns RSS-like XML with <item> elements containing
 *               <torznab:attr name="infohash"> and <link> (magnet)
 *
 *   rss       — Generic RSS/Atom feed with magnet: links in <link> or <enclosure>
 *               Useful for private tracker RSS feeds
 *
 * All fetchers return the same StreamResult shape used by the rest of the
 * download pipeline so they slot in without any changes to callers.
 */

import type { TorrentSource } from './configStore.js';

// ── Shared type (mirrors stream/POST.ts StreamResult) ─────────────────────────

export interface StreamResult {
  name: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  infoHash: string;
  source: 'torrentio' | 'prowlarr' | 'nyaa' | 'jackett' | 'torznab' | 'rss';
}

const TIMEOUT_MS = 15_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

function extractQuality(text: string): string {
  return text.match(/\b(2160p|4K|1080p|720p|480p)\b/i)?.[1] ?? 'Unknown';
}

function extractInfoHash(magnet: string): string {
  return magnet.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase() ?? '';
}

// ── Jackett ───────────────────────────────────────────────────────────────────

interface JackettResult {
  Title?: string;
  MagnetUri?: string;
  InfoHash?: string;
  Seeders?: number;
  Size?: number;
}

async function fetchJackett(source: TorrentSource, query: string): Promise<StreamResult[]> {
  if (!source.url) return [];
  const base = source.url.replace(/\/$/, '');
  const apiKey = source.apiKey ?? '';
  const url = `${base}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${encodeURIComponent(query)}&_=1`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.6' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json() as { Results?: JackettResult[] };
    return (data.Results ?? [])
      .filter(r => r.MagnetUri || r.InfoHash)
      .map(r => {
        const magnet = r.MagnetUri ?? (r.InfoHash ? `magnet:?xt=urn:btih:${r.InfoHash}` : '');
        const infoHash = r.InfoHash?.toLowerCase() ?? extractInfoHash(magnet);
        return {
          name: r.Title ?? 'Jackett result',
          quality: extractQuality(r.Title ?? ''),
          size: formatBytes(r.Size ?? 0),
          seeds: String(r.Seeders ?? 0),
          magnet,
          infoHash,
          source: 'jackett' as const,
        };
      })
      .filter(r => r.infoHash || r.magnet);
  } catch {
    clearTimeout(t);
    return [];
  }
}

// ── Torznab ───────────────────────────────────────────────────────────────────

async function fetchTorznab(source: TorrentSource, query: string): Promise<StreamResult[]> {
  if (!source.url) return [];
  const base = source.url.replace(/\/$/, '');
  const apiKey = source.apiKey ? `&apikey=${source.apiKey}` : '';
  const url = `${base}?t=search&q=${encodeURIComponent(query)}${apiKey}&limit=30`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.6', Accept: 'application/rss+xml, text/xml' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseTorznabXml(xml);
  } catch {
    clearTimeout(t);
    return [];
  }
}

function parseTorznabXml(xml: string): StreamResult[] {
  const results: StreamResult[] = [];
  // Simple regex-based XML parser — avoids a DOM dependency
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';

    // Magnet from <link> or torznab:attr name="magneturl"
    const magnet =
      block.match(/name="magneturl"\s+value="([^"]+)"/i)?.[1] ??
      block.match(/<link>(magnet:[^<]+)<\/link>/)?.[1] ??
      '';

    // InfoHash from torznab:attr
    const infoHash =
      block.match(/name="infohash"\s+value="([^"]+)"/i)?.[1]?.toLowerCase() ??
      extractInfoHash(magnet);

    if (!infoHash && !magnet) continue;

    const seeders = parseInt(block.match(/name="seeders"\s+value="(\d+)"/i)?.[1] ?? '0', 10);
    const sizeBytes = parseInt(block.match(/name="size"\s+value="(\d+)"/i)?.[1] ?? '0', 10);

    results.push({
      name: title || 'Torznab result',
      quality: extractQuality(title),
      size: formatBytes(sizeBytes),
      seeds: String(seeders),
      magnet: magnet || (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : ''),
      infoHash,
      source: 'torznab' as const,
    });
  }

  return results;
}

// ── RSS ───────────────────────────────────────────────────────────────────────

async function fetchRss(source: TorrentSource, query: string): Promise<StreamResult[]> {
  if (!source.url) return [];
  // Append query as a search param if the URL supports it
  const url = source.url.includes('?')
    ? `${source.url}&q=${encodeURIComponent(query)}`
    : `${source.url}?q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeStream/1.6', Accept: 'application/rss+xml, text/xml' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssXml(xml);
  } catch {
    clearTimeout(t);
    return [];
  }
}

function parseRssXml(xml: string): StreamResult[] {
  const results: StreamResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';

    // Magnet from <link>, <enclosure url="magnet:...">, or <guid>
    const magnet =
      block.match(/<link>(magnet:[^<]+)<\/link>/)?.[1] ??
      block.match(/enclosure[^>]+url="(magnet:[^"]+)"/i)?.[1] ??
      block.match(/<guid[^>]*>(magnet:[^<]+)<\/guid>/)?.[1] ??
      '';

    if (!magnet) continue;

    const infoHash = extractInfoHash(magnet);
    if (!infoHash) continue;

    results.push({
      name: title || 'RSS result',
      quality: extractQuality(title),
      size: '',
      seeds: '0',
      magnet,
      infoHash,
      source: 'rss' as const,
    });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch results from a single custom TorrentSource.
 * Returns [] on any error — callers use Promise.allSettled.
 */
export async function fetchCustomSource(
  source: TorrentSource,
  query: string,
): Promise<StreamResult[]> {
  if (!source.enabled) return [];

  switch (source.type) {
    case 'jackett':  return fetchJackett(source, query);
    case 'torznab':  return fetchTorznab(source, query);
    case 'rss':      return fetchRss(source, query);
    default:         return [];
  }
}

/**
 * Fetch results from ALL enabled custom sources in parallel.
 * Built-in sources (torrentio, nyaa, prowlarr) are handled by their own
 * dedicated fetchers — this function only handles user-added sources.
 */
export async function fetchAllCustomSources(
  sources: TorrentSource[],
  query: string,
): Promise<StreamResult[]> {
  const custom = sources.filter(
    s => s.enabled && !s.builtIn && ['jackett', 'torznab', 'rss'].includes(s.type),
  );

  if (custom.length === 0) return [];

  const results = await Promise.allSettled(
    custom.map(s => fetchCustomSource(s, query)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<StreamResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
