import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';

const BrowsePage = lazy(() => import('./pages/browse'));
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

// 404 routing by runtime:
const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : lazy(() => import('./pages/_404'));

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/browse', element: <BrowsePage /> },
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
  { path: '*', element: <NotFoundPage /> },
];

export type Path = '/' | '/browse' | '/movie/:id' | '/library' | '/shows' | '/watchlist' | '/player/:id' | '/profiles';
export type Params = Record<string, string | undefined>;
