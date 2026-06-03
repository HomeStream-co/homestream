/**
 * realDebridClient — Real-Debrid API integration
 *
 * Real-Debrid is a premium link hoster that can unrestrict torrents and
 * direct-download links. When an RD API key is configured, HomeStream uses
 * it as the preferred download backend:
 *
 *   1. Add magnet → RD queues it on their servers (near-instant for cached)
 *   2. Poll until "downloaded" status
 *   3. Select the largest video file link
 *   4. Stream/download that HTTPS link directly to the media folder
 *
 * No torrent client (qBittorrent / WebTorrent) is needed when RD is active.
 *
 * API docs: https://api.real-debrid.com/
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { readConfig } from './configStore.js';

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const TIMEOUT_MS = 20_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RDUser {
  id: number;
  username: string;
  email: string;
  points: number;
  locale: string;
  avatar: string;
  type: string;
  premium: number;   // seconds of premium remaining
  expiration: string;
}

interface RDAddMagnetResponse {
  id: string;
  uri: string;
}

interface RDTorrentInfo {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  host: string;
  split: number;
  progress: number;       // 0–100
  status: string;         // 'magnet_error' | 'magnet_conversion' | 'waiting_files_selection' |
                          // 'queued' | 'downloading' | 'downloaded' | 'error' | 'virus' |
                          // 'compressing' | 'uploading' | 'dead'
  added: string;
  files: Array<{ id: number; path: string; bytes: number; selected: number }>;
  links: string[];        // unrestricted download links (populated when downloaded)
}

interface RDUnrestrictResponse {
  id: string;
  filename: string;
  mimeType: string;
  filesize: number;
  link: string;
  host: string;
  download: string;       // the actual direct download URL
}

// ── Low-level fetch helper ────────────────────────────────────────────────────

async function rdFetch<T>(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  apiKey: string,
  body?: Record<string, string>,
): Promise<T> {
  const url = `${RD_BASE}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'HomeStream/1.6',
  };

  let bodyStr: string | undefined;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    bodyStr = new URLSearchParams(body).toString();
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RD API ${res.status}: ${text}`);
    }
    // DELETE returns empty body
    if (method === 'DELETE') return {} as T;
    return await res.json() as T;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Verify the API key and return user info. Throws on invalid key. */
export async function getUser(apiKey: string): Promise<RDUser> {
  return rdFetch<RDUser>('GET', '/user', apiKey);
}

