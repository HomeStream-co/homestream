import { useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Bookmark, X, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMedia } from '@/context/MediaContext';
import MediaCard from '@/components/MediaCard';
import Spinner from '@/components/Spinner';

export default function WatchlistPage() {
  const { library, loading, watchlist, removeFromWatchlist } = useMedia();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const watchlistItems = useMemo(() =>
    watchlist
      .map(id => library.find(m => m.id === id))
      .filter(Boolean)
      .filter(m => !query || m!.title.toLowerCase().includes(query.toLowerCase()))
    , [library, watchlist, query]);

  if (loading && !library.length) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <>
      <Helmet>
        <title>My Watchlist — HomeStream</title>
        <meta name="description" content="Your saved watchlist." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-primary fill-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">My Watchlist</h1>
              <p className="text-xs text-muted-foreground">{watchlist.length} saved title{watchlist.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        {watchlist.length > 0 && (
          <div className="relative mb-6 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search watchlist…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            {query && <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
        )}

        {/* Empty state */}
        {watchlist.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
            <Bookmark className="w-12 h-12 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground mb-1">Your watchlist is empty</p>
              <p className="text-xs">Save titles from your library to watch later.</p>
            </div>
            <button onClick={() => navigate('/library')} className="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
              Browse Library
            </button>
          </div>
        )}

        {/* Grid */}
        {watchlistItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {watchlistItems.map(item => item && (
              <div key={item.id} className="relative group">
                <MediaCard item={item} />
                <button
                  onClick={e => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-destructive/80 text-white opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Remove from watchlist"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* No search results */}
        {watchlist.length > 0 && watchlistItems.length === 0 && query && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <p className="text-sm">No titles matched &ldquo;{query}&rdquo;</p>
            <button onClick={() => setQuery('')} className="text-primary text-xs hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </>
  );
}
