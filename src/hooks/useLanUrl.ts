/**
 * useLanUrl
 *
 * Fetches the server's real LAN IP from /api/network/info and returns a
 * helper that converts a relative API path to a full LAN URL.
 *
 * Why this matters: when casting to a TV, the stream URL must use the
 * server's LAN address (e.g. http://hs.local:3000/api/stream/movie.mp4).
 * If the user opened HomeStream via "localhost", window.location.hostname
 * is "localhost" — the TV can't reach that address.
 *
 * URL preference order:
 *   1. hs.local  — mDNS hostname, human-readable, works on all modern devices
 *   2. LAN IP    — fallback for devices without mDNS (older Android, some TVs)
 *   3. window.location — last resort if network info hasn't loaded yet
 *
 * Usage:
 *   const { toLanUrl, lanIp, mdnsHostname } = useLanUrl();
 *   const castUrl = toLanUrl('/api/stream/movie.mp4');
 *   // → "http://hs.local:3000/api/stream/movie.mp4"
 */

import { useState, useEffect, useCallback } from 'react';

interface NetworkInfo {
  primary: string;
  port: number;
  lanIPs: string[];
  hostname: string;
  mdnsHostname: string;   // e.g. "hs.local"
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
   * Prefers hs.local over the raw IP so cast targets get a stable hostname.
   * Falls back to window.location if network info isn't loaded yet.
   */
  const toLanUrl = useCallback((path: string): string => {
    if (path.startsWith('http')) return path;

    if (networkInfo) {
      const { primary, port, mdnsHostname } = networkInfo;

      // If the current browser hostname is already a real LAN address, use it
      // (the user may have multiple NICs and is on the right one already).
      const isLanHost =
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';

      // Prefer hs.local → current LAN hostname → primary IP
      const host = mdnsHostname || (isLanHost ? window.location.hostname : primary);
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
    lanIp:        networkInfo?.primary       ?? null,
    mdnsHostname: networkInfo?.mdnsHostname  ?? null,
    port:         networkInfo?.port          ?? null,
    networkInfo,
  };
}
