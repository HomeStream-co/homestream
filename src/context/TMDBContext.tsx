// @refresh reset
/**
 * TMDBProvider — fetches TMDB data once per app session and shares it
 * via TMDBContext. Only the provider component lives here so this file
 * satisfies Vite Fast Refresh (pure-component exports only).
 *
 * Hook + context object: src/context/TMDBContextCore.ts
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { TMDBContext, type TMDBState } from './TMDBContextCore';

// Bump SESSION_VERSION whenever the session shape changes to bust stale caches.
const SESSION_VERSION = 2;
const SESSION_KEY = 'homestream-tmdb-session';

const GENRE_MAP: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  'Sci-Fi': 878, Thriller: 53, War: 10752, Western: 37,
};

function genreNamesToIds(names: string[]): number[] {
  const ids = new Set<number>();
  names.forEach(n => { const id = GENRE_MAP[n]; if (id) ids.add(id); });
  return Array.from(ids);
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed._v ?? 1) < SESSION_VERSION) return null;
    return parsed;
  } catch { return null; }
}

function saveSession(data: object) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, _v: SESSION_VERSION })); } catch { /* quota */ }
}

interface TMDBProviderProps {
  children: ReactNode;
  /** Pass library genres so the backend can personalise recommendations */
  libraryGenres?: string[];
}

export function TMDBProvider({ children, libraryGenres = [] }: TMDBProviderProps) {
  const cached = loadSession();

  const [state, setState] = useState<Omit<TMDBState, 'refresh'>>({
    upcoming: cached?.upcoming ?? [],
    trending: cached?.trending ?? [],
    trendingShows: cached?.trendingShows ?? [],
    recommended: cached?.recommended ?? [],
    fetchedAt: cached?.fetchedAt ?? 0,
    stale: cached?.stale ?? false,
    loading: !cached,
    error: null,
    lastRefreshed: cached?.fetchedAt ? new Date(cached.fetchedAt) : null,
  });

  const hasFetched = useRef(false);
  const genreKey = libraryGenres.join(',');

  const fetchData = useCallback(async (forceRefresh = false) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const genreIds = genreNamesToIds(libraryGenres);
      const params = new URLSearchParams();
      if (forceRefresh) params.set('refresh', '1');
      if (genreIds.length > 0) params.set('genres', genreIds.join(','));

      const res = await fetch(`/api/tmdb?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const next = {
        upcoming: data.upcoming ?? [],
        trending: data.trending ?? [],
        trendingShows: data.trendingShows ?? [],
        recommended: data.recommended ?? [],
        fetchedAt: data.fetchedAt,
        stale: data.stale ?? false,
        loading: false,
        error: null,
        lastRefreshed: new Date(),
      };
      setState(next);
      saveSession(next);
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: String(err), stale: true }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreKey]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    const s = loadSession();
    if (s && s.upcoming?.length > 0 && s.trendingShows?.length > 0) return;
    fetchData(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return (
    <TMDBContext.Provider value={{ ...state, refresh }}>
      {children}
    </TMDBContext.Provider>
  );
}


