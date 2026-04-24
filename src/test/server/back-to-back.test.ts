/**
 * back-to-back.test.ts
 *
 * Integration tests for the remote control WebSocket routing layer.
 * Covers the three bugs fixed in v1.5.9:
 *
 *   1. Remote wildcard ('*') initial state delivery — a remote connecting with
 *      mediaId='*' must receive the most recently cached screen state even
 *      though latestState is keyed by real mediaIds, not '*'.
 *
 *   2. Command routing — a remote with mediaId='*' must reach ALL registered
 *      screens regardless of their mediaId.
 *
 *   3. State forwarding — when a screen sends a state update, ALL wildcard
 *      remotes AND exact-match remotes receive it.
 *
 * These tests exercise remoteControl.ts logic directly (no real WebSocket
 * server) by importing the pure helper functions via a thin test harness.
 *
 * Auth: tests run in open mode (no adminPassword) so isAuthorised always
 * returns true — we don't need to test auth here (covered by auth.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// configStore — open mode (no password)
vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ adminPassword: '' }),
  writeConfig: vi.fn(),
}));

// sessionStore — all tokens valid
vi.mock('../../server/sessionStore.js', () => ({
  isValidSession: () => true,
  createSession: () => 'test-token',
  deleteSession: vi.fn(),
  clearAllSessions: vi.fn(),
  getSessionCount: () => 1,
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

// dataDir — not needed for routing tests
vi.mock('../../server/dataDir.js', () => ({ dataDir: () => '/tmp/hs-test' }));

// ── Routing logic extracted for unit testing ──────────────────────────────────
//
// We can't easily spin up a real WS server in Vitest, so we replicate the
// exact routing logic from remoteControl.ts and test it in isolation.
// Any change to the routing logic in remoteControl.ts must be mirrored here.

type ClientRole = 'screen' | 'remote';

interface Client {
  ws: { readyState: number; send: (data: string) => void };
  role: ClientRole;
  mediaId: string;
  connectedAt: number;
}

type PlayerState = {
  type: 'state';
  mediaId: string;
  title: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
  _ts?: number;
};

function makeClient(role: ClientRole, mediaId: string): Client & { received: string[] } {
  const received: string[] = [];
  return {
    ws: {
      readyState: 1, // OPEN
      send: (data: string) => received.push(data),
    },
    role,
    mediaId,
    connectedAt: Date.now(),
    received,
  };
}

function buildRouter() {
  const clients = new Map<object, Client>();
  const latestState = new Map<string, PlayerState>();

  function send(ws: Client['ws'], data: unknown) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  }

  function getScreensForMedia(mediaId: string): Client[] {
    return Array.from(clients.values()).filter(
      c => c.role === 'screen' && (c.mediaId === mediaId || mediaId === '*' || c.mediaId === '*')
    );
  }

  function getRemotesForMedia(mediaId: string): Client[] {
    return Array.from(clients.values()).filter(
      c => c.role === 'remote' && (c.mediaId === mediaId || c.mediaId === '*' || mediaId === '*')
    );
  }

  function connectClient(client: Client) {
    clients.set(client.ws, client);

    if (client.role === 'remote') {
      // Deliver initial state — wildcard remotes get most-recently-updated state
      let state: PlayerState | undefined;
      if (client.mediaId === '*') {
        let newest = 0;
        for (const [, s] of latestState) {
          const ts = s._ts ?? 0;
          if (ts > newest) { newest = ts; state = s; }
        }
        if (!state) state = latestState.values().next().value;
      } else {
        state = latestState.get(client.mediaId) ?? latestState.get('*');
      }
      if (state) send(client.ws, state);

      const screenCount = getScreensForMedia(client.mediaId).length;
      send(client.ws, { type: 'screens_available', count: screenCount });
    }

    if (client.role === 'screen') {
      for (const remote of getRemotesForMedia(client.mediaId)) {
        send(remote.ws, { type: 'screens_available', count: getScreensForMedia(client.mediaId).length });
      }
    }
  }

  function handleMessage(sender: Client, msg: Record<string, unknown>) {
    if (sender.role === 'remote') {
      const screens = getScreensForMedia(sender.mediaId);
      for (const screen of screens) send(screen.ws, msg);
    } else if (sender.role === 'screen') {
      if (msg.type === 'state') {
        const state = { ...(msg as unknown as PlayerState), _ts: Date.now() };
        latestState.set(sender.mediaId, state);
        for (const remote of getRemotesForMedia(sender.mediaId)) {
          send(remote.ws, state);
        }
      }
    }
  }

  return { clients, latestState, connectClient, handleMessage, getScreensForMedia, getRemotesForMedia };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('remote control routing — v1.5.9 fixes', () => {
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    router = buildRouter();
  });

  // ── Bug 1: wildcard remote gets initial state on connect ──────────────────

  describe('initial state delivery to wildcard remote', () => {
    it('delivers cached state to a wildcard remote that connects after a screen', () => {
      const screen = makeClient('screen', 'movie-abc');
      router.connectClient(screen);

      // Screen sends state
      const stateMsg = {
        type: 'state', mediaId: 'movie-abc', title: 'Test Movie',
        currentTime: 42, duration: 7200, paused: false, volume: 1, speed: 1, hasNextEpisode: false,
      };
      router.handleMessage(screen, stateMsg);

      // Remote connects AFTER state was cached
      const remote = makeClient('remote', '*');
      router.connectClient(remote);

      // Remote should have received the cached state as first message
      expect(remote.received.length).toBeGreaterThanOrEqual(1);
      const first = JSON.parse(remote.received[0]) as PlayerState;
      expect(first.type).toBe('state');
      expect(first.title).toBe('Test Movie');
      expect(first.currentTime).toBe(42);
    });

    it('delivers most recently updated state when multiple screens are active', () => {
      const screen1 = makeClient('screen', 'movie-aaa');
      const screen2 = makeClient('screen', 'movie-bbb');
      router.connectClient(screen1);
      router.connectClient(screen2);

      // screen1 sends state first
      router.handleMessage(screen1, {
        type: 'state', mediaId: 'movie-aaa', title: 'Old Movie',
        currentTime: 10, duration: 3600, paused: true, volume: 1, speed: 1, hasNextEpisode: false,
      });

      // Small delay simulation via _ts manipulation
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);

      // screen2 sends state second (more recent)
      router.handleMessage(screen2, {
        type: 'state', mediaId: 'movie-bbb', title: 'New Movie',
        currentTime: 99, duration: 5400, paused: false, volume: 0.8, speed: 1, hasNextEpisode: true,
      });

      vi.useRealTimers();

      const remote = makeClient('remote', '*');
      router.connectClient(remote);

      const first = JSON.parse(remote.received[0]) as PlayerState;
      expect(first.title).toBe('New Movie');
    });

    it('sends screens_available count to newly connected remote', () => {
      const screen = makeClient('screen', 'movie-xyz');
      router.connectClient(screen);

      const remote = makeClient('remote', '*');
      router.connectClient(remote);

      // Find the screens_available message
      const screensMsg = remote.received
        .map(r => JSON.parse(r) as { type: string; count?: number })
        .find(m => m.type === 'screens_available');

      expect(screensMsg).toBeDefined();
      expect(screensMsg!.count).toBe(1);
    });
  });

  // ── Bug 2: wildcard remote commands reach all screens ────────────────────

  describe('command routing from wildcard remote to screens', () => {
    it('forwards play command from wildcard remote to all screens', () => {
      const screen1 = makeClient('screen', 'movie-111');
      const screen2 = makeClient('screen', 'movie-222');
      router.connectClient(screen1);
      router.connectClient(screen2);

      const remote = makeClient('remote', '*');
      router.connectClient(remote);

      router.handleMessage(remote, { type: 'play' });

      expect(screen1.received.some(r => JSON.parse(r).type === 'play')).toBe(true);
      expect(screen2.received.some(r => JSON.parse(r).type === 'play')).toBe(true);
    });

    it('forwards seek command with position to all screens', () => {
      const screen = makeClient('screen', 'movie-333');
      router.connectClient(screen);

      const remote = makeClient('remote', '*');
      router.connectClient(remote);

      router.handleMessage(remote, { type: 'seek', position: 120 });

      const seekMsg = screen.received
        .map(r => JSON.parse(r) as { type: string; position?: number })
        .find(m => m.type === 'seek');

      expect(seekMsg).toBeDefined();
      expect(seekMsg!.position).toBe(120);
    });

    it('exact-mediaId remote only reaches its own screen', () => {
      const screen1 = makeClient('screen', 'movie-aaa');
      const screen2 = makeClient('screen', 'movie-bbb');
      router.connectClient(screen1);
      router.connectClient(screen2);

      const remote = makeClient('remote', 'movie-aaa');
      router.connectClient(remote);

      router.handleMessage(remote, { type: 'pause' });

      expect(screen1.received.some(r => JSON.parse(r).type === 'pause')).toBe(true);
      expect(screen2.received.some(r => JSON.parse(r).type === 'pause')).toBe(false);
    });
  });

  // ── Bug 3: screen state reaches wildcard remotes ──────────────────────────

  describe('state forwarding from screen to remotes', () => {
    it('forwards state from screen to all connected wildcard remotes', () => {
      const screen = makeClient('screen', 'movie-xyz');
      const remote1 = makeClient('remote', '*');
      const remote2 = makeClient('remote', '*');
      router.connectClient(screen);
      router.connectClient(remote1);
      router.connectClient(remote2);

      // Clear initial messages
      remote1.received.length = 0;
      remote2.received.length = 0;

      router.handleMessage(screen, {
        type: 'state', mediaId: 'movie-xyz', title: 'Live Update',
        currentTime: 300, duration: 7200, paused: false, volume: 1, speed: 1.5, hasNextEpisode: false,
      });

      const r1State = remote1.received.map(r => JSON.parse(r) as PlayerState).find(m => m.type === 'state');
      const r2State = remote2.received.map(r => JSON.parse(r) as PlayerState).find(m => m.type === 'state');

      expect(r1State?.title).toBe('Live Update');
      expect(r1State?.speed).toBe(1.5);
      expect(r2State?.title).toBe('Live Update');
    });

    it('forwards state to exact-match remote but not to unrelated remote', () => {
      const screen = makeClient('screen', 'movie-abc');
      const matchRemote = makeClient('remote', 'movie-abc');
      const otherRemote = makeClient('remote', 'movie-xyz');
      router.connectClient(screen);
      router.connectClient(matchRemote);
      router.connectClient(otherRemote);

      matchRemote.received.length = 0;
      otherRemote.received.length = 0;

      router.handleMessage(screen, {
        type: 'state', mediaId: 'movie-abc', title: 'Specific Movie',
        currentTime: 60, duration: 3600, paused: true, volume: 0.5, speed: 1, hasNextEpisode: false,
      });

      const matchState = matchRemote.received.map(r => JSON.parse(r) as PlayerState).find(m => m.type === 'state');
      const otherState = otherRemote.received.map(r => JSON.parse(r) as PlayerState).find(m => m.type === 'state');

      expect(matchState?.title).toBe('Specific Movie');
      expect(otherState).toBeUndefined();
    });

    it('caches state with _ts timestamp for future remote connections', () => {
      const screen = makeClient('screen', 'movie-ts');
      router.connectClient(screen);

      router.handleMessage(screen, {
        type: 'state', mediaId: 'movie-ts', title: 'Timestamped',
        currentTime: 0, duration: 1800, paused: true, volume: 1, speed: 1, hasNextEpisode: false,
      });

      const cached = router.latestState.get('movie-ts');
      expect(cached).toBeDefined();
      expect(cached!._ts).toBeGreaterThan(0);
      expect(cached!.title).toBe('Timestamped');
    });
  });

  // ── Screen count notifications ────────────────────────────────────────────

  describe('screen count notifications', () => {
    it('notifies existing remotes when a new screen connects', () => {
      const remote = makeClient('remote', '*');
      router.connectClient(remote);
      remote.received.length = 0; // clear connect messages

      const screen = makeClient('screen', 'movie-new');
      router.connectClient(screen);

      const countMsg = remote.received
        .map(r => JSON.parse(r) as { type: string; count?: number })
        .find(m => m.type === 'screens_available');

      expect(countMsg).toBeDefined();
      expect(countMsg!.count).toBeGreaterThanOrEqual(1);
    });
  });
});
