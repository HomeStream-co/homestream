import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import MediaCard from '@/components/MediaCard';
import { Skeleton } from '@/components/ui/skeleton';

const GENRES = ['All', 'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Animation', 'Documentary', 'Romance', 'Family', 'Crime', 'Adventure'];
const SORT_OPTIONS = [
  { value: 'added', label: 'Date Added' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'year', label: 'Year' },
];

export default function BrowsePage() {
  const { library, loading } = useMedia();
  const { isAllowed, activeProfile } = useProfile();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState('added');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');

  const filtered = useMemo(() => {
    // Apply Kids profile filter first
    let items = library.filter(m => isAllowed(m.rated));

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.plot.toLowerCase().includes(q) ||
        m.actors.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q) ||
        m.genre.some(g => g.toLowerCase().includes(q))
      );
    }

    // Genre
    if (selectedGenre !== 'All') {
      items = items.filter(m => m.genre.some(g => g.toLowerCase().includes(selectedGenre.toLowerCase())));
    }

    // Type
    if (typeFilter !== 'all') {
      items = items.filter(m => m.type === typeFilter);
    }

    // Sort
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
      default:
        items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }

    return items;
  }, [library, query, selectedGenre, sortBy, typeFilter]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-16">
      <title>Browse — HomeStream</title>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-heading text-foreground mb-4">Browse</h1>
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
            placeholder="Search by title, actor, director, genre..."
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />

          {/* Type filter */}
          <div className="flex gap-1">
            {(['all', 'movie', 'series'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                  typeFilter === t ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'all' ? 'All Types' : t === 'movie' ? 'Movies' : 'TV Shows'}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Genre chips */}
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

          {/* Sort */}
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
          {loading ? 'Loading...' : `${filtered.length} title${filtered.length !== 1 ? 's' : ''}`}
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
            <p className="text-muted-foreground text-lg">No titles found.</p>
            <p className="text-muted-foreground text-sm mt-1">Try adjusting your filters or upload more content.</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {filtered.map(item => (
              <MediaCard key={item.id} item={item} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
