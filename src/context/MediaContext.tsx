/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { MediaItem } from '@/types/media';
import { useProfile } from '@/context/ProfileContext';

interface ContinueWatchingItem {
  id: string;
  progress: number;
  lastWatchedAt?: string;
  totalSeconds?: number;
}

interface MediaContextType {
  library: MediaItem[];
  loading: boolean;
  watchlist: string[];
  continueWatching: ContinueWatchingItem[];
  pendingRecommendation: string | null;
  refreshLibrary: () => Promise<void>;
  addToWatchlist: (id: string) => void;
  removeFromWatchlist: (id: string) => void;
  updateProgress: (id: string, progress: number, currentTime?: number, duration?: number) => void;
  deleteMedia: (id: string) => Promise<void>;
  updateMedia: (id: string, updates: Partial<MediaItem>) => Promise<void>;
  triggerPostWatchRecommendation: (id: string) => void;
  clearPendingRecommendation: () => void;
}

const MediaContext = createContext<MediaContextType | null>(null);

export function MediaProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRecommendation, setPendingRecommendation] = useState<string | null>(null);

  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? 'adult';

  const progressKey = `homestream-progress-${profileId}`;
  const watchlistKey = `homestream-watchlist-${profileId}`;
  const etagKey = `homestream-etag-${profileId}`;
  const libraryEtagRef = useRef<string | null>(null);

  useEffect(() => {
    libraryEtagRef.current = localStorage.getItem(etagKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`homestream-watchlist-${profileId}`) || '[]'); }
    catch { return []; }
  });

  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(`homestream-progress-${profileId}`) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    fetch(`/api/watchlist?profile=${encodeURIComponent(profileId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<string[]> : Promise.reject())
      .then(ids => {
        setWatchlist(ids);
        localStorage.setItem(watchlistKey, JSON.stringify(ids));
      })
      .catch(() => { /* keep localStorage value */ });
  }, [profileId, watchlistKey]);

  const refreshLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const headers: HeadersInit = {};
      const cachedEtag = libraryEtagRef.current;
      if (cachedEtag) headers['If-None-Match'] = cachedEtag;

      const res = await fetch(`/api/media?profile=${profileId}`, { headers, credentials: 'include' });

      if (res.status === 304) { setLoading(false); return; }

      if (res.ok) {
        const newEtag = res.headers.get('ETag');
        if (newEtag) {
          libraryEtagRef.current = newEtag;
          localStorage.setItem(etagKey, newEtag);
        }
        const data = await res.json() as MediaItem[];
        setLibrary(data);
        const serverProgress: ContinueWatchingItem[] = data
          .filter(m => m.watchProgress && m.watchProgress > 2 && m.watchProgress < 95)
          .sort((a, b) => {
            const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
            const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
            return tb - ta;
          })
          .map(m => ({ id: m.id, progress: m.watchProgress!, lastWatchedAt: m.lastWatchedAt, totalSeconds: m.totalSeconds }));
        if (serverProgress.length > 0) {
          setContinueWatching(serverProgress);
          localStorage.setItem(progressKey, JSON.stringify(serverProgress));
        } else {
          setContinueWatching([]);
          localStorage.removeItem(progressKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch library:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, progressKey, etagKey]);

  useEffect(() => { refreshLibrary(); }, [refreshLibrary]);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(progressKey) || '[]') as ContinueWatchingItem[];
      setContinueWatching(cached);
    } catch { /* ignore */ }
    try {
      const cachedWl = JSON.parse(localStorage.getItem(watchlistKey) || '[]') as string[];
      setWatchlist(cachedWl);
    } catch { /* ignore */ }
  }, [progressKey, watchlistKey]);

  const addToWatchlist = useCallback((id: string) => {
    setWatchlist(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem(watchlistKey, JSON.stringify(next));
      return next;
    });
    fetch(`/api/watchlist/${id}?profile=${encodeURIComponent(profileId)}`, { method: 'PUT', credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ watchlist: string[] }> : Promise.reject())
      .then(({ watchlist: serverList }) => {
        setWatchlist(serverList);
        localStorage.setItem(watchlistKey, JSON.stringify(serverList));
      })
      .catch(() => {
        setWatchlist(prev => {
          const reverted = prev.filter(w => w !== id);
          localStorage.setItem(watchlistKey, JSON.stringify(reverted));
          return reverted;
        });
      });
  }, [profileId, watchlistKey]);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist(prev => {
      const next = prev.filter(w => w !== id);
      localStorage.setItem(watchlistKey, JSON.stringify(next));
      return next;
    });
    fetch(`/api/watchlist/${id}?profile=${encodeURIComponent(profileId)}`, { method: 'DELETE', credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ watchlist: string[] }> : Promise.reject())
      .then(({ watchlist: serverList }) => {
        setWatchlist(serverList);
        localStorage.setItem(watchlistKey, JSON.stringify(serverList));
      })
      .catch(() => {
        setWatchlist(prev => {
          const reverted = [...prev, id];
          localStorage.setItem(watchlistKey, JSON.stringify(reverted));
          return reverted;
        });
      });
  }, [profileId, watchlistKey]);

  const updateProgress = useCallback((id: string, progress: number, currentTime?: number, duration?: number) => {
    const isComplete = progress >= 95;
    const now = new Date().toISOString();
    setContinueWatching(prev => {
      let next: ContinueWatchingItem[];
      if (isComplete) {
        next = prev.filter(c => c.id !== id);
      } else {
        const existing = prev.findIndex(c => c.id === id);
        if (existing >= 0) {
          next = [...prev];
          next[existing] = { id, progress, lastWatchedAt: now, totalSeconds: duration };
        } else {
          next = [...prev, { id, progress, lastWatchedAt: now, totalSeconds: duration }];
        }
      }
      localStorage.setItem(progressKey, JSON.stringify(next));
      return next;
    });
    fetch(`/api/media/${id}/progress`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress, currentTime, duration, profileId }),
    }).catch(console.error);
  }, [profileId, progressKey]);

  const triggerPostWatchRecommendation = useCallback((id: string) => {
    setPendingRecommendation(id);
  }, []);

  const clearPendingRecommendation = useCallback(() => {
    setPendingRecommendation(null);
  }, []);

  const deleteMedia = useCallback(async (id: string) => {
    await fetch(`/api/media/${id}`, { method: 'DELETE', credentials: 'include' });
    setLibrary(prev => prev.filter(m => m.id !== id));
    removeFromWatchlist(id);
  }, [removeFromWatchlist]);

  const updateMedia = useCallback(async (id: string, updates: Partial<MediaItem>) => {
    const res = await fetch(`/api/media/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setLibrary(prev => prev.map(m => m.id === id ? updated : m));
    }
  }, []);

  const contextValue = useMemo(() => ({
    library, loading, watchlist, continueWatching, pendingRecommendation,
    refreshLibrary, addToWatchlist, removeFromWatchlist, updateProgress,
    deleteMedia, updateMedia, triggerPostWatchRecommendation, clearPendingRecommendation,
  }), [
    library, loading, watchlist, continueWatching, pendingRecommendation,
    refreshLibrary, addToWatchlist, removeFromWatchlist, updateProgress,
    deleteMedia, updateMedia, triggerPostWatchRecommendation, clearPendingRecommendation,
  ]);

  return (
    <MediaContext.Provider value={contextValue}>
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMedia must be used within MediaProvider');
  return ctx;
}
