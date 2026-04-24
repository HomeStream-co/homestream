/**
 * HomeStream Service Worker — TMDB image cache
 *
 * Strategy: Cache-first for TMDB images and local tmdb-images/*.
 * Everything else passes through to the network unchanged.
 *
 * Cache versioning: bump CACHE_VERSION when deploying a breaking change
 * so old caches are evicted on the next activate event.
 *
 * Cached URL patterns:
 *   /tmdb-images/*          — locally mirrored TMDB posters/backdrops
 *   /api/tmdb-proxy?*       — server-side TMDB proxy responses (JSON)
 *   https://image.tmdb.org/* — direct TMDB CDN images (fallback when local copy missing)
 */

const CACHE_VERSION = 'hs-v1';
const IMAGE_CACHE   = `${CACHE_VERSION}-tmdb-images`;
const API_CACHE     = `${CACHE_VERSION}-tmdb-api`;

// Max entries to keep in each cache (LRU eviction via manual trim)
const IMAGE_MAX = 500;
const API_MAX   = 200;

// ── Install: skip waiting so the SW activates immediately ─────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: delete stale caches from previous versions ──────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('hs-') && k !== IMAGE_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Trim a cache to at most maxEntries (oldest first). */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) {
    // Delete oldest entries (keys are in insertion order)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

/** Cache-first: return cached response or fetch + cache. */
async function cacheFirst(request, cacheName, maxEntries) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone before consuming — body can only be read once
      cache.put(request, response.clone());
      trimCache(cacheName, maxEntries); // fire-and-forget
    }
    return response;
  } catch {
    // Offline and not cached — return a transparent 1×1 PNG placeholder
    return new Response(
      // Minimal valid PNG (1×1 transparent pixel)
      new Uint8Array([
        0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
        0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
        0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
        0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
        0x42,0x60,0x82,
      ]),
      { status: 200, headers: { 'Content-Type': 'image/png' } }
    );
  }
}

/** Stale-while-revalidate for TMDB API proxy responses. */
async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cacheName, maxEntries);
    }
    return response;
  }).catch(() => cached); // network failed — fall back to cached

  return cached ?? fetchPromise;
}

// ── Fetch intercept ───────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // 1. Local TMDB mirror images — cache-first, long-lived
  if (url.pathname.startsWith('/tmdb-images/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_MAX));
    return;
  }

  // 2. Direct TMDB CDN images (fallback when local mirror missing)
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_MAX));
    return;
  }

  // 3. TMDB API proxy — stale-while-revalidate (JSON, changes infrequently)
  if (url.pathname.startsWith('/api/tmdb-proxy') || url.pathname.startsWith('/api/tmdb/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, API_MAX));
    return;
  }

  // Everything else — pass through (no SW involvement)
});
