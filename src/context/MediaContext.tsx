import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { MediaItem } from '@/types/media';
import { useProfile } from '@/context/ProfileContext';

interface ContinueWatchingItem {
  id: string;
  progress: number;
}

interface MediaContextType {
  library: MediaItem[];
  loading: boolean;
  watchlist: string[];
  continueWatching: ContinueWatchingItem[];
  pendingRecommendation: string | null; // id of just-finished item
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

  // Get active profile so we can scope library fetches and progress writes
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? 'adult';

  // Watchlist — server is source of truth; localStorage is a fast initial value
  // that gets replaced on first successful server fetch.
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('homestream-watchlist') || '[]');
    } catch { return []; }
  });

  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('homestream-progress') || '[]');
    } catch { return []; }
  });

  // ── Fetch watchlist from server on mount ────────────────────────────────────
  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.ok ? r.json() as Promise<string[]> : Promise.reject())
      .then(ids => {
        setWatchlist(ids);
        // Keep localStorage in sync as a fast-load cache
        localStorage.setItem('homestream-watchlist', JSON.stringify(ids));
      })
      .catch(() => {
        // Server unavailable — keep localStorage value, will sync on next load
      });
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      setLoading(true);
      // Pass active profile so server resolves per-profile progress fields
      const res = await fetch(`/api/media?profile=${profileId}`);
      if (res.ok) {
        const data = await res.json() as MediaItem[];
        setLibrary(data);
        // Reconcile continueWatching from server — server is source of truth after restart.
        // Build a merged list: server watchProgress wins over stale localStorage values.
        const serverProgress: ContinueWatchingItem[] = data
          .filter(m => m.watchProgress && m.watchProgress > 2 && m.watchProgress < 95)
          .sort((a, b) => {
            const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
            const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
            return tb - ta;
          })
          .map(m => ({ id: m.id, progress: m.watchProgress! }));
        if (serverProgress.length > 0) {
          setContinueWatching(serverProgress);
          localStorage.setItem('homestream-progress', JSON.stringify(serverProgress));
        }
      }
    } catch (err) {
      console.error('Failed to fetch library:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // ── Watchlist mutations — optimistic UI + server persist ───────────────────

  const addToWatchlist = useCallback((id: string) => {
    // Optimistic update
    setWatchlist(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem('homestream-watchlist', JSON.stringify(next));
      return next;
    });
    // Persist to server
    fetch(`/api/watchlist/${id}`, { method: 'PUT' })
      .then(r => r.ok ? r.json() as Promise<{ watchlist: string[] }> : Promise.reject())
      .then(({ watchlist: serverList }) => {
        setWatchlist(serverList);
        localStorage.setItem('homestream-watchlist', JSON.stringify(serverList));
      })
      .catch(() => {
        // Server write failed — revert optimistic update
        setWatchlist(prev => {
          const reverted = prev.filter(w => w !== id);
          localStorage.setItem('homestream-watchlist', JSON.stringify(reverted));
          return reverted;
        });
      });
  }, []);

  const removeFromWatchlist = useCallback((id: string) => {
    // Optimistic update
    setWatchlist(prev => {
      const next = prev.filter(w => w !== id);
      localStorage.setItem('homestream-watchlist', JSON.stringify(next));
      return next;
    });
    // Persist to server
    fetch(`/api/watchlist/${id}`, { method: 'DELETE' })
      .then(r => r.ok ? r.json() as Promise<{ watchlist: string[] }> : Promise.reject())
      .then(({ watchlist: serverList }) => {
        setWatchlist(serverList);
        localStorage.setItem('homestream-watchlist', JSON.stringify(serverList));
      })
      .catch(() => {
        // Server write failed — revert optimistic update (add back)
        setWatchlist(prev => {
          const reverted = [...prev, id];
          localStorage.setItem('homestream-watchlist', JSON.stringify(reverted));
          return reverted;
        });
      });
  }, []);

  const updateProgress = useCallback((id: string, progress: number, currentTime?: number, duration?: number) => {
    // If complete (≥95%), remove from Continue Watching
    const isComplete = progress >= 95;
    setContinueWatching(prev => {
      let next: ContinueWatchingItem[];
      if (isComplete) {
        next = prev.filter(c => c.id !== id);
      } else {
        const existing = prev.findIndex(c => c.id === id);
        if (existing >= 0) {
          next = [...prev];
          next[existing] = { id, progress };
        } else {
          next = [...prev, { id, progress }];
        }
      }
      localStorage.setItem('homestream-progress', JSON.stringify(next));
      return next;
    });
    // Persist to server — survives restarts, device switches
    fetch(`/api/media/${id}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress, currentTime, duration, profileId }),
    }).catch(console.error);
  }, [profileId]);

  const triggerPostWatchRecommendation = useCallback((id: string) => {
    setPendingRecommendation(id);
  }, []);

  const clearPendingRecommendation = useCallback(() => {
    setPendingRecommendation(null);
  }, []);

  const deleteMedia = useCallback(async (id: string) => {
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
    setLibrary(prev => prev.filter(m => m.id !== id));
    // Also remove from watchlist if present
    removeFromWatchlist(id);
  }, [removeFromWatchlist]);

  const updateMedia = useCallback(async (id: string, updates: Partial<MediaItem>) => {
    const res = await fetch(`/api/media/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setLibrary(prev => prev.map(m => m.id === id ? updated : m));
    }
  }, []);

  return (
    <MediaContext.Provider value={{
      library,
      loading,
      watchlist,
      continueWatching,
      pendingRecommendation,
      refreshLibrary,
      addToWatchlist,
      removeFromWatchlist,
      updateProgress,
      deleteMedia,
      updateMedia,
      triggerPostWatchRecommendation,
      clearPendingRecommendation,
    }}>
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMedia must be used within MediaProvider');
  return ctx;
}
