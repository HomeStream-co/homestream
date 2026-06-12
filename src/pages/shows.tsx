/**
 * TV Shows Page — /shows
 *
 * Grid of all TV series in the library. Each card navigates to /show/:id
 * for the full detail + episode tracker view.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv2, Search, SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import MediaCard from '@/components/MediaCard';
import { Skeleton } from '@/components/ui/skeleton';
import { toActorsString } from '@/lib/utils';

const GENRES = ['All', 'Drama', 'Comedy', 'Action', 'Sci-Fi', 'Thriller', 'Crime', 'Animation', 'Documentary', 'Fantasy', 'Horror', 'Romance', 'Family', 'Adventure', 'Mystery', 'Reality', 'Kids'];
const SORT_OPTIONS = [
  { value: 'added',    label: 'Date Added' },
  { value: 'rating',   label: 'Top Rated' },
  { value: 'title',    label: 'Title A-Z' },
  { value: 'progress', label: 'In Progress' },
  { value: 'year',     label: 'Year' },
];

function getProgress(show: { episodes?: { watched: boolean }[] }) {
  const eps = show.episodes || [];
  if (eps.length === 0) return null;
  const watched = eps.filter(e => e.watched).length;
  return { watched, total: eps.length, pct: (watched / eps.length) * 100 };
}

export default function ShowsPage() {
  const { library, loading } = useMedia();
  const { isAllowed, activeProfile } = useProfile();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState('added');

  const filtered = useMemo(() => {
    let items = library.filter(m => m.type === 'series' && isAllowed(m.rated));

    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.plot?.toLowerCase().includes(q) ||
        toActorsString(m.actors).toLowerCase().includes(q) ||
        (m.genre ?? []).some(g => g.toLowerCase().includes(q))
      );
    }

    if (selectedGenre !== 'All') {
      items = items.filter(m => (m.genre ?? []).some(g => g.toLowerCase().includes(selectedGenre.toLowerCase())));
    }

    switch (sortBy) {
      case 'rating':
        items.sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
        break;
      case 'title':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'year':
        items.sort((a, b) => parseInt(b.year) - parseInt(a.year));
        break;
      case 'progress':
        // Sort by in-progress first (0 < pct < 100), then unwatched, then complete
        items.sort((a, b) => {
          const pa = getProgress(a);
          const pb = getProgress(b);
          const scoreA = pa && pa.pct > 0 && pa.pct < 100 ? 2 : pa && pa.pct === 0 ? 1 : 0;
          const scoreB = pb && pb.pct > 0 && pb.pct < 100 ? 2 : pb && pb.pct === 0 ? 1 : 0;
          return scoreB - scoreA;
        });
        break;
      default:
        items.sort((a, b) => new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime());
    }

    return items;
  }, [library, query, selectedGenre, sortBy, isAllowed]);

  return (
    <div className="bg-background pt-20 pb-16">
      <title>TV Shows — HomeStream</title>
      <meta name="description" content="Browse your TV show collection on HomeStream." />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Tv2 className="w-7 h-7 text-primary" />
          <h1 className="text-4xl font-heading text-foreground">TV Shows</h1>
        </div>

        {activeProfile?.restricted && (
          <div className="mb-6 flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-2.5 w-fit">
            <span className="text-base">🧒</span>
            <p className="text-xs text-yellow-400 font-medium">Kids mode — G &amp; PG only</p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search shows by title, actor, genre..."
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-wrap gap-1">
            {GENRES.map(genre => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedGenre === genre ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-card border border-border rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {loading ? 'Loading...' : `${filtered.length} show${filtered.length !== 1 ? 's' : ''}`}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] rounded-lg" />
                <Skeleton className="h-3 mt-2 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Tv2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg text-muted-foreground mb-2">No TV shows found.</p>
            <p className="text-sm text-muted-foreground mb-6">
              {query || selectedGenre !== 'All'
                ? 'Try adjusting your filters.'
                : 'Upload a TV show file — HomeStream will detect it as a series automatically.'}
            </p>
            {!query && selectedGenre === 'All' && (
              <button
                onClick={() => navigate('/library')}
                className="bg-primary hover:bg-primary/80 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Go to Library
              </button>
            )}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {filtered.map(show => (
              <MediaCard key={show.id} item={show} size="md" />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
