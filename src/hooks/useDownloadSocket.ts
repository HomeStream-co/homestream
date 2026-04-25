/**
 * useDownloadSocket — WebSocket-based download state hook.
 *
 * Replaces the 5-second polling loop in Header.tsx with a push-based
 * WebSocket connection to /ws/downloads. The server broadcasts the full
 * download state every 2 seconds while clients are connected.
 *
 * Reconnect strategy:
 *   - Exponential back-off: 1s → 2s → 4s → 8s → 16s (cap 30s)
 *   - Resets to 1s on successful open
 *   - Stops retrying after 10 consecutive failures (server likely offline)
 *   - Cleans up on unmount
 *
 * Falls back gracefully: if the WS connection fails entirely the hook
 * returns an empty state (count=0, no entries) — the UI degrades silently.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DownloadEntry {
  hash: string;
  status: string;
  title?: string;
  name?: string;
  progress?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  size?: number;
  eta?: number;
  poster?: string;
}

export interface DownloadState {
  jobs: DownloadEntry[];
  qbitTorrents: DownloadEntry[];
  transferInfo: unknown;
  backend: 'qbittorrent' | 'webtorrent';
  qbitOnline: boolean;
}

const EMPTY_STATE: DownloadState = {
  jobs: [],
  qbitTorrents: [],
  transferInfo: null,
  backend: 'webtorrent',
  qbitOnline: false,
};

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export function useDownloadSocket(): DownloadState {
  const [state, setState] = useState<DownloadState>(EMPTY_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (retryRef.current >= MAX_RETRIES) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Pass session token as query param so the phone remote (cross-origin LAN)
    // can authenticate — the server's isAuthed() accepts ?token= as well as cookie.
    // Priority: httpOnly cookie (same-origin desktop) → localStorage (phone/TV on LAN).
    const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
    const lsToken = (() => { try { return localStorage.getItem('hs_token') ?? ''; } catch { return ''; } })();
    const rawToken = cookieToken || lsToken;
    const tokenParam = rawToken ? `?token=${encodeURIComponent(rawToken)}` : '';
    const url = `${protocol}//${location.host}/ws/downloads${tokenParam}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0; // reset back-off on success
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as DownloadState;
        setState(data);
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      retryRef.current += 1;
      if (retryRef.current >= MAX_RETRIES) return;
      const delay = Math.min(BASE_DELAY_MS * 2 ** (retryRef.current - 1), MAX_DELAY_MS);
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close(); // triggers onclose → retry
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent retry on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return state;
}

/** Convenience: derive the active download count from socket state */
export function useActiveDownloadCount(): number {
  const { jobs, qbitTorrents } = useDownloadSocket();
  const active =
    jobs.filter(j => j.status === 'downloading' || j.status === 'queued' || j.status === 'transcoding').length +
    qbitTorrents.filter(t => t.status === 'downloading' || t.status === 'queued').length;
  return active;
}
