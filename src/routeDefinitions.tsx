// @refresh reset
/**
 * Route definitions — lives in its own file so App.tsx can import the
 * routes array without pulling in the lazy-component declarations into
 * a file that also has non-component exports (which breaks Fast Refresh).
 */
import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';

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

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : lazy(() => import('./pages/_404'));

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/browse', element: <HomePage /> },
  { path: '/movies', element: <MoviesPage /> },
  { path: '/movie/:id', element: <MoviePage /> },
  { path: '/library', element: <LibraryPage /> },
  { path: '/shows', element: <ShowsPage /> },
  { path: '/show/:id', element: <ShowPage /> },
  { path: '/watchlist', element: <WatchlistPage /> },
  { path: '/player/:id', element: <PlayerPage /> },
  { path: '/profiles', element: <ProfilesPage /> },
  { path: '/setup', element: <SetupPage /> },
  { path: '/downloads', element: <DownloadsPage /> },
  { path: '/discover', element: <DiscoverPage /> },
  { path: '/history', element: <HistoryPage /> },
  { path: '/https-setup', element: <HttpsSetupPage /> },
  { path: '/remote', element: <RemotePage /> },
  { path: '*', element: <NotFoundPage /> },
];
