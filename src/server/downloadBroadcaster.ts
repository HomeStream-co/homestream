/**
 * downloadBroadcaster — WebSocket push for live download state.
 *
 * Attaches a WSS at /ws/downloads on the existing HTTP server.
 * Every 2 seconds it fetches the unified download state (same data as
 * GET /api/stremio/downloads) and broadcasts it to all connected clients.
 * The interval only runs while at least one client is connected.
 *
 * Auth: same session-cookie / open-mode logic as remoteControl.ts.
 * Unauthenticated connections receive a 4401 close frame and are dropped.
 *
 * Client usage:
 *   const ws = new WebSocket(`ws://${location.host}/ws/downloads`);
 *   ws.onmessage = e => { const data = JSON.parse(e.data); ... };
 *
 * Message shape mirrors GET /api/stremio/downloads:
 *   { jobs, qbitTorrents, transferInfo, backend, qbitOnline }
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { readConfig } from './configStore.js';
import { isValidSession } from './sessionStore.js';
import { getAllJobs } from './torrentManager.js';
import { getAllTorrents, getTransferInfo, isReachable } from './qbittorrentClient.js';
// getQbitJobs — provided by the stremio download handler once that module exists.
// Stub here so the broadcaster compiles without the full API route tree.
function getQbitJobs(): Array<{ infoHash: string; title?: string; poster?: string }> { return []; }
import { getAllPersistedJobs } from './downloadJobStore.js';
import type { QbitTorrent } from './qbittorrentClient.js';

const PUSH_INTERVAL_MS = 2_000;
// Keepalive: ping every 25 s, terminate if no pong received before next ping.
// Mirrors the same strategy used in remoteControl.ts.
const PING_INTERVAL_MS = 25_000;

// ── Auth helper (mirrors remoteControl.ts) ────────────────────────────────────

function isAuthed(req: IncomingMessage): boolean {
  const cfg = readConfig();
  if (!cfg.adminPassword) return true; // open mode

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (token && isValidSession(token)) return true;

  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)hs_session=([^;]+)/);
  if (match && isValidSession(match[1])) return true;

  return false;
}

// ── Fetch current download state ──────────────────────────────────────────────

async function fetchDownloadState(): Promise<object> {
  const wtJobs = getAllJobs();
  const qbitJobMeta = getQbitJobs();
  const qbitOnline = await isReachable();

  // Real-Debrid jobs — always included regardless of qBit status
  const rdJobs = getAllPersistedJobs().filter(j => j.backend === 'real-debrid');

  if (!qbitOnline) {
    return { jobs: wtJobs, qbitTorrents: [], transferInfo: null, backend: 'webtorrent', qbitOnline: false, rdJobs };
  }

  try {
    const [qbitTorrents, transferInfo] = await Promise.all([
      getAllTorrents('homestream'),
      getTransferInfo(),
    ]);

    // Merge metadata (title, poster) from our job store into qBit torrent list
    const enriched = (qbitTorrents as QbitTorrent[]).map(t => {
      const meta = qbitJobMeta.find((j: { infoHash: string; title?: string; poster?: string }) => j.infoHash === t.hash);
      return meta ? { ...t, title: meta.title, poster: meta.poster } : t;
    });

    return { jobs: wtJobs, qbitTorrents: enriched, transferInfo, backend: 'qbittorrent', qbitOnline: true, rdJobs };
  } catch {
    return { jobs: wtJobs, qbitTorrents: [], transferInfo: null, backend: 'webtorrent', qbitOnline: false, rdJobs };
  }
}

// ── Broadcaster ───────────────────────────────────────────────────────────────

let _wss: WebSocketServer | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;
let _pingTimer: ReturnType<typeof setInterval> | null = null;
const _clients = new Set<WebSocket>();

function startBroadcast() {
  if (_timer) return;
  _timer = setInterval(async () => {
    if (_clients.size === 0) {
      stopBroadcast();
      return;
    }
    try {
      const state = await fetchDownloadState();
      const msg = JSON.stringify(state);
      for (const client of _clients) {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(msg); } catch { /* ignore dead socket */ }
        }
      }
    } catch { /* ignore fetch errors */ }
  }, PUSH_INTERVAL_MS);
}

function stopBroadcast() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function startPing() {
  if (_pingTimer) return;
  _pingTimer = setInterval(() => {
    for (const ws of _clients) {
      const alive = (ws as unknown as { isAlive?: boolean }).isAlive;
      if (alive === false) {
        // No pong since last ping — zombie connection, terminate it
        _clients.delete(ws);
        (ws as unknown as { terminate: () => void }).terminate();
        continue;
      }
      (ws as unknown as { isAlive: boolean }).isAlive = false;
      (ws as unknown as { ping: () => void }).ping();
    }
    if (_clients.size === 0) stopPing();
  }, PING_INTERVAL_MS);
}

function stopPing() {
  if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function attachDownloadBroadcaster(server: Server): void {
  if (_wss) return; // already attached

  _wss = new WebSocketServer({ server, path: '/ws/downloads' });

  _wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    if (!isAuthed(req)) {
      // Send 4001 so clients know this is an auth failure (not a network drop)
      // and can clear their stored token / show a login gate.
      // Mirrors the same code used in remoteControl.ts.
      (ws.close as (code: number, reason: string) => void)(4001, 'Unauthorized');
      return;
    }

    // Mark alive on connect; update on every pong response
    (ws as unknown as { isAlive: boolean }).isAlive = true;
    ws.on('pong', () => { (ws as unknown as { isAlive: boolean }).isAlive = true; });

    _clients.add(ws);

    // Send current state immediately so the UI doesn't wait 2s
    try {
      const state = await fetchDownloadState();
      ws.send(JSON.stringify(state));
    } catch { /* ignore */ }

    // Start broadcast + keepalive loops if not already running
    startBroadcast();
    startPing();

    ws.on('close', () => {
      _clients.delete(ws);
      if (_clients.size === 0) { stopBroadcast(); stopPing(); }
    });

    ws.on('error', () => {
      _clients.delete(ws);
      if (_clients.size === 0) { stopBroadcast(); stopPing(); }
    });
  });

  // Clean up intervals on server close (test teardown / graceful shutdown)
  _wss.on('close', () => { stopBroadcast(); stopPing(); });

  console.log('[downloads-ws] WebSocket broadcaster attached at /ws/downloads');
}
