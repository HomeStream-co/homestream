import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';

const BrowsePage = lazy(() => import('./pages/browse'));
const LibraryPage = lazy(() => import('./pages/library'));
const PlayerPage = lazy(() => import('./pages/player'));

// 404 routing by runtime:
const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : lazy(() => import('./pages/_404'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/browse',
    element: <BrowsePage />,
  },
  {
    path: '/library',
    element: <LibraryPage />,
  },
  {
    path: '/player/:id',
    element: <PlayerPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

export type Path = '/' | '/browse' | '/library' | '/player/:id';
export type Params = Record<string, string | undefined>;
