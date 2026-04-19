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
const HistoryPage = lazy(() => import('./pages/history'));

// 404 routing by runtime:
const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : lazy(() => import('./pages/_404'));

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  // /browse redirects to home — kept for backwards-compat with any saved links
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
  { path: '*', element: <NotFoundPage /> },
];

export type Path = '/' | '/movie/:id' | '/show/:id' | '/library' | '/watchlist' | '/player/:id' | '/profiles' | '/discover' | '/downloads' | '/history';
export type Params = Record<string, string | undefined>;
