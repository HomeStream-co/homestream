/**
 * remoteControl — WebSocket-based phone remote control.
 *
 * Architecture:
 *   - "screen" clients: browser tabs running the player (register with type=screen)
 *   - "remote" clients: phone/tablet running /remote page (register with type=remote)
 *
 * Message flow:
 *   remote → server → screen  (commands: play, pause, seek, volume, skip, fullscreen)
 *   screen → server → remote  (state: currentTime, duration, paused, volume, title)
 *
 * Rooms: mediaId-based so multiple screens can be controlled independently.
 * If no mediaId is provided, the remote controls the most recently active screen.
 *
 * Auth:
 *   Connections must supply a valid session token via the `token` query param
 *   OR via the `hs_session` cookie in the upgrade request headers.
 *   If no admin password is configured (open mode), all connections are allowed.
 *   Unauthenticated connections receive a 401 close frame and are dropped.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { readConfig } from './configStore.js';
import { isValidSession } from './sessionStore.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; position: number }
  | { type: 'volume'; level: number }
  | { type: 'skip_intro' }
  | { type: 'skip_forward'; seconds: number }
  | { type: 'skip_back'; seconds: number }
  | { type: 'fullscreen' }
  | { type: 'next_episode' }
  | { type: 'speed'; rate: number };

export type PlayerState = {
  type: 'state';
  mediaId: string;
  title: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
};

type ClientRole = 'screen' | 'remote';

interface Client {
  ws: WebSocket;
  role: ClientRole;
  mediaId: string;
  connectedAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const clients = new Map<WebSocket, Client>();

// Latest known player state per mediaId — sent to remotes on connect
const latestState = new Map<string, PlayerState>();

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Returns true if the WebSocket upgrade request is authenticated.
 * Checks (in order):
 *   1. Open mode — no admin password configured → always allowed
 *   2. `token` query param — used by the /remote page (can't set cookies cross-origin)
 *   3. `hs_session` cookie — used by the player page (same origin)
 */
