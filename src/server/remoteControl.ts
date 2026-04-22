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
    c => c.role === 'screen' && (c.mediaId === mediaId || mediaId === '*')
  );
}

function getRemotesForMedia(mediaId: string): Client[] {
  return Array.from(clients.values()).filter(
    c => c.role === 'remote' && (c.mediaId === mediaId || c.mediaId === '*')
  );
}

// ── WebSocket server setup ────────────────────────────────────────────────────

export function attachRemoteControl(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/remote' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // ── Auth check ────────────────────────────────────────────────────────────
    if (!isAuthorised(req)) {
      console.warn('[remote] Rejected unauthenticated WebSocket connection from', req.socket.remoteAddress);
      // Force-close the socket — policy violation (auth required)
      (ws as unknown as { terminate: () => void }).terminate();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const role = (url.searchParams.get('role') ?? 'remote') as ClientRole;
    const mediaId = url.searchParams.get('mediaId') ?? '*';

    const client: Client = { ws, role, mediaId, connectedAt: Date.now() };
    clients.set(ws, client);

    console.log(`[remote] ${role} connected — mediaId=${mediaId} total=${clients.size}`);

    // Send current state to newly connected remote
    if (role === 'remote') {
      const state = latestState.get(mediaId) ?? latestState.get('*');
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
            const state = msg as unknown as PlayerState;
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
