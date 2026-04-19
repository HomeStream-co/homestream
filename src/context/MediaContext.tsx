import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { MediaItem } from '@/types/media';

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

  const refreshLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/media');
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
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const addToWatchlist = useCallback((id: string) => {
    setWatchlist(prev => {
      const next = [...prev, id];
      localStorage.setItem('homestream-watchlist', JSON.stringify(next));
      return next;
    });
  }, []);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist(prev => {
      const next = prev.filter(w => w !== id);
      localStorage.setItem('homestream-watchlist', JSON.stringify(next));
      return next;
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
      body: JSON.stringify({ progress, currentTime, duration }),
    }).catch(console.error);
  }, []);

  const triggerPostWatchRecommendation = useCallback((id: string) => {
    setPendingRecommendation(id);
  }, []);

  const clearPendingRecommendation = useCallback(() => {
    setPendingRecommendation(null);
  }, []);

  const deleteMedia = useCallback(async (id: string) => {
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
    setLibrary(prev => prev.filter(m => m.id !== id));
  }, []);

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