function isAuthorised(req: IncomingMessage): boolean {
  const cfg = readConfig();
  const adminPassword = cfg.adminPassword || '';

  // Open mode — no password set
  if (!adminPassword) return true;

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  // 1. Token query param (phone remote — different origin, can't send cookies)
  const tokenParam = url.searchParams.get('token');
  if (tokenParam && isValidSession(tokenParam)) return true;

  // 2. Cookie (player page — same origin)
  const cookieHeader = req.headers.cookie ?? '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)hs_session=([^;]+)/);
  if (cookieMatch) {
    const cookieToken = decodeURIComponent(cookieMatch[1]);
    if (isValidSession(cookieToken)) return true;
  }

  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getScreensForMedia(mediaId: string): Client[] {
  return Array.from(clients.values()).filter(
    // mediaId='*' from a remote means "control all screens"
    c => c.role === 'screen' && (c.mediaId === mediaId || mediaId === '*' || c.mediaId === '*')
  );
}

function getRemotesForMedia(mediaId: string): Client[] {
  return Array.from(clients.values()).filter(
    // Always include wildcard remotes ('*') + exact mediaId matches
    c => c.role === 'remote' && (c.mediaId === mediaId || c.mediaId === '*' || mediaId === '*')
  );
}

// ── WebSocket server setup ────────────────────────────────────────────────────

export function attachRemoteControl(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/remote' });

  // ── Server-side keepalive ping ─────────────────────────────────────────────
  // Most routers and managed/corporate Wi-Fi networks kill idle TCP connections
  // after 30–60 s. Without a heartbeat the phone remote shows "connection lost"
  // in a loop even though the server is healthy.
  // Strategy: ping every 25 s; if a client hasn't responded to the previous
  // ping by the time the next one fires, terminate it (it's a zombie).
  const PING_INTERVAL_MS = 25_000;

  const pingInterval = setInterval(() => {
    for (const [ws] of clients) {
      const c = clients.get(ws);
      if (!c) continue;
      if ((ws as unknown as { isAlive?: boolean }).isAlive === false) {
        // No pong received since last ping — connection is dead
        console.log(`[remote] Terminating unresponsive ${c.role} client`);
        (ws as unknown as { terminate: () => void }).terminate();
        continue;
      }
      (ws as unknown as { isAlive: boolean }).isAlive = false;
      (ws as unknown as { ping: () => void }).ping();
    }
  }, PING_INTERVAL_MS);

  // Stop the interval when the server closes (clean shutdown / test teardown)
  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // ── Auth check ────────────────────────────────────────────────────────────
    if (!isAuthorised(req)) {
      console.warn('[remote] Rejected unauthenticated WebSocket connection from', req.socket.remoteAddress);
      // Send close code 4001 so the client knows this is an auth failure
      // (not a network drop) and can clear its stored token + show login gate.
      ws.close(4001, 'Unauthorized');
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const role = (url.searchParams.get('role') ?? 'remote') as ClientRole;
    const mediaId = url.searchParams.get('mediaId') ?? '*';

    const client: Client = { ws, role, mediaId, connectedAt: Date.now() };
    clients.set(ws, client);

    // Mark alive on connect and on every pong response
    (ws as unknown as { isAlive: boolean }).isAlive = true;
    ws.on('pong', () => { (ws as unknown as { isAlive: boolean }).isAlive = true; });

    console.log(`[remote] ${role} connected — mediaId=${mediaId} total=${clients.size}`);

    // Send current state to newly connected remote.
    // A remote connecting with mediaId='*' should receive the most recently
    // active screen state (any mediaId), not just a literal '*' key lookup.
    if (role === 'remote') {
      let state: PlayerState | undefined;
      if (mediaId === '*') {
        // Pick the most recently updated state across all screens
        let newest = 0;
        for (const [, s] of latestState) {
          const ts = (s as PlayerState & { _ts?: number })._ts ?? 0;
          if (ts > newest) { newest = ts; state = s; }
        }
        // Fallback: just grab the first entry if no timestamps present
        if (!state) state = latestState.values().next().value;
      } else {
        state = latestState.get(mediaId) ?? latestState.get('*');
      }
      if (state) send(ws, state);

      // Tell remote how many screens are active
      const screenCount = getScreensForMedia(mediaId).length;
      send(ws, { type: 'screens_available', count: screenCount });
    }

    // Notify remotes that a new screen is available
    if (role === 'screen') {
      for (const remote of getRemotesForMedia(mediaId)) {
        send(remote.ws, { type: 'screens_available', count: getScreensForMedia(mediaId).length });
      }
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse((raw as Buffer).toString()) as Record<string, unknown>;
        const c = clients.get(ws);
        if (!c) return;

        if (c.role === 'remote') {
          // Remote → forward command to all matching screens
          const screens = getScreensForMedia(c.mediaId);
          for (const screen of screens) send(screen.ws, msg);

        } else if (c.role === 'screen') {
          // Screen → state update → cache + forward to remotes
          if (msg.type === 'state') {
            const state = { ...(msg as unknown as PlayerState), _ts: Date.now() };
            latestState.set(c.mediaId, state);
            for (const remote of getRemotesForMedia(c.mediaId)) {
              send(remote.ws, state);
            }
          }
        }
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      const c = clients.get(ws);
      clients.delete(ws);
      if (!c) return;

      console.log(`[remote] ${c.role} disconnected — total=${clients.size}`);

      // Notify remotes that screen count changed
      if (c.role === 'screen') {
        for (const remote of getRemotesForMedia(c.mediaId)) {
          send(remote.ws, { type: 'screens_available', count: getScreensForMedia(c.mediaId).length });
        }
      }
    });

    ws.on('error', () => { clients.delete(ws); });
  });

  return wss;
}