/** Returns true if an RD API key is configured and the account is reachable. */
export async function isConfigured(): Promise<{ ok: boolean; error?: string; user?: RDUser }> {
  const cfg = readConfig();
  const key = cfg.realDebridApiKey?.trim();
  if (!key) return { ok: false, error: 'No API key configured' };
  try {
    const user = await getUser(key);
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Add a magnet to Real-Debrid and wait for it to be ready.
 * Returns the direct HTTPS download URL for the largest video file.
 *
 * @param magnet     - magnet URI
 * @param apiKey     - RD API token
 * @param onProgress - optional callback with 0–100 progress and status string
 */
export async function resolvemagnet(
  magnet: string,
  apiKey: string,
  onProgress?: (pct: number, status: string) => void,
): Promise<string> {
  // 1. Add magnet
  const added = await rdFetch<RDAddMagnetResponse>('POST', '/torrents/addMagnet', apiKey, { magnet });
  const torrentId = added.id;

  // 2. Select files — RD requires explicit file selection before it starts downloading.
  //
  //    WRONG (silently ignored by RD API, torrent stays in waiting_files_selection forever):
  //      POST selectFiles  { files: 'all' }
  //
  //    CORRECT: fetch torrent info first to get the actual file IDs, then POST them
  //    as a comma-separated string.  If the torrent is still in magnet_conversion
  //    (metadata not yet fetched), poll briefly until file IDs are available.
  {
    const FILE_WAIT_MS = 30_000; // wait up to 30 s for magnet metadata
    const FILE_POLL_MS = 2_000;
    const fileWaitStart = Date.now();
    let fileIds: string | null = null;

    while (Date.now() - fileWaitStart < FILE_WAIT_MS) {
      const info = await rdFetch<RDTorrentInfo>('GET', `/torrents/info/${torrentId}`, apiKey);

      if (['magnet_error', 'error', 'virus', 'dead'].includes(info.status)) {
        await rdFetch<unknown>('DELETE', `/torrents/delete/${torrentId}`, apiKey).catch(() => {});
        throw new Error(`RD: torrent failed during metadata fetch with status "${info.status}"`);
      }

      if (info.files && info.files.length > 0) {
        // Select all files by their IDs (comma-separated)
        fileIds = info.files.map(f => String(f.id)).join(',');
        break;
      }

      // Still in magnet_conversion — wait and retry
      await sleep(FILE_POLL_MS);
    }

    if (!fileIds) {
      await rdFetch<unknown>('DELETE', `/torrents/delete/${torrentId}`, apiKey).catch(() => {});
      throw new Error('RD: timed out waiting for torrent metadata (magnet_conversion took > 30 s)');
    }

    await rdFetch<unknown>('POST', `/torrents/selectFiles/${torrentId}`, apiKey, { files: fileIds });
  }

  // 3. Poll until downloaded (or error/timeout)
  const MAX_WAIT_MS   = 30 * 60 * 1000; // 30 minutes
  const POLL_INTERVAL = 5_000;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    const info = await rdFetch<RDTorrentInfo>('GET', `/torrents/info/${torrentId}`, apiKey);
    onProgress?.(info.progress, info.status);

    if (info.status === 'downloaded') {
      if (!info.links || info.links.length === 0) {
        throw new Error('RD: torrent downloaded but no links available');
      }

      // 4. Pick the best video link — unrestrict all links in parallel and
      //    choose the one with the largest filesize (avoids picking samples/extras).
      const unrestricted = await pickLargestVideoLink(info.links, apiKey);
      return unrestricted;
    }

    if (['magnet_error', 'error', 'virus', 'dead'].includes(info.status)) {
      await rdFetch<unknown>('DELETE', `/torrents/delete/${torrentId}`, apiKey).catch(() => {});
      throw new Error(`RD: torrent failed with status "${info.status}"`);
    }

    await sleep(POLL_INTERVAL);
  }

  throw new Error('RD: timed out waiting for torrent to download (30 min limit)');
}

/**
 * Unrestrict all RD links in parallel and return the direct download URL
 * for the largest file (by filesize reported by RD).
 *
 * Why not just pick links[0]?
 *   RD returns links in file-selection order, not size order.  A torrent
 *   often contains extras, samples, or subtitle files before the main feature.
 *   Picking by filesize guarantees we get the actual video.
 */
async function pickLargestVideoLink(links: string[], apiKey: string): Promise<string> {
  // Unrestrict all links concurrently (RD rate-limits are generous for /unrestrict/link)
  const results = await Promise.allSettled(
    links.map(link =>
      rdFetch<RDUnrestrictResponse>('POST', '/unrestrict/link', apiKey, { link })
    )
  );

  let bestUrl = '';
  let bestSize = -1;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const r = result.value;
    if (!r.download) continue;
    if (r.filesize > bestSize) {
      bestSize = r.filesize;
      bestUrl = r.download;
    }
  }

  if (!bestUrl) throw new Error('RD: failed to unrestrict any download links');
  return bestUrl;
}

/**
 * Download a direct HTTPS URL to a local file path, streaming to disk.
 * Reports progress via onProgress(bytesDownloaded, totalBytes).
 *
 * Includes a 30-second socket inactivity timeout — if the CDN stalls
 * mid-transfer (connection stays open but no data flows), the request is
 * destroyed and the promise rejects so the job can be marked as error
 * rather than hanging indefinitely.
 */
export async function downloadUrl(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  const SOCKET_IDLE_TIMEOUT_MS = 30_000; // 30 s of no data = stalled CDN

  return new Promise((resolve, reject) => {
    const doRequest = (reqUrl: string) => {
      // FIX (🔴): Previously captured `protocol` from the outer closure, which
      // was always based on the *original* URL. If a redirect crossed http↔https
      // (common with CDN redirects), the wrong Node.js module was used, causing
      // the request to fail or hang. Now we re-derive the module from each URL.
      const proto = reqUrl.startsWith('https') ? https : http;

      const req = proto.get(reqUrl, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} downloading file`));
          return;
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        const out = fs.createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress?.(downloaded, total);
        });

        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        res.on('error', reject);
      });

      // Destroy the request if the socket is idle for too long (stalled CDN)
      req.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => {
        req.destroy(new Error(`RD download stalled — no data for ${SOCKET_IDLE_TIMEOUT_MS / 1000} s`));
      });
      req.on('error', reject);
    };

    doRequest(url);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
