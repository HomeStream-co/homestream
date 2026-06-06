/**
 * useLanUrl
 * Converts a relative app path to an absolute LAN URL so Chromecast / DLNA
 * devices on the same network can reach the HomeStream server directly.
 *
 * In development the server runs on the same host as the browser, so we just
 * use window.location.origin.  In production the server may be on a different
 * port (e.g. 3001) — the VITE_SERVER_ORIGIN env var can override this.
 */
export function useLanUrl() {
  const toLanUrl = (path: string): string => {
    // Already absolute — return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    const origin = window.location.origin;
    const normalised = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${normalised}`;
  };

  return { toLanUrl };
}
