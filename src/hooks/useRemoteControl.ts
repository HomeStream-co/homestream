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
  // ── Cast session commands (Chromecast / DLNA) ──────────────────────────────
  /** Phone remote toggled play/pause on the cast session */
  onCastPlayPause?: () => void;
  /** Phone remote stopped the cast session */
  onCastStop?: () => void;
  /** Phone remote seeked within the cast session */
  onCastSeek?: (position: number) => void;
  /** Phone remote changed cast volume (0–1) */
  onCastVolume?: (level: number) => void;
  /**
   * Phone remote started a DLNA cast — screen should update castInfo so the
   * cast session panel appears and the state is broadcast back to the phone.
   */
  onDlnaCastStarted?: (info: { deviceLocation: string; deviceName: string }) => void;
  /** Phone remote stopped a DLNA cast */
  onDlnaCastStopped?: () => void;
  // â”€â”€ D-Pad navigation commands â”€â”€
  onDpadUp?: () => void;
  onDpadDown?: () => void;
  onDpadLeft?: () => void;
  onDpadRight?: () => void;
  onDpadEnter?: () => void;
  onDpadBack?: () => void;
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
    /** UPnP device description URL — present for DLNA casts */
    dlnaDeviceLocation?: string;
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
          const msg = JSON.parse(e.data) as { type: string; position?: number; level?: number; seconds?: number; rate?: number; track?: number; mediaId?: string; deviceLocation?: string; deviceName?: string };
          const h = handlersRef.current;
          switch (msg.type) {
            case 'play':              h.onPlay?.(); break;
            case 'pause':             h.onPause?.(); break;
            case 'seek':              h.onSeek?.(msg.position ?? 0); break;
            case 'volume':            h.onVolume?.(msg.level ?? 1); break;
            case 'skip_forward':      h.onSkipForward?.(msg.seconds ?? 10); break;
            case 'skip_back':         h.onSkipBack?.(msg.seconds ?? 10); break;
            case 'skip_intro':        h.onSkipIntro?.(); break;
            case 'fullscreen':        h.onFullscreen?.(); break;
            case 'next_episode':      h.onNextEpisode?.(); break;
            case 'speed':             h.onSpeed?.(msg.rate ?? 1); break;
            case 'subtitle':          h.onSubtitle?.(msg.track ?? -1); break;
            case 'cast':              h.onCast?.(); break;
            case 'launch':            h.onLaunch?.(msg.mediaId ?? ''); break;
            case 'dpad_up':           h.onDpadUp?.(); break;
            case 'dpad_down':         h.onDpadDown?.(); break;
            case 'dpad_left':         h.onDpadLeft?.(); break;
            case 'dpad_right':        h.onDpadRight?.(); break;
            case 'dpad_enter':        h.onDpadEnter?.(); break;
            case 'dpad_back':         h.onDpadBack?.(); break;
            // Cast session commands — forwarded from phone CastPanel
            case 'cast_playpause':    h.onCastPlayPause?.(); break;
            case 'cast_stop':         h.onCastStop?.(); break;
            case 'cast_seek':         h.onCastSeek?.(msg.position ?? 0); break;
            case 'cast_volume':       h.onCastVolume?.(msg.level ?? 1); break;
            // DLNA cast lifecycle — phone notifies screen of DLNA session state
            case 'dlna_cast_started': h.onDlnaCastStarted?.({ deviceLocation: msg.deviceLocation ?? '', deviceName: msg.deviceName ?? '' }); break;
            case 'dlna_cast_stopped': h.onDlnaCastStopped?.(); break;
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
