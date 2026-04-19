/**
 * Core context object and hook — split from TMDBContext.tsx so that
 * the provider file is a pure-component file and satisfies Vite Fast Refresh.
 */
import { createContext, useContext } from 'react';
import type { TMDBMovie } from '@/server/tmdbCache';

export interface TMDBState {
  upcoming: TMDBMovie[];
  trending: TMDBMovie[];
  trendingShows: TMDBMovie[];
  recommended: TMDBMovie[];
  fetchedAt: number;
  stale: boolean;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  refresh: () => void;
}

export const TMDBContext = createContext<TMDBState | null>(null);

export function useTMDBContext(): TMDBState {
  const ctx = useContext(TMDBContext);
  if (!ctx) throw new Error('useTMDBContext must be used within TMDBProvider');
  return ctx;
}
