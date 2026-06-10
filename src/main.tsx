import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';
import { connectNotificationStream } from './lib/notificationStore';

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

// Global handler for Vite dynamic import chunk failures (e.g., after an app update)
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('preload-error-reloaded')) {
    console.error('Preload error loop detected. Not reloading.');
    return;
  }
  sessionStorage.setItem('preload-error-reloaded', 'true');
  window.location.reload();
});
if (sessionStorage.getItem('preload-error-reloaded')) {
  sessionStorage.removeItem('preload-error-reloaded');
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
