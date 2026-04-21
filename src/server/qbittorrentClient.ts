/**
 * qBittorrentClient — REST API wrapper for qBittorrent Web UI
 *
 * qBittorrent exposes a full REST API at /api/v2/
 * Docs: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 *
 * Auth flow:
 *   POST /api/v2/auth/login  → sets SID cookie
 *   All subsequent requests include the SID cookie
 *   Session auto-renews on 403 (cookie expired)
 */

// No #airo/secrets — reads from process.env directly for full portability

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QbitTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;       // 0.0–1.0
  dlspeed: number;        // bytes/s
  upspeed: number;        // bytes/s
  num_seeds: number;
  num_leechs: number;
  eta: number;            // seconds
  state: string;          // downloading, seeding, pausedDL, stalledDL, etc.
  save_path: string;
  content_path: string;   // full path to the downloaded file/folder
  category: string;
  tags: string;
  added_on: number;       // unix timestamp
  completion_on: number;  // unix timestamp (-1 if not complete)
  ratio: number;
}

export interface QbitAddOptions {
  /** Save path on the qBittorrent host */
  savepath?: string;
  /** Category tag */
  category?: string;
  /** Tags (comma-separated) */
  tags?: string;
  /** Rename the torrent */
  rename?: string;
  /** Pause immediately after adding */
  paused?: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

function getQbitUrl(): string {
  return process.env.QBIT_URL || 'http://localhost:8080';
}

function getCredentials(): { username: string; password: string } {
  const u = process.env.QBIT_USERNAME ?? 'admin';
  const p = process.env.QBIT_PASSWORD ?? 'homestream';
  return {
    username: typeof u === 'string' ? u : 'admin',
    password: typeof p === 'string' ? p : 'homestream',
  };
}

// ─── Session management ───────────────────────────────────────────────────────

let sessionCookie: string | null = null;
let loginPromise: Promise<void> | null = null;

async function login(): Promise<void> {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const { username, password } = getCredentials();
    const url = `${getQbitUrl()}/api/v2/auth/login`;

    const body = new URLSearchParams({ username, password });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    if (text !== 'Ok.') {
      throw new Error(`qBittorrent login failed: ${text}`);
    }

    // Extract SID cookie
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/SID=([^;]+)/);
      if (match) sessionCookie = `SID=${match[1]}`;
    }

    console.log('[qbit] Logged in successfully');
  })().finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  if (!sessionCookie) await login();

  const res = await fetch(`${getQbitUrl()}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: sessionCookie ?? '',
    },
    signal: AbortSignal.timeout(15_000),
  });

  // Session expired — re-login once
  if (res.status === 403 && !retried) {
    sessionCookie = null;
    await login();
    return request<T>(path, options, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`qBittorrent API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Test connection to qBittorrent. Returns version string on success.
 */
export async function testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    await login();
    const version = await request<string>('/api/v2/app/version');
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Add a magnet link to qBittorrent.
 * Returns the torrent hash (lowercase).
 */
export async function addMagnet(magnet: string, opts: QbitAddOptions = {}): Promise<string> {
  const body = new URLSearchParams();
  body.append('urls', magnet);

  if (opts.savepath) body.append('savepath', opts.savepath);
  if (opts.category) body.append('category', opts.category);
  if (opts.tags) body.append('tags', opts.tags);
  if (opts.rename) body.append('rename', opts.rename);
  if (opts.paused) body.append('paused', 'true');

  await request('/api/v2/torrents/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  // Extract hash from magnet URI
  const hashMatch = magnet.match(/urn:btih:([a-fA-F0-9]{40})/i);
  return hashMatch ? hashMatch[1].toLowerCase() : '';
}

/**
 * Get info for a specific torrent by hash.
 */
export async function getTorrent(hash: string): Promise<QbitTorrent | null> {
  const list = await request<QbitTorrent[]>(
    `/api/v2/torrents/info?hashes=${hash.toLowerCase()}`
  );
  return list[0] ?? null;
}

/**
 * Get all torrents, optionally filtered by category.
 */
export async function getAllTorrents(category?: string): Promise<QbitTorrent[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return request<QbitTorrent[]>(`/api/v2/torrents/info${params}`);
}

/**
 * Delete a torrent (and optionally its files).
 */
export async function deleteTorrent(hash: string, deleteFiles = false): Promise<void> {
  const body = new URLSearchParams({
    hashes: hash.toLowerCase(),
    deleteFiles: deleteFiles ? 'true' : 'false',
  });
  await request('/api/v2/torrents/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Pause a torrent.
 */
export async function pauseTorrent(hash: string): Promise<void> {
  const body = new URLSearchParams({ hashes: hash.toLowerCase() });
  await request('/api/v2/torrents/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Resume a paused torrent.
 */
export async function resumeTorrent(hash: string): Promise<void> {
  const body = new URLSearchParams({ hashes: hash.toLowerCase() });
  await request('/api/v2/torrents/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Set download speed limit (bytes/s, 0 = unlimited).
 */
export async function setSpeedLimit(downloadLimit: number, uploadLimit = 0): Promise<void> {
  const body = new URLSearchParams({
    limit: downloadLimit.toString(),
  });
  await request('/api/v2/transfer/setDownloadLimit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (uploadLimit >= 0) {
    const upBody = new URLSearchParams({ limit: uploadLimit.toString() });
    await request('/api/v2/transfer/setUploadLimit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: upBody.toString(),
    });
  }
}

/**
 * Get global transfer info (speeds, session totals).
 */
export async function getTransferInfo(): Promise<{
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
  connection_status: string;
}> {
  return request('/api/v2/transfer/info');
}

/**
 * Check if qBittorrent is reachable (no auth needed).
 */
export async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${getQbitUrl()}/api/v2/app/version`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.status !== 0;
  } catch {
    return false;
  }
}
