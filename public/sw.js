/**
 * HomeStream Service Worker
 *
 * Minimal stub — enables PWA installability.
 * Full offline caching can be added here in a future update.
 *
 * Currently: pass-through (no caching). The app works fully online
 * on the local network; offline support requires caching strategy
 * decisions (cache-first vs network-first per route type).
 */

const CACHE_NAME = 'homestream-v1';

self.addEventListener('install', () => {
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

// Pass all requests through to the network — no caching yet.
// Video streams must never be cached (they use Range requests).
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
