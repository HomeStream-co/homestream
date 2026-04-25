import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './styles/globals.css';

// Add robots meta tag only in development mode
if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

// ── Service Worker — TMDB image cache ────────────────────────────────────────
// Registers sw.js which caches /tmdb-images/* and /api/tmdb-proxy/* so posters
// load instantly offline and don't re-download on every page visit.
// Only registered in production (Electron + published build) to avoid
// stale-cache confusion during development.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[SW] Registered — scope:', reg.scope);
        // Check for updates every hour
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// ── Chunk load error handler ──────────────────────────────────────────────────
// When Vite builds a new version, chunk hashes change. If the Electron app
// has an old version cached and tries to load a stale chunk URL it gets a
// "Failed to fetch dynamically imported module" error.
//
// Strategy:
//  1. On first detection, set a sessionStorage flag + timestamp and reload.
//  2. If we reload and the error fires again within 10s, it's a genuine loop
//     (cache is stuck). Clear sessionStorage flag and stop — don't loop forever.
//  3. After 10s the flag resets so a future legitimate update can still reload.

const CHUNK_RELOAD_KEY = 'hs_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 10_000; // 10 seconds

function isChunkError(msg: string): boolean {
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS for') ||
    msg.includes('error loading dynamically imported module')
  );
}

function handleChunkError(source: string): void {
  const now = Date.now();
  const lastReload = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0', 10);
  if (now - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
    // Already reloaded recently and still erroring — cache is genuinely stuck.
    // Clear the flag and give up so we don't loop. The error boundary will show
    // the crash screen where the user can manually reload.
    console.error(`[HomeStream] ${source}: chunk error persists after reload — stopping auto-reload to prevent loop.`);
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    return;
  }

  console.warn(`[HomeStream] ${source}: stale chunk detected — reloading to pick up new build…`);
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  // Use replace so the back button doesn't loop
  window.location.replace(window.location.href);
}

window.addEventListener('error', (event) => {
  if (isChunkError(event.message ?? '')) handleChunkError('window.error');
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message ?? event.reason ?? '');
  if (isChunkError(msg)) {
    event.preventDefault();
    handleChunkError('unhandledrejection');
  }
});

// Support both client-side navigation and SSR hydration
const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
