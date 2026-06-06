import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, Star, Bookmark, SortAsc, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import type { MediaItem } from '@/types/media';

type SortKey = 'added' | 'title' | 'rating' | 'year';
type FilterType = 'all' | 'movie' | 'series';

export default function WatchlistPage() {
  const { library, watchlist, removeFromWatchlist } = useMedia();
  const { isAllowed } = useProfile();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('added');
  const [filter, setFilter] = useState<FilterType>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);

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

        {/* Empty State */}
        {watchlistItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24"
          >
            <Bookmark className="w-20 h-20 mx-auto mb-5 text-muted-foreground opacity-20" />
            <h2 className="text-2xl font-heading text-foreground mb-2">Your watchlist is empty</h2>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              Hover over any title and click the <span className="text-foreground">+</span> button to save it here for later.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-primary hover:bg-primary/80 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              Browse Library
            </button>
          </motion.div>
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
              {sorted.map(item => (
                <WatchlistCard
                  key={item.id}
                  item={item}
                  removing={removingId === item.id}
                  onPlay={() => navigate(`/player/${item.id}`)}
                  onRemove={() => handleRemove(item.id)}
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
}

function WatchlistCard({ item, removing, onPlay, onRemove }: WatchlistCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: removing ? 0 : 1, scale: removing ? 0.85 : 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.25 }}
      className="group cursor-pointer"
      onClick={onPlay}
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
