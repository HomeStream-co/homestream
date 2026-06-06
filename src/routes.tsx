import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import HomePage from './pages/index';
import ProdNotFoundPage from './pages/_404';

// Lazy-loaded pages for code splitting
const DiscoverPage       = lazy(() => import('./pages/DiscoverPage'));
const LibraryPage        = lazy(() => import('./pages/LibraryPage'));
const DownloadsPage      = lazy(() => import('./pages/DownloadsPage'));
const HistoryPage        = lazy(() => import('./pages/HistoryPage'));
const WatchlistPage      = lazy(() => import('./pages/WatchlistPage'));
const SearchPage         = lazy(() => import('./pages/SearchPage'));
const StatsPage          = lazy(() => import('./pages/StatsPage'));
const PlayerPage         = lazy(() => import('./pages/PlayerPage'));
const SettingsPage       = lazy(() => import('./pages/SettingsPage'));
const ProfilesPage       = lazy(() => import('./pages/ProfilesPage'));
const SchedulePage       = lazy(() => import('./pages/SchedulePage'));
const ActivityPage       = lazy(() => import('./pages/ActivityPage'));
const RemotePage         = lazy(() => import('./pages/RemotePage'));
const SamsungTVPage      = lazy(() => import('./pages/SamsungTVPage'));
const OnboardingPage     = lazy(() => import('./pages/OnboardingPage'));

export const routes: RouteObject[] = [
  { path: '/',            element: <HomePage /> },
  { path: '/discover',    element: <DiscoverPage /> },
  { path: '/library',     element: <LibraryPage /> },
  { path: '/downloads',   element: <DownloadsPage /> },
  { path: '/history',     element: <HistoryPage /> },
  { path: '/watchlist',   element: <WatchlistPage /> },
  { path: '/search',      element: <SearchPage /> },
  { path: '/stats',       element: <StatsPage /> },
  { path: '/player/:id',  element: <PlayerPage /> },
  { path: '/settings',    element: <SettingsPage /> },
  { path: '/profiles',    element: <ProfilesPage /> },
  { path: '/schedule',    element: <SchedulePage /> },
  { path: '/activity',    element: <ActivityPage /> },
  { path: '/remote',      element: <RemotePage /> },
  { path: '/samsung-tv',  element: <SamsungTVPage /> },
  { path: '/onboarding',  element: <OnboardingPage /> },
  { path: '*',            element: <ProdNotFoundPage /> },
];

// Types for type-safe navigation
export type Path =
  | '/'
  | '/discover'
  | '/library'
  | '/downloads'
  | '/history'
  | '/watchlist'
  | '/search'
  | '/stats'
  | `/player/${string}`
  | '/settings'
  | '/profiles'
  | '/schedule'
  | '/activity'
  | '/remote'
  | '/samsung-tv'
  | '/onboarding';

export type Params = Record<string, string | undefined>;
