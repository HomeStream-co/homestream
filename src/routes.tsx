// @refresh reset
import { RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import HomePage from './pages/index';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import Spinner from './components/Spinner';

const MoviePage = lazy(() => import('./pages/movie'));
const MoviesPage = lazy(() => import('./pages/movies'));
const ShowPage = lazy(() => import('./pages/show'));
const LibraryPage = lazy(() => import('./pages/library'));
const PlayerPage = lazy(() => import('./pages/player'));
const ShowsPage = lazy(() => import('./pages/shows'));
const WatchlistPage = lazy(() => import('./pages/watchlist'));
const ProfilesPage = lazy(() => import('./pages/profiles'));
const SetupPage = lazy(() => import('./pages/setup'));
const DownloadsPage = lazy(() => import('./pages/downloads'));
const DiscoverPage = lazy(() => import('./pages/discover'));
const HttpsSetupPage = lazy(() => import('./pages/https-setup'));
const HistoryPage = lazy(() => import('./pages/history'));
const RemotePage = lazy(() => import('./pages/remote'));
const StatsPage  = lazy(() => import('./pages/stats'));
const SamsungTvPage = lazy(() => import('./pages/samsung-tv'));

const NotFoundPage = lazy(() => import('./pages/_404'));

// Fallback is an internal loading spinner — not a public export.
// eslint-disable-next-line react-refresh/only-export-components
const Fallback = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

/** Wrap a lazy page in a per-route error boundary + Suspense */
function route(element: React.ReactNode, name: string): React.ReactNode {
  return (
    <RouteErrorBoundary routeName={name}>
      <Suspense fallback={<Fallback />}>
        {element}
      </Suspense>
    </RouteErrorBoundary>
  );
}

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/browse', element: <HomePage /> },
  { path: '/movies', element: route(<MoviesPage />, 'Movies') },
  { path: '/movie/:id', element: route(<MoviePage />, 'Movie') },
  { path: '/library', element: route(<LibraryPage />, 'Library') },
  { path: '/shows', element: route(<ShowsPage />, 'Shows') },
  { path: '/show/:id', element: route(<ShowPage />, 'Show') },
  { path: '/watchlist', element: route(<WatchlistPage />, 'Watchlist') },
  { path: '/player/:id', element: route(<PlayerPage />, 'Player') },
  { path: '/profiles', element: route(<ProfilesPage />, 'Profiles') },
  { path: '/setup', element: route(<SetupPage />, 'Setup') },
  { path: '/downloads', element: route(<DownloadsPage />, 'Downloads') },
  { path: '/discover', element: route(<DiscoverPage />, 'Discover') },
  { path: '/history', element: route(<HistoryPage />, 'History') },
  { path: '/https-setup', element: route(<HttpsSetupPage />, 'HTTPS Setup') },
  { path: '/remote', element: route(<RemotePage />, 'Remote') },
  { path: '/stats', element: route(<StatsPage />, 'Stats') },
  { path: '/samsung-tv', element: route(<SamsungTvPage />, 'Samsung TV') },
  { path: '*', element: route(<NotFoundPage />, '404') },
];

export type Path = '/' | '/movie/:id' | '/show/:id' | '/library' | '/watchlist' | '/player/:id' | '/profiles' | '/discover' | '/downloads' | '/history';
export type Params = Record<string, string | undefined>;
