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
    const url = `${protocol}//${window.location.host}/ws/remote?role=screen&mediaId=${encodeURIComponent(mediaId)}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; position?: number; level?: number; seconds?: number; rate?: number; track?: number };
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
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => { ws.close(); };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
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
