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
import { readConfig } from './configStore.js';
import { isValidSession } from './sessionStore.js';
import { getAllJobs } from './torrentManager.js';
import { getAllTorrents, getTransferInfo, isReachable } from './qbittorrentClient.js';
import { getQbitJobs } from './api/stremio/download/POST.js';
import type { IncomingMessage } from 'http';

const PUSH_INTERVAL_MS = 2_000;

// ── Auth helper (mirrors remoteControl.ts) ────────────────────────────────────

function isAuthed(req: IncomingMessage): boolean {
  const cfg = readConfig();
  if (!cfg.adminPassword) return true; // open mode

  // 1. Query-param token (used by clients that can't set cookies on WS upgrade)
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (token && isValidSession(token)) return true;

  // 2. Cookie
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

  if (!qbitOnline) {
    return { jobs: wtJobs, qbitTorrents: [], transferInfo: null, backend: 'webtorrent', qbitOnline: false };
  }

  try {
    const [qbitTorrents, transferInfo] = await Promise.all([
      getAllTorrents('homestream'),
      getTransferInfo(),
    ]);

    // Merge metadata (title, poster) from our job store into qBit torrent list
    const enriched = qbitTorrents.map((t: Record<string, unknown>) => {
      const meta = qbitJobMeta.find((j: Record<string, unknown>) => j.hash === t.hash);
      return meta ? { ...t, title: meta.title, poster: meta.poster } : t;
    });

    return { jobs: wtJobs, qbitTorrents: enriched, transferInfo, backend: 'qbittorrent', qbitOnline: true };
  } catch {
    return { jobs: wtJobs, qbitTorrents: [], transferInfo: null, backend: 'webtorrent', qbitOnline: false };
  }
}

// ── Broadcaster ───────────────────────────────────────────────────────────────

let _wss: WebSocketServer | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;

function startBroadcast() {
  if (_timer) return;
  _timer = setInterval(async () => {
    if (!_wss) return;
    const clients = [..._wss.clients].filter(c => c.readyState === WebSocket.OPEN);
    if (clients.length === 0) {
      // No clients — pause the interval to save CPU
      stopBroadcast();
      return;
    }
    try {
      const state = await fetchDownloadState();
      const msg = JSON.stringify(state);
      for (const client of clients) {
        try { client.send(msg); } catch { /* ignore dead socket */ }
      }
    } catch { /* ignore fetch errors */ }
  }, PUSH_INTERVAL_MS);
}

function stopBroadcast() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function attachDownloadBroadcaster(server: Server): void {
  if (_wss) return; // already attached

  _wss = new WebSocketServer({ server, path: '/ws/downloads' });

  _wss.on('connection', async (ws, req) => {
    if (!isAuthed(req)) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    // Send current state immediately on connect so the UI doesn't wait 2s
    try {
      const state = await fetchDownloadState();
      ws.send(JSON.stringify(state));
    } catch { /* ignore */ }

    // Start broadcast loop if not already running
    startBroadcast();

    ws.on('close', () => {
      // If no clients remain, the next tick of startBroadcast will self-stop
    });
  });

  console.log('[downloads-ws] WebSocket broadcaster attached at /ws/downloads');
}
