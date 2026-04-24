/**
 * useGlobalRemoteLaunch
 *
 * Listens on the WebSocket remote control channel as a wildcard screen
 * (mediaId=*) and handles 'launch' commands from the phone Browse tab.
 *
 * When the phone taps a title in Browse, it sends:
 *   { type: 'launch', mediaId: '...' }
 *
 * This hook receives that command and navigates the TV browser to the
 * player page for that item — so you can start playback from your phone
 * without touching the PC or TV keyboard.
 *
 * Mounted once in RootLayout so it's always active regardless of which
 * page the TV is on.
 *
 * Reconnect strategy:
 *   - 5-second fixed back-off (launch commands are low-frequency)
 *   - connectRef pattern prevents stale-closure in onclose handler
 *   - destroyedRef suppresses setState / reconnect after unmount
 *   - onerror guards against double-close (onerror fires before onclose)
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function useGlobalRemoteLaunch() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  // Stable ref to connect — avoids stale closure in onclose handler
  const connectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    destroyedRef.current = false;

    const connect = () => {
      if (destroyedRef.current) return;

      // Clear any pending timer before opening a new socket
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
      const lsToken = (() => { try { return localStorage.getItem('hs_token') ?? ''; } catch { return ''; } })();
      const rawToken = cookieToken || lsToken;
      const tokenParam = rawToken ? `&token=${encodeURIComponent(rawToken)}` : '';
      // Register as a wildcard screen so we receive launch commands for any mediaId
      const url = `${protocol}//${window.location.host}/ws/remote?role=screen&mediaId=*${tokenParam}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        if (destroyedRef.current) return;
        try {
          const msg = JSON.parse(e.data) as { type: string; mediaId?: string };
          if (msg.type === 'launch' && msg.mediaId) {
            console.info('[remote] Launch command received — navigating to player:', msg.mediaId);
            navigateRef.current(`/player/${msg.mediaId}`);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (destroyedRef.current) return;
        // Use connectRef so we always schedule the latest connect function
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), 5000);
      };

      // onerror fires before onclose on network drop — just close the socket
      // so onclose handles the reconnect. Guard against double-close.
      ws.onerror = () => {
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          ws.close();
        }
      };
    };

    // Keep connectRef in sync
    connectRef.current = connect;
    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        // Null out onclose before intentional close to prevent a reconnect
        // attempt during teardown (same pattern as useDownloadSocket).
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);
}
