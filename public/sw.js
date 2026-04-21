/**
 * HomeStream Service Worker v2
 *
 * Strategy:
 *  - Remote UI shell (HTML, JS, CSS, icons) → Cache-first with network fallback
 *    so the remote loads instantly on your phone even before the page fully loads.
 *  - API calls, HLS streams, poster images → Network-only (never cache).
 *
 * This means: open HomeStream on your phone, the remote UI appears in <100ms
 * from cache. The actual media data always comes fresh from the server.
 */

const CACHE_NAME = 'homestream-shell-v2';

// Static shell assets to pre-cache on install
const SHELL_URLS = [
  '/remote',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// Never cache these — always go to network
function isUncacheable(url) {
  const u = new URL(url);
  return (
    u.pathname.startsWith('/api/') ||
    u.pathname.startsWith('/ws/') ||
    u.pathname.startsWith('/hls/') ||
    u.pathname.startsWith('/stream/') ||
    u.pathname.includes('.m3u8') ||
    u.pathname.includes('.ts') ||
    u.pathname.includes('.mp4') ||
    u.pathname.includes('.mkv')
  );
}

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(SHELL_URLS).catch(() => { /* ignore individual failures */ })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell, network-only for everything else ────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Never intercept API, streams, or WebSocket upgrades
  if (isUncacheable(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for shell assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Serve from cache immediately, update in background
        fetch(request).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, fresh.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      // Not in cache — fetch and cache it
      return fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
