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
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function useGlobalRemoteLaunch() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
      const tokenParam = cookieToken ? `&token=${encodeURIComponent(cookieToken)}` : '';
      // Register as a wildcard screen so we receive launch commands for any mediaId
      const url = `${protocol}//${window.location.host}/ws/remote?role=screen&mediaId=*${tokenParam}`;

      ws = new WebSocket(url);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; mediaId?: string };
          if (msg.type === 'launch' && msg.mediaId) {
            console.log('[remote] Launch command received — navigating to player:', msg.mediaId);
            navigateRef.current(`/player/${msg.mediaId}`);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => { ws?.close(); };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
