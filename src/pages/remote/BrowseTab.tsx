/**
 * BrowseTab — full library grid for the phone remote.
 * Extracted from remote.tsx for maintainability.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Search, Star, Tv, Tv2, SlidersHorizontal } from 'lucide-react';
import type { LibraryItem } from './types';

function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

interface BrowseTabProps {
  send: (cmd: Record<string, unknown>) => void;
}

export default function BrowseTab({ send }: BrowseTabProps) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => { setLibrary(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let items = library;
    if (filter !== 'all') items = items.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q));
    }
    return items;
  }, [library, search, filter]);

  const launch = useCallback((item: LibraryItem) => {
    haptic([30, 20, 30]);
    setLaunching(item.id);
    send({ type: 'launch', mediaId: item.id, title: item.title });
    setTimeout(() => setLaunching(null), 2000);
  }, [send]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading library…</p>
      </div>
    );
  }

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <Film className="w-12 h-12 text-muted-foreground" />
        <p className="text-foreground font-semibold">No media yet</p>
        <p className="text-sm text-muted-foreground">Add movies or shows to your HomeStream library first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search library…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex gap-2">
        {(['all', 'movie', 'series'] as const).map(f => (
          <button
            key={f}
            onClick={() => { haptic(20); setFilter(f); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              filter === f ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f === 'all' ? <SlidersHorizontal className="w-3 h-3" /> : f === 'movie' ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
            {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Shows'}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {filtered.map(item => (
          <motion.button
            key={item.id}
            onClick={() => launch(item)}
            whileTap={{ scale: 0.95 }}
            className="relative rounded-xl overflow-hidden aspect-[2/3] bg-card border border-border group"
          >
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            {item.watchProgress && item.watchProgress > 0.02 && item.watchProgress < 0.98 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div className="h-full bg-primary" style={{ width: `${item.watchProgress * 100}%` }} />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-1.5">
              <p className="text-white text-[10px] font-medium leading-tight line-clamp-2">{item.title}</p>
              {item.imdbRating && item.imdbRating !== 'N/A' && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-[9px] text-white/70">{item.imdbRating}</span>
                </div>
              )}
            </div>
            <AnimatePresence>
              {launching === item.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-primary/80 flex flex-col items-center justify-center gap-1"
                >
                  <Tv2 className="w-6 h-6 text-white animate-pulse" />
                  <span className="text-white text-[10px] font-semibold">Launching…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <p className="text-center text-sm text-muted-foreground py-8">No results for "{search}"</p>
      )}
    </div>
  );
}
