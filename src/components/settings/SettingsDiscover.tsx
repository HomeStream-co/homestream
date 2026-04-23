import { useState } from 'react';
import { Compass, Clock, WifiOff, RefreshCw } from 'lucide-react';
import { SectionHeader } from './shared';

export default function SettingsDiscover() {
  const [tmdbRefreshing, setTmdbRefreshing] = useState(false);
  const [tmdbLastRefreshed, setTmdbLastRefreshed] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem('homestream-tmdb-session');
      if (!raw) return null;
      const data = JSON.parse(raw) as { fetchedAt?: number };
      return data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null;
    } catch { return null; }
  });
  const [tmdbStale, setTmdbStale] = useState(false);

  const handleTmdbRefresh = async () => {
    setTmdbRefreshing(true);
    try {
      const res = await fetch('/api/tmdb?refresh=1');
      if (res.ok) {
        const data = await res.json() as { fetchedAt?: number; stale?: boolean };
        const existing = (() => {
          try { return JSON.parse(sessionStorage.getItem('homestream-tmdb-session') || '{}'); }
          catch { return {}; }
        })();
        sessionStorage.setItem('homestream-tmdb-session', JSON.stringify({ ...existing, ...data }));
        setTmdbLastRefreshed(data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null);
        setTmdbStale(data.stale ?? false);
      }
    } catch {
      setTmdbStale(true);
    } finally {
      setTmdbRefreshing(false);
    }
  };

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Compass} label="Discover" />
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Movie data is cached for 30 days to keep things fast. Refresh to pull the latest new releases and trending titles right now.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {tmdbLastRefreshed
            ? `Last updated: ${tmdbLastRefreshed}`
            : 'Not yet fetched — will load on first visit to Discover'}
          {tmdbStale && (
            <span className="flex items-center gap-1 text-orange-400 ml-1">
              <WifiOff className="w-2.5 h-2.5" /> Stale
            </span>
          )}
        </div>
        <button
          onClick={handleTmdbRefresh}
          disabled={tmdbRefreshing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${tmdbRefreshing ? 'animate-spin' : ''}`} />
          {tmdbRefreshing ? 'Refreshing…' : 'Refresh New Releases Now'}
        </button>
      </div>
    </div>
  );
}
