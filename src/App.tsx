import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';

import RootLayout from './layouts/RootLayout';
import Spinner from './components/Spinner';
import { routes } from './routeDefinitions';

// ── Production error boundary ─────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }

class ProductionErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[HomeStream] Unhandled render error:', err, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-sm">{this.state.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Reload HomeStream
        </button>
      </div>
    );
  }
}

// ── Dev-only tools (never bundled in production) ──────────────────────────────

const AiroErrorBoundary = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/AiroErrorBoundary'))
  : null;

// ── App shell ─────────────────────────────────────────────────────────────────

const SpinnerFallback = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: import.meta.env.DEV && AiroErrorBoundary ? (
      <Suspense fallback={<SpinnerFallback />}>
        <AiroErrorBoundary>
          <Suspense fallback={<SpinnerFallback />}>
            <RootLayout>
              <Outlet />
            </RootLayout>
          </Suspense>
        </AiroErrorBoundary>
      </Suspense>
    ) : (
      <ProductionErrorBoundary>
        <Suspense fallback={<SpinnerFallback />}>
          <RootLayout>
            <Outlet />
          </RootLayout>
        </Suspense>
      </ProductionErrorBoundary>
    ),
    children: routes,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
