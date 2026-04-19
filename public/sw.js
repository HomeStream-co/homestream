/**
 * HomeStream Service Worker
 *
 * Strategy:
 *  - App shell (HTML, JS, CSS): Cache-first with network fallback
 *  - API requests (/api/*): Network-only (always fresh data)
 *  - Video streams (/api/stream/*): Network-only (too large to cache)
 *  - Static assets: Stale-while-revalidate
 *
 * Offline: Shows cached app shell; API calls fail gracefully in the UI.
 */

const CACHE_NAME = 'homestream-v1';
const OFFLINE_URL = '/';

// Assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls or video streams
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: 'Offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // For navigation requests (HTML pages), try network first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL).then(r => r ?? new Response('Offline', { status: 503 })))
    );
    return;
  }

  // For static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
      return cached ?? networkFetch;
    })
  );
});
