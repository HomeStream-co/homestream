/**
 * Home Page — / (merged with Browse)
 *
 * Layout:
 *  1. HeroBanner (TMDB new releases) or library fallback hero
 *  2. Inline search bar — typing activates a full-grid search view
 *     (replaces the old /browse page entirely)
 *  3. When search is active: filtered grid with genre/type/sort controls
 *  4. When search is inactive: carousels
 *     - Continue Watching (most recent first)
 *     - My List (if non-empty)
 *     - Recently Added
 *     - Movies
 *     - TV Shows
 *     - Top Rated
 *
 * All carousel derivations are memoized so they only recompute when
 * the library or watchlist actually changes.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus, Check, Star, Upload, Clock, Search, X, SlidersHorizontal, Bookmark, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import { useTMDBContext } from '@/context/TMDBContext';
import MediaCarousel from '@/components/MediaCarousel';
import MediaCard from '@/components/MediaCard';
import HeroBanner from '@/components/HeroBanner';
import { toActorsString } from '@/lib/utils';
import OfflineBanner from '@/components/OfflineBanner';
import LazySection from '@/components/LazySection';
import HomePageSkeleton from '@/components/HomePageSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRES = [
  'All', 'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror',
  'Romance', 'Sci-Fi', 'Thriller',
];

const SORT_OPTIONS = [
  { value: 'added',  label: 'Date Added' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'title',  label: 'Title A–Z' },
  { value: 'year',   label: 'Year' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { library, loading, watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const { isAllowed, activeProfile } = useProfile();
  const { upcoming, loading: tmdbLoading, stale: tmdbStale, error: tmdbError } = useTMDBContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Search / filter state ──
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [genre, setGenre] = useState('All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [sortBy, setSortBy] = useState('added');
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSearching = query.trim().length > 0 || genre !== 'All' || typeFilter !== 'all';

  // Sync ?q= param → local state (for links from other pages like genre pills)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== query) setQuery(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Visible library (kids filter applied once) ──
  const visibleLibrary = useMemo(
    () => library.filter(m => isAllowed(m.rated)),
    [library, isAllowed],
  );

  // ── Carousel derivations — all memoized ──
  const featured = useMemo(() => visibleLibrary[0], [visibleLibrary]);
  const inWatchlist = useMemo(() => featured ? watchlist.includes(featured.id) : false, [featured, watchlist]);

  const continueWatchingItems = useMemo(() =>
    visibleLibrary
      .filter(m => continueWatching.some(c => c.id === m.id && c.progress > 0))
      .sort((a, b) => {
        const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
        const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
        return tb - ta;
      }),
    [visibleLibrary, continueWatching],
  );

  const myList = useMemo(
    () => visibleLibrary.filter(m => watchlist.includes(m.id)),
    [visibleLibrary, watchlist],
  );

  const recentlyAdded = useMemo(() => [...visibleLibrary].slice(0, 20), [visibleLibrary]);

  const movies = useMemo(
    () => visibleLibrary.filter(m => m.type === 'movie'),
    [visibleLibrary],
  );

  const series = useMemo(
    () => visibleLibrary.filter(m => m.type === 'series'),
    [visibleLibrary],
  );

  const topRated = useMemo(() =>
    [...visibleLibrary]
      .filter(m => m.imdbRating !== 'N/A' && parseFloat(m.imdbRating) > 0)
      .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating))
      .slice(0, 20),
    [visibleLibrary],
  );

  // ── Search results ──
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    let items = [...visibleLibrary];

    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.plot?.toLowerCase().includes(q) ||
        toActorsString(m.actors).toLowerCase().includes(q) ||
        m.director?.toLowerCase().includes(q) ||
        m.genre.some(g => g.toLowerCase().includes(q))
      );
    }
    if (genre !== 'All') {
      items = items.filter(m => m.genre.some(g => g.toLowerCase().includes(genre.toLowerCase())));
    }
    if (typeFilter !== 'all') {
      items = items.filter(m => m.type === typeFilter);
    }
    switch (sortBy) {
      case 'rating': items.sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0)); break;
      case 'title':  items.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'year':   items.sort((a, b) => parseInt(b.year) - parseInt(a.year)); break;
      default:       items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return items;
  }, [isSearching, visibleLibrary, query, genre, typeFilter, sortBy]);

  // ── Show skeleton on first load — MUST be after all hooks ──
  if (loading && library.length === 0) {
    return <HomePageSkeleton />;
  }

  // ── Hero logic ──
  const showTMDBBanner  = upcoming.length > 0;
  const showLibraryHero = !showTMDBBanner && !loading && !!featured;
  const showEmptyState  = !showTMDBBanner && !loading && !featured;
  const showHeroSkeleton = loading && !showTMDBBanner;

  const clearSearch = () => {
    setQuery('');
    setGenre('All');
    setTypeFilter('all');
    setSearchParams({});
  };

  return (
    <div className="bg-background">
      <title>HomeStream — Your Personal Cinema</title>
      <meta name="description" content="Stream your personal media library. Movies, TV shows, and more." />

      {/* Offline / stale data notice */}
      <OfflineBanner stale={tmdbStale} error={tmdbError} />

      {/* ── Hero ── */}
      {showHeroSkeleton ? (
        <div className="relative h-[72vh] bg-card">
          <Skeleton className="w-full h-full" />
        </div>
      ) : showTMDBBanner ? (
        <HeroBanner movies={upcoming} loading={tmdbLoading && upcoming.length === 0} />
      ) : showLibraryHero ? (
        <div className="relative h-[70vh] overflow-hidden">
          {featured!.poster && (
            <img
              src={featured!.poster}
              alt={featured!.title}
              className="absolute inset-0 w-full h-full object-cover scale-110"
              style={{ filter: 'blur(2px) brightness(0.4)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background/60 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

          <div className="relative h-full flex items-end pb-16 px-4 sm:px-6 lg:px-8 max-w-screen-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              {featured!.imdbRating !== 'N/A' && (
                <div className="flex items-center gap-1 mb-3">
                  <Star className="w-4 h-4 text-accent fill-accent" />
                  <span className="text-accent font-semibold text-sm">{featured!.imdbRating}/10</span>
                  <span className="text-muted-foreground text-sm ml-1">IMDb</span>
                </div>
              )}
              <h1 className="text-5xl sm:text-6xl font-heading text-foreground tracking-wide mb-3">
                {featured!.title}
              </h1>
              <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
                <span>{featured!.year}</span>
                {featured!.rated && featured!.rated !== 'N/A' && (
                  <span className="border border-muted-foreground px-1.5 py-0.5 rounded text-xs">{featured!.rated}</span>
                )}
                {featured!.runtime && featured!.runtime !== 'Unknown' && <span>{featured!.runtime}</span>}
                <span>{featured!.genre.slice(0, 2).join(' · ')}</span>
              </div>
              <p className="text-sm text-foreground/80 mb-6 line-clamp-3 leading-relaxed">{featured!.plot}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/player/${featured!.id}`)}
                  className="flex items-center gap-2 bg-white hover:bg-white/90 text-black px-6 py-2.5 rounded font-semibold text-sm transition-colors"
                >
                  <Play className="w-4 h-4 fill-black" />
                  Play Now
                </button>
                <button
                  onClick={() => inWatchlist ? removeFromWatchlist(featured!.id) : addToWatchlist(featured!.id)}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-5 py-2.5 rounded font-medium text-sm transition-colors border border-white/30"
                >
                  {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {inWatchlist ? 'In My List' : 'My List'}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mb-6">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-heading text-foreground mb-3">Your library is empty</h1>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Upload your first movie or show to get started. We'll automatically fetch the poster and info.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate('/library')}
              className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Your First Movie
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/demo/seed', { method: 'POST' });
                  const data = await res.json() as { ok: boolean; id: string };
                  if (data.ok) navigate(`/player/${data.id}`);
                } catch { /* ignore */ }
              }}
              className="flex items-center gap-2 bg-card hover:bg-card/80 border border-border text-foreground px-6 py-3 rounded font-medium transition-colors"
            >
              <FlaskConical className="w-4 h-4 text-primary" />
              Try Demo Player
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-4 max-w-xs">
            Demo loads Big Buck Bunny (CC-licensed) to test the player — no files needed.
          </p>
        </div>
      ) : null}

      {/* ── Search bar ── */}
      <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-sm border-b border-border/40 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search movies, shows, actors, genres..."
              className="w-full bg-card border border-border rounded-lg pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || genre !== 'All' || typeFilter !== 'all'
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* My List shortcut */}
          {myList.length > 0 && !isSearching && (
            <button
              onClick={() => { setTypeFilter('all'); setGenre('All'); setQuery(''); setShowFilters(false); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground text-sm transition-colors"
              title="My Watchlist"
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">My List</span>
              <span className="text-xs bg-primary text-white rounded-full px-1.5 py-0.5 leading-none">{myList.length}</span>
            </button>
          )}

          {/* Clear all */}
          {isSearching && (
            <button onClick={clearSearch} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Clear all
            </button>
          )}
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="max-w-screen-2xl mx-auto pt-3 flex flex-wrap items-center gap-3">
                {/* Type */}
                <div className="flex gap-1">
                  {(['all', 'movie', 'series'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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
                  {GENRES.map(g => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        genre === g ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g}
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
                    {SORT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Kids mode banner ── */}
      {activeProfile?.restricted && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-2.5 w-fit">
          <span className="text-lg">🧒</span>
          <p className="text-xs text-yellow-400 font-medium">Kids mode — showing G &amp; PG rated content only</p>
        </div>
      )}

      {/* ── Search results grid ── */}
      <AnimatePresence mode="wait">
        {isSearching ? (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16"
          >
            <p className="text-sm text-muted-foreground mb-4">
              {searchResults.length} title{searchResults.length !== 1 ? 's' : ''}
              {query && <> matching <span className="text-foreground font-medium">"{query}"</span></>}
            </p>

            {searchResults.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg">No titles found.</p>
                <p className="text-muted-foreground text-sm mt-1">Try adjusting your search or filters.</p>
                <button onClick={clearSearch} className="mt-4 text-primary text-sm hover:underline">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4">
                {searchResults.map(item => (
                  <MediaCard key={item.id} item={item} size="md" />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          /* ── Carousels ── */
          <motion.div
            key="carousels"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pt-6"
          >
            {continueWatchingItems.length > 0 && (
              <MediaCarousel
                title="Continue Watching"
                items={continueWatchingItems}
                showProgress
                titleIcon={<Clock className="w-4 h-4 text-primary" />}
              />
            )}

            {myList.length > 0 && (
              <MediaCarousel
                title="My List"
                items={myList}
                titleIcon={<Bookmark className="w-4 h-4 text-primary" />}
              />
            )}

            <MediaCarousel title="Recently Added" items={recentlyAdded} />

            <LazySection skeletonHeight={220}>
              <MediaCarousel title="Movies" items={movies} />
            </LazySection>
            <LazySection skeletonHeight={220}>
              <MediaCarousel title="TV Shows & Series" items={series} />
            </LazySection>
            {topRated.length > 0 && (
              <LazySection skeletonHeight={220}>
                <MediaCarousel title="Top Rated" items={topRated} />
              </LazySection>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
