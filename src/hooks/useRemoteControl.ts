/**
 * useRemoteControl — player-side WebSocket hook.
 *
 * Registers this player tab as a "screen" with the remote control server.
 * Receives commands from phone remotes and broadcasts player state back.
 *
 * Usage:
 *   const { sendState } = useRemoteControl(mediaId, { onPlay, onPause, onSeek, ... });
 *   // Call sendState() whenever player state changes.
 */
import { useEffect, useRef, useCallback } from 'react';

export interface SubtitleTrack {
  index: number;
  label: string;
  language: string;
}

export interface RemoteHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (position: number) => void;
  onVolume?: (level: number) => void;
  onSkipForward?: (seconds: number) => void;
  onSkipBack?: (seconds: number) => void;
  onSkipIntro?: () => void;
  onFullscreen?: () => void;
  onNextEpisode?: () => void;
  onSpeed?: (rate: number) => void;
  /** track = -1 means off */
  onSubtitle?: (track: number) => void;
  onCast?: () => void;
  /** Launch a specific media item — navigate to its player page */
  onLaunch?: (mediaId: string) => void;
  /**
   * Called immediately when the WebSocket connection opens.
   * Use this to push current player state to the remote so it doesn't
   * show blank (0:00 / 0:00) until the next timeupdate event.
   */
  onOpen?: () => void;
}

export interface PlayerStatePayload {
  mediaId: string;
  title: string;
  /** Poster image URL — shown on the phone remote */
  poster?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitle?: number;
  cast?: {
    active: boolean;
    deviceName?: string;
    isPaused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
  };
}

export function useRemoteControl(
  mediaId: string | undefined,
  handlers: RemoteHandlers,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!mediaId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Pass session token as query param for environments where cookies
    // may not be forwarded (e.g. phone remote on LAN).
    // Prefer cookie token; fall back to localStorage Bearer token (used by phone remote).
    const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
    const lsToken = typeof localStorage !== 'undefined' ? (localStorage.getItem('hs_token') ?? '') : '';
    const token = cookieToken || lsToken;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${window.location.host}/ws/remote?role=screen&mediaId=${encodeURIComponent(mediaId)}${tokenParam}`;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let retryCount = 0;
    const BASE_DELAY_MS = 3_000;
    const MAX_DELAY_MS = 30_000;
    // Stable ref so onclose always calls the latest connect, not a stale closure
    let connectFn: (() => void) | null = null;

    const connect = () => {
      if (destroyed) return;

      // Clear any pending timer before opening a new socket
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0; // reset back-off on successful connection
        // Push current player state immediately so the phone remote doesn't
        // show blank (0:00 / 0:00) until the next timeupdate event.
        handlersRef.current.onOpen?.();
      };

      ws.onmessage = (e) => {
        if (destroyed) return;
        try {
          const msg = JSON.parse(e.data) as { type: string; position?: number; level?: number; seconds?: number; rate?: number; track?: number; mediaId?: string };
          const h = handlersRef.current;
          switch (msg.type) {
            case 'play':         h.onPlay?.(); break;
            case 'pause':        h.onPause?.(); break;
            case 'seek':         h.onSeek?.(msg.position ?? 0); break;
            case 'volume':       h.onVolume?.(msg.level ?? 1); break;
            case 'skip_forward': h.onSkipForward?.(msg.seconds ?? 10); break;
            case 'skip_back':    h.onSkipBack?.(msg.seconds ?? 10); break;
            case 'skip_intro':   h.onSkipIntro?.(); break;
            case 'fullscreen':   h.onFullscreen?.(); break;
            case 'next_episode': h.onNextEpisode?.(); break;
            case 'speed':        h.onSpeed?.(msg.rate ?? 1); break;
            case 'subtitle':     h.onSubtitle?.(msg.track ?? -1); break;
            case 'cast':         h.onCast?.(); break;
            case 'launch':       h.onLaunch?.(msg.mediaId ?? ''); break;
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!destroyed) {
          // Exponential back-off: 3s → 6s → 12s → … → 30s cap
          retryCount += 1;
          const delay = Math.min(BASE_DELAY_MS * 2 ** (retryCount - 1), MAX_DELAY_MS);
          // Use connectFn ref so we always schedule the latest connect,
          // not the stale closure captured when this ws instance was created.
          reconnectTimer = setTimeout(() => connectFn?.(), delay);
        }
      };

      // onerror fires before onclose on network drop — close the socket so
      // onclose handles the reconnect. Guard against double-close.
      ws.onerror = () => {
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          ws.close();
        }
      };
    };

    connectFn = connect;
    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        // Null out onclose before intentional close to prevent a reconnect
        // attempt during teardown.
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mediaId]);

  const sendState = useCallback((state: PlayerStatePayload) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'state', ...state }));
    }
  }, []);

  return { sendState };
}
