/**
 * useTMDB — fetches TMDB data from the backend cache.
 *
 * Rules:
 *  - Fetches ONCE on mount. No polling, no intervals.
 *  - Passes library genre IDs so the backend can return personalised recs.
 *  - `refresh()` hits ?refresh=1 to force a new TMDB fetch (Settings button).
 *  - Offline / API-down: returns whatever is in the server-side cache.
 *  - Result is also stored in sessionStorage so navigating back to the home
 *    page doesn't re-fetch within the same browser session.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TMDBMovie } from '@/server/tmdbCache';

export interface TMDBData {
  upcoming: TMDBMovie[];
  trending: TMDBMovie[];
  recommended: TMDBMovie[];
  fetchedAt: number;
  stale: boolean;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
}

const SESSION_KEY = 'homestream-tmdb-session';
const GENRE_MAP: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  'Sci-Fi': 878, Thriller: 53, War: 10752, Western: 37,
};

function genreNamesToIds(names: string[]): number[] {
  const ids = new Set<number>();
  names.forEach(name => {
    const id = GENRE_MAP[name];
    if (id) ids.add(id);
  });
  return Array.from(ids);
}

function loadSession(): Omit<TMDBData, 'loading' | 'error' | 'lastRefreshed'> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(data: Omit<TMDBData, 'loading' | 'error' | 'lastRefreshed'>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

export function useTMDB(libraryGenres: string[] = []) {
  const [state, setState] = useState<TMDBData>(() => {
    const cached = loadSession();
    return {
      upcoming: cached?.upcoming ?? [],
      trending: cached?.trending ?? [],
      recommended: cached?.recommended ?? [],
      fetchedAt: cached?.fetchedAt ?? 0,
      stale: cached?.stale ?? false,
      loading: !cached,   // skip loading spinner if we have session data
      error: null,
      lastRefreshed: cached?.fetchedAt ? new Date(cached.fetchedAt) : null,
    };
  });

  const hasFetched = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const genreIds = genreNamesToIds(libraryGenres);
      const params = new URLSearchParams();
      if (forceRefresh) params.set('refresh', '1');
      if (genreIds.length > 0) params.set('genres', genreIds.join(','));

      const res = await fetch(`/api/tmdb?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Omit<TMDBData, 'loading' | 'error' | 'lastRefreshed'>;

      const next = {
        upcoming: data.upcoming ?? [],
        trending: data.trending ?? [],
        recommended: data.recommended ?? [],
        fetchedAt: data.fetchedAt,
        stale: data.stale ?? false,
        loading: false,
        error: null,
        lastRefreshed: new Date(),
      };
      setState(next);
      saveSession({ ...next });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: String(err),
        stale: true,
      }));
    }
  }, [libraryGenres.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch once on mount (skip if session cache already has data)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    const cached = loadSession();
    if (cached && cached.upcoming.length > 0) return; // session cache is good
    fetchData(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { ...state, refresh };
}
