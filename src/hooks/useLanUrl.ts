/**
 * useLanUrl
 *
 * Fetches the server's real LAN IP from /api/network/info and returns a
 * helper that converts a relative API path to a full LAN URL.
 *
 * Why this matters: when casting to a TV, the stream URL must use the
 * server's LAN IP (e.g. http://192.168.1.10:3000/api/stream/movie.mp4).
 * If the user opened HomeStream via "localhost", window.location.hostname
 * is "localhost" — the TV can't reach that address.
 *
 * Usage:
 *   const { toLanUrl, lanIp } = useLanUrl();
 *   const castUrl = toLanUrl('/api/stream/movie.mp4');
 *   // → "http://192.168.1.10:3000/api/stream/movie.mp4"
 */

import { useState, useEffect, useCallback } from 'react';

interface NetworkInfo {
  primary: string;
  port: number;
  lanIPs: string[];
  hostname: string;
}

let cachedInfo: NetworkInfo | null = null;
let fetchPromise: Promise<NetworkInfo | null> | null = null;

async function fetchNetworkInfo(): Promise<NetworkInfo | null> {
  if (cachedInfo) return cachedInfo;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/network/info')
    .then(r => r.json() as Promise<NetworkInfo>)
    .then(info => {
      cachedInfo = info;
      fetchPromise = null;
      return info;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });

  return fetchPromise;
}

export function useLanUrl() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(cachedInfo);

  useEffect(() => {
    if (cachedInfo) { setNetworkInfo(cachedInfo); return; }
    fetchNetworkInfo().then(info => { if (info) setNetworkInfo(info); });
  }, []);

  /**
   * Convert a relative path like /api/stream/movie.mp4 to a full LAN URL.
   * Falls back to window.location if network info isn't loaded yet.
   */
  const toLanUrl = useCallback((path: string): string => {
    if (path.startsWith('http')) return path;

    if (networkInfo) {
      const { primary, port } = networkInfo;
      // If the current hostname is already a LAN IP, prefer it (user may have
      // multiple NICs and the one they're using is the right one).
      const host = window.location.hostname !== 'localhost' &&
                   window.location.hostname !== '127.0.0.1'
        ? window.location.hostname
        : primary;
      const p = port !== 80 && port !== 443 ? `:${port}` : '';
      return `http://${host}${p}${path}`;
    }

    // Fallback: use window.location (works if user is already on LAN IP)
    const { protocol, hostname, port } = window.location;
    const p = port ? `:${port}` : '';
    return `${protocol}//${hostname}${p}${path}`;
  }, [networkInfo]);

  return {
    toLanUrl,
    lanIp: networkInfo?.primary ?? null,
    port: networkInfo?.port ?? null,
    networkInfo,
  };
}
