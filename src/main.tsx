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
// "Failed to fetch dynamically imported module" error. Catch it here and
// force a full reload so the new chunks are picked up automatically.
window.addEventListener('error', (event) => {
  const msg = event.message ?? '';
  if (msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed')) {
    console.warn('[HomeStream] Stale chunk detected — reloading to pick up new build…');
    window.location.reload();
  }
});

// Also catch unhandled promise rejections (dynamic import() failures surface here)
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message ?? event.reason ?? '');
  if (msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed')) {
    console.warn('[HomeStream] Stale chunk (promise) detected — reloading…');
    event.preventDefault();
    window.location.reload();
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
