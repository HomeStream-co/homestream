import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';
import { connectNotificationStream } from './lib/notificationStore';

// Auto-reload on stale chunk loading errors (occurs after rebuilds / updates)
if (typeof window !== 'undefined') {
  const handleChunkError = (error: any) => {
    const msg = String(error?.message || error || '');
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Unable to preload CSS for')
    ) {
      const CHUNK_RELOAD_KEY = 'hs_global_chunk_reload_at';
      const CHUNK_RELOAD_COOLDOWN_MS = 10_000;
      const now = Date.now();
      const lastReload = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0', 10);
      if (now - lastReload >= CHUNK_RELOAD_COOLDOWN_MS) {
        console.warn('[HomeStream] Global: stale chunk detected — reloading page…');
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
        window.location.reload();
      }
    }
  };

  window.addEventListener('unhandledrejection', (event) => {
    handleChunkError(event.reason);
  });

  window.addEventListener('error', (event) => {
    handleChunkError(event.error || event.message);
  }, true);
}

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

const tree = (
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}

// Connect to server notification stream (new episodes queued, etc.)
// Runs after mount so it doesn't block hydration.
connectNotificationStream();
