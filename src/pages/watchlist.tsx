import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, Star, Bookmark, SortAsc, Filter, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import type { MediaItem } from '@/types/media';
import { toast } from 'sonner';

type SortKey = 'added' | 'title' | 'rating' | 'year';
type FilterType = 'all' | 'movie' | 'series';

export default function WatchlistPage() {
  const { library, watchlist, removeFromWatchlist, addToWatchlist, reorderWatchlist } = useMedia();
  const { isAllowed } = useProfile();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('added');
  const [filter, setFilter] = useState<FilterType>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Apply Kids filter before building watchlist
  const watchlistItems = library.filter(m => watchlist.includes(m.id) && isAllowed(m.rated));

  const filtered = watchlistItems.filter(m => {
    if (filter === 'movie') return m.type === 'movie';
    if (filter === 'series') return m.type === 'series';
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'rating') return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0);
    if (sort === 'year') return parseInt(b.year) - parseInt(a.year);
    // 'added' — preserve watchlist order
    return watchlist.indexOf(a.id) - watchlist.indexOf(b.id);
  });

  const handleRemove = (id: string) => {
    setRemovingId(id);
    setTimeout(() => {
      removeFromWatchlist(id);
      setRemovingId(null);
    }, 300);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (sort !== 'added') {
      setSort('added');
    }
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const nextList = [...sorted];
    const draggedItem = nextList[draggedIdx];
    nextList.splice(draggedIdx, 1);
    nextList.splice(index, 0, draggedItem);

    // Map relative order of filtered items back to complete watchlist array
    const sortedIds = sorted.map(item => item.id);
    let sortedIdx = 0;
    const finalIds = watchlist.map(id => {
      if (sortedIds.includes(id)) {
        return nextList[sortedIdx++].id;
      }
      return id;
    });

    setDraggedIdx(index);
    reorderWatchlist(finalIds);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const movies = watchlistItems.filter(m => m.type === 'movie').length;
  const shows = watchlistItems.filter(m => m.type === 'series').length;

  return (
    <div className="bg-background pt-20 pb-16">
      <title>My Watchlist — HomeStream</title>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Bookmark className="w-7 h-7 text-primary fill-primary" />
              <h1 className="text-4xl font-heading text-foreground">My Watchlist</h1>
            </div>
            <p className="text-muted-foreground">
              {watchlistItems.length === 0
                ? 'Nothing saved yet'
                : `${watchlistItems.length} title${watchlistItems.length !== 1 ? 's' : ''} saved · ${movies} movie${movies !== 1 ? 's' : ''} · ${shows} show${shows !== 1 ? 's' : ''}`
              }
            </p>
          </div>

          {watchlistItems.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter */}
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                <Filter className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
                {(['all', 'movie', 'series'] as FilterType[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
                      filter === f
                        ? 'bg-primary text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'series' ? 'TV Shows' : 'Movies'}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                <SortAsc className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
                {([
                  { key: 'added', label: 'Added' },
                  { key: 'title', label: 'Title' },
                  { key: 'rating', label: 'Rating' },
                  { key: 'year', label: 'Year' },
                ] as { key: SortKey; label: string }[]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      sort === s.key
                        ? 'bg-primary text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Empty State / Suggestions */}
        {watchlistItems.length === 0 ? (
          <div className="space-y-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <Bookmark className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <h2 className="text-xl font-heading text-foreground mb-1">Your watchlist is empty</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                Hover over any title and click the <span className="text-foreground font-semibold">+</span> button to save it here for later.
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-primary hover:bg-primary/80 text-white px-5 py-2 rounded-xl font-semibold text-xs transition-colors"
              >
                Browse Library
              </button>
            </motion.div>

            {/* Smart Suggestions */}
            {(() => {
              const suggestions = library
                .filter(m => isAllowed(m.rated) && (m.watchProgress ?? 0) < 95)
                .sort((a, b) => {
                  const rA = parseFloat(a.imdbRating) || 0;
                  const rB = parseFloat(b.imdbRating) || 0;
                  return rB - rA;
                })
                .slice(0, 6);

              if (suggestions.length === 0) return null;

              return (
                <div className="pt-8 border-t border-border/60">
                  <div className="flex items-center gap-2.5 mb-6">
                    <div className="w-1 h-5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                    <h3 className="text-sm font-heading tracking-widest text-foreground uppercase">Recommended for You</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {suggestions.map(item => (
                      <div key={item.id} className="group relative cursor-pointer" onClick={() => navigate(item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`)}>
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md">
                          {item.poster ? (
                            <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground text-xs p-3">{item.title}</div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-3">
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/player/${item.id}`); }}
                              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shadow-lg"
                            >
                              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); addToWatchlist(item.id); toast.success(`Added "${item.title}" to Watchlist`); }}
                              className="flex items-center gap-1 text-[11px] text-white/95 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Save to List
                            </button>
                          </div>
                          {item.imdbRating && item.imdbRating !== 'N/A' && (
                            <div className="absolute top-2 right-2 bg-black/70 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 text-accent fill-accent" />
                              <span className="text-[10px] text-white font-medium">{item.imdbRating}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No {filter === 'series' ? 'TV shows' : 'movies'} in your watchlist.
          </div>
        ) : (
          /* Grid */
          <motion.div
            layout
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8"
          >
            <AnimatePresence>
              {sorted.map((item, index) => (
                <WatchlistCard
                  key={item.id}
                  item={item}
                  removing={removingId === item.id}
                  onPlay={() => navigate(`/player/${item.id}`)}
                  onRemove={() => handleRemove(item.id)}
                  onNavigateToDetail={() => navigate(item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`)}
                  draggable={sort === 'added'}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedIdx === index}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ─── Watchlist Card ─────────────────────────────────────────────────── */
interface WatchlistCardProps {
  item: MediaItem;
  removing: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onNavigateToDetail: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

function WatchlistCard({
  item,
  removing,
  onPlay,
  onRemove,
  onNavigateToDetail,
  draggable,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: WatchlistCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: removing ? 0 : 1, scale: removing ? 0.85 : 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.25 }}
      className={`group cursor-pointer select-none transition-all duration-200 ${
        isDragging ? 'opacity-40 scale-95 ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl' : ''
      }`}
      onClick={onNavigateToDetail}
      draggable={draggable}
      onDragStart={onDragStart as any}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd as any}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-lg">
        {!imgError ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground text-xs text-center p-3">
            {item.title}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-3">
          <button
            onClick={e => { e.stopPropagation(); onPlay(); }}
            className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shadow-lg"
          >
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        </div>

        {/* Type badge */}
        <div className="absolute top-2 left-2 bg-black/70 rounded-full px-2 py-0.5 text-[10px] text-white/80 font-medium">
          {item.type === 'series' ? 'TV' : 'Film'}
        </div>

        {/* Rating badge */}
        {item.imdbRating && item.imdbRating !== 'N/A' && (
          <div className="absolute top-2 right-2 bg-black/70 rounded px-1.5 py-0.5 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-accent fill-accent" />
            <span className="text-[10px] text-white font-medium">{item.imdbRating}</span>
          </div>
        )}

        {/* Progress bar */}
        {(item.watchProgress ?? 0) > 0 && (item.watchProgress ?? 0) < 100 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/40">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${item.watchProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 px-0.5">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground">{item.year}</p>
          <p className="text-xs text-muted-foreground truncate ml-2">{(item.genre ?? []).slice(0, 2).join(', ')}</p>
        </div>
      </div>
    </motion.div>
  );
}
