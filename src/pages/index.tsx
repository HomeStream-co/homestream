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
import { Play, Plus, Check, Star, Upload, Clock, Search, X, SlidersHorizontal, Bookmark, Tv2, Activity, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
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
import type { MediaItem } from '@/types/media';

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

// ── Phone Remote QR Widget ────────────────────────────────────────────────────
// Shown in the bottom-right corner of the TV home screen.
// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { library, loading, watchlist, addToWatchlist, removeFromWatchlist, continueWatching, isDemoMode } = useMedia();
  const { isAllowed, activeProfile } = useProfile();
  const { upcoming, loading: tmdbLoading, stale: tmdbStale, error: tmdbError } = useTMDBContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Mood/vibe filter state ──
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  // ── Health panel states ──
  const [healthData, setHealthData] = useState<{ overall: string; checks: any[] } | null>(null);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health/full', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { overall: string; checks: any[] };
        setHealthData(data);
      }
    } catch {}
    setHealthLoading(false);
  };

  useEffect(() => {
    if (activeProfile?.isAdmin) {
      fetchHealth();
    } else {
      setHealthData(null);
    }
  }, [activeProfile]);

  // ── Search / filter state ──
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [genre, setGenre] = useState(searchParams.get('genre') || 'All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [sortBy, setSortBy] = useState('added');
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [homeTab, setHomeTab] = useState<'all' | 'movie' | 'series'>('all');

  const isSearching = query.trim().length > 0 || genre !== 'All' || typeFilter !== 'all';

  // Sync ?q= and ?genre= params → local state (for links from other pages)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== query) setQuery(q);
    const g = searchParams.get('genre');
    if (g !== null && g !== genre) setGenre(g);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Visible library (kids filter applied once) ──
  const visibleLibrary = useMemo(
    () => library.filter(m => isAllowed(m.rated)),
    [library, isAllowed],
  );

  const visibleLibraryFiltered = useMemo(() => {
    if (!selectedMood) return visibleLibrary;
    return visibleLibrary.filter(m =>
      (m.enrichment?.mood ?? []).some((mood: string) => mood.toLowerCase() === selectedMood.toLowerCase())
    );
  }, [visibleLibrary, selectedMood]);

  // Aggregate popular mood tags from library
  const popularMoods = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of visibleLibrary) {
      const moods = item.enrichment?.mood || [];
      for (const m of moods) {
        if (!m || m.trim() === '') continue;
        const normalized = m.trim();
        counts[normalized] = (counts[normalized] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 8);
  }, [visibleLibrary]);

  // TV "Up Next" episodes derivation
  const upNextItems = useMemo(() => {
    const list: Array<{ show: MediaItem; nextEpisode: any }> = [];
    const seriesItems = visibleLibrary.filter(m => m.type === 'series' && m.episodes && m.episodes.length > 0);
    
    for (const show of seriesItems) {
      const eps = show.episodes || [];
      const watchedCount = eps.filter(e => e.watched).length;
      if (watchedCount > 0 && watchedCount < eps.length) {
        const sortedEps = [...eps].sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
        const nextEp = sortedEps.find(e => !e.watched);
        if (nextEp) {
          list.push({ show, nextEpisode: nextEp });
        }
      }
    }
    return list;
  }, [visibleLibrary]);

  // ── Carousel derivations — all memoized ──
  const featured = useMemo(() => visibleLibraryFiltered[0], [visibleLibraryFiltered]);
  const inWatchlist = useMemo(() => featured ? watchlist.includes(featured.id) : false, [featured, watchlist]);

  const continueWatchingItems = useMemo(() =>
    visibleLibraryFiltered
      .filter(m => continueWatching.some(c => c.id === m.id && c.progress > 0))
      .sort((a, b) => {
        const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
        const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
        return tb - ta;
      }),
    [visibleLibraryFiltered, continueWatching],
  );

  const myList = useMemo(
    () => visibleLibraryFiltered.filter(m => watchlist.includes(m.id)),
    [visibleLibraryFiltered, watchlist],
  );

  const recentlyAdded = useMemo(() => [...visibleLibraryFiltered].slice(0, 20), [visibleLibraryFiltered]);

  const movies = useMemo(
    () => visibleLibraryFiltered.filter(m => m.type === 'movie'),
    [visibleLibraryFiltered],
  );

  // Deduplicated series — one card per show title (first episode found), matching Library ShowCard logic
  const series = useMemo(() => {
    const seen = new Set<string>();
    const deduped: typeof visibleLibraryFiltered = [];
    for (const m of visibleLibraryFiltered) {
      if (m.type !== 'series') continue;
      const key = m.title.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }
    return deduped;
  }, [visibleLibraryFiltered]);

  // Count matches the carousel — both are deduped by title
  const uniqueShowCount = series.length;

  const topRated = useMemo(() =>
    [...visibleLibraryFiltered]
      .filter(m => m.imdbRating !== 'N/A' && parseFloat(m.imdbRating) > 0)
      .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating))
      .slice(0, 20),
    [visibleLibraryFiltered],
  );

  // ── Search results ──
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    let items = [...visibleLibraryFiltered];

    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.plot?.toLowerCase().includes(q) ||
        toActorsString(m.actors).toLowerCase().includes(q) ||
        m.director?.toLowerCase().includes(q) ||
        (m.genre ?? []).some(g => g.toLowerCase().includes(q))
      );
    }
    if (genre !== 'All') {
      items = items.filter(m => (m.genre ?? []).some(g => g.toLowerCase().includes(genre.toLowerCase())));
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
    <div className="bg-background min-h-screen">
      <title>HomeStream — Your Personal Cinema</title>
      <meta name="description" content="Stream your personal media library. Movies, TV shows, and more." />

      {/* Offline / stale data notice */}
      <OfflineBanner stale={tmdbStale} error={tmdbError} />

      {/* ── Hero ── */}
      {showHeroSkeleton ? (
        <div className="relative h-[80vh] overflow-hidden">
          <div className="absolute inset-0 shimmer" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : showTMDBBanner ? (
        <HeroBanner movies={upcoming} loading={tmdbLoading && upcoming.length === 0} />
      ) : showLibraryHero ? (
        /* ── Library hero (no TMDB) ── */
        <div className="relative h-[78vh] overflow-hidden">
          {featured!.poster && (
            <img
              src={featured!.poster}
              alt={featured!.title}
              className="absolute inset-0 w-full h-full object-cover scale-110"
              style={{ filter: 'blur(3px) brightness(0.38) saturate(1.15)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background/50 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/65 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />

          <div className="relative h-full flex items-end pb-20 px-6 sm:px-10 lg:px-16 max-w-screen-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' as const }}
              className="max-w-2xl"
            >
              <div className="flex items-center gap-2.5 mb-4">
                {featured!.imdbRating !== 'N/A' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-bold">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {featured!.imdbRating}
                  </span>
                )}
                {featured!.year && (
                  <span className="text-xs text-muted-foreground font-medium">{featured!.year}</span>
                )}
                {featured!.rated && featured!.rated !== 'N/A' && (
                  <span className="px-2 py-0.5 rounded border border-muted-foreground/40 text-[10px] text-muted-foreground font-semibold uppercase">
                    {featured!.rated}
                  </span>
                )}
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-heading text-foreground tracking-wide mb-3 leading-none drop-shadow-2xl">
                {featured!.title}
              </h1>

              {(featured!.genre ?? []).length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {(featured!.genre ?? []).slice(0, 4).map(g => (
                    <span key={g} className="px-2.5 py-1 rounded-full glass text-xs text-foreground/80 font-medium">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-sm text-foreground/70 mb-6 line-clamp-3 leading-relaxed max-w-lg">{featured!.plot}</p>

              <div className="flex items-center gap-3 flex-wrap">
                <motion.button
                  onClick={() => navigate(`/player/${featured!.id}`)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-white hover:bg-white/90 text-black px-7 py-3 rounded-xl font-bold text-sm transition-all shadow-lg"
                >
                  <Play className="w-4 h-4 fill-black" />
                  Play Now
                </motion.button>
                <motion.button
                  onClick={() => inWatchlist ? removeFromWatchlist(featured!.id) : addToWatchlist(featured!.id)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 glass hover:bg-white/15 text-foreground px-6 py-3 rounded-xl font-semibold text-sm transition-all"
                >
                  {inWatchlist ? <Check className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4" />}
                  {inWatchlist ? 'In My List' : 'Add to List'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      ) : showEmptyState ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
            </div>
            <div>
              <h1 className="text-4xl font-heading text-foreground mb-3 tracking-wide">Your Cinema Awaits</h1>
              <p className="text-muted-foreground mb-2 max-w-sm leading-relaxed">
                Add your first video file to get started, or browse trending movies and shows to download.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <motion.button
                onClick={() => navigate('/library')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-primary hover:bg-primary/85 text-primary-foreground px-7 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/25"
              >
                <Upload className="w-4 h-4" />
                Upload a Video File
              </motion.button>
              <motion.button
                onClick={() => navigate('/discover')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 glass hover:bg-white/10 text-foreground px-7 py-3 rounded-xl font-semibold text-sm transition-all"
              >
                Browse &amp; Download
              </motion.button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {/* ── Sticky search + filter bar ── */}
      <div className="sticky top-16 z-30 border-b border-border/30" style={{ background: 'hsl(var(--background) / 0.92)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2.5">
            {/* Search input */}
            <div className="relative flex-1 max-w-2xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search movies, shows, actors, genres..."
                className="w-full glass rounded-xl pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                showFilters || genre !== 'All' || typeFilter !== 'all'
                  ? 'bg-primary/15 border-primary/35 text-primary'
                  : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {(genre !== 'All' || typeFilter !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>

            {/* My List shortcut */}
            {myList.length > 0 && !isSearching && (
              <button
                onClick={() => navigate('/watchlist')}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl glass text-muted-foreground hover:text-foreground text-sm transition-all"
                title="My Watchlist"
              >
                <Bookmark className="w-4 h-4" />
                <span className="hidden md:inline">My List</span>
                <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 leading-none font-bold">{myList.length}</span>
              </button>
            )}

            {isSearching && (
              <button onClick={clearSearch} className="text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap font-medium">
                Clear
              </button>
            )}
          </div>

          {/* ── Movies / TV Shows tab strip — always visible ── */}
          {!isSearching && (
            <div className="flex items-center gap-1 mt-3 border-t border-border/20 pt-3">
              {([
                { id: 'all',    label: 'All',      count: visibleLibrary.length },
                { id: 'movie',  label: 'Movies',   count: movies.length },
                { id: 'series', label: 'TV Shows', count: uniqueShowCount },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setHomeTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                    homeTab === tab.id
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      homeTab === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Expanded filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="pt-3 pb-1 flex flex-wrap items-center gap-2">
                  {/* Type pills */}
                  <div className="flex gap-1">
                    {(['all', 'movie', 'series'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          typeFilter === t
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                            : 'glass text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-4 bg-border/60" />

                  {/* Genre pills */}
                  <div className="flex flex-wrap gap-1">
                    {GENRES.map(g => (
                      <button
                        key={g}
                        onClick={() => setGenre(g)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          genre === g
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                            : 'glass text-muted-foreground hover:text-foreground'
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
                      className="glass rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
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
      </div>

      {/* ── Kids mode banner ── */}
      {activeProfile?.restricted && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5 w-fit">
          <span className="text-base">🧒</span>
          <p className="text-xs text-yellow-400 font-semibold">Kids mode — G &amp; PG content only</p>
        </div>
      )}

      {/* ── Search results grid ── */}
      <AnimatePresence mode="wait">
        {isSearching ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20"
          >
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold tabular-nums">{searchResults.length}</span>{' '}
                title{searchResults.length !== 1 ? 's' : ''}
                {query && <> for <span className="text-foreground font-medium">"{query}"</span></>}
              </p>
            </div>

            {searchResults.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7 text-muted-foreground/40" />
                </div>
                <p className="text-foreground font-semibold mb-1">No titles found</p>
                <p className="text-muted-foreground text-sm">Try different keywords or clear your filters.</p>
                <button onClick={clearSearch} className="mt-4 text-primary text-sm font-medium hover:underline">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4">
                {searchResults.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <MediaCard item={item} size="md" />
                  </motion.div>
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
            transition={{ duration: 0.2 }}
            className="pt-8 pb-20"
          >
            {/* ── System Diagnostics Dashboard Banner ── */}
            {activeProfile?.isAdmin && (
              <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
                <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-lg">
                  {/* Collapsed Header */}
                  <div
                    onClick={() => setHealthExpanded(prev => !prev)}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          System Diagnostics Dashboard
                          {healthLoading && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {healthData ? `Overall Status: ${healthData.overall.toUpperCase()}` : 'Loading diagnostics...'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {healthData && (
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase leading-none border ${
                          healthData.overall === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                          healthData.overall === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                          'bg-destructive/10 border-destructive/30 text-destructive'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            healthData.overall === 'ok' ? 'bg-emerald-500 animate-pulse' :
                            healthData.overall === 'warn' ? 'bg-yellow-500 animate-pulse' :
                            'bg-destructive animate-pulse'
                          }`} />
                          {healthData.overall}
                        </span>
                      )}
                      
                      <button
                        onClick={e => { e.stopPropagation(); fetchHealth(); }}
                        disabled={healthLoading}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors"
                        title="Refresh health checks"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                      </button>

                      {healthExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded checks list */}
                  <AnimatePresence>
                    {healthExpanded && healthData && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border/40 bg-muted/30 px-5 py-4 overflow-hidden"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {healthData.checks.map(check => {
                            const statusColor =
                              check.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' :
                              check.status === 'warn' ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400' :
                              check.status === 'error' ? 'border-destructive/20 bg-destructive/5 text-destructive' :
                              'border-border bg-card text-muted-foreground';
                            return (
                              <div
                                key={check.name}
                                className={`border rounded-xl p-3 flex flex-col gap-1 transition-all ${statusColor}`}
                                title={check.detail || check.message}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-foreground">{check.name}</span>
                                  <span className="text-[9px] font-bold uppercase tracking-wider">{check.status}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">{check.message}</p>
                                {check.detail && (
                                  <p className="text-[9px] opacity-75 font-mono truncate mt-1">{check.detail}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
            {/* ── Watch on TV banner ── */}
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 flex flex-col sm:flex-row gap-3">
              {/* TV Interface — primary action, shown first */}
              <a
                href="/tv"
                className="flex items-center gap-4 bg-card border border-border hover:border-primary/40 rounded-2xl px-5 py-4 transition-all group hover:shadow-lg hover:shadow-primary/10 sm:w-64"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                  <Tv2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">TV Interface</p>
                  <p className="text-xs text-muted-foreground mt-0.5">10-foot UI for D-pad navigation</p>
                </div>
                <span className="text-xs text-primary font-medium group-hover:underline flex-shrink-0">Open →</span>
              </a>
              {/* Samsung TV setup guide — secondary, clearly labelled as a setup guide */}
              <a
                href="/samsung-tv"
                className="flex-1 flex items-center gap-4 bg-card border border-border hover:border-primary/40 rounded-2xl px-5 py-4 transition-all group hover:shadow-lg hover:shadow-primary/10"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                  <Tv2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Samsung / Smart TV Setup Guide</p>
                  <p className="text-xs text-muted-foreground mt-0.5">First time? Step-by-step guide to open HomeStream in your TV browser</p>
                </div>
                <span className="text-xs text-primary font-medium group-hover:underline flex-shrink-0">Setup →</span>
              </a>
            </div>
            {visibleLibrary.length === 0 ? (
              /* ── Empty library state ── */
              <div className="flex flex-col items-center justify-center py-24 gap-5 text-center px-4">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-10 h-10 text-primary/60" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Your library is empty</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-sm">
                    Head to Downloads to grab movies and TV shows. They'll appear here automatically once added.
                  </p>
                </div>
                <a
                  href="/downloads"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Go to Downloads
                </a>
              </div>
            ) : (
              <>
                {/* Mood/Vibe Pills Filter Strip */}
                {popularMoods.length > 0 && (
                  <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Filter by vibe</span>
                      {selectedMood && (
                        <button
                          onClick={() => setSelectedMood(null)}
                          className="text-[10px] text-primary hover:underline font-semibold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
                      {popularMoods.map(mood => {
                        const active = selectedMood?.toLowerCase() === mood.toLowerCase();
                        return (
                          <button
                            key={mood}
                            onClick={() => setSelectedMood(active ? null : mood)}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 whitespace-nowrap shadow-sm ${
                              active
                                ? 'bg-primary text-primary-foreground shadow-primary/30 ring-2 ring-primary ring-offset-2 ring-offset-background'
                                : 'glass border border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/30'
                            }`}
                          >
                            ✨ {mood}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* "Up Next" Episode Strip */}
                {upNextItems.length > 0 && (
                  <section className="mb-10">
                    <div className="flex items-center gap-3 mb-4 px-4 sm:px-6 lg:px-8">
                      <div className="w-1 h-5 rounded-full bg-purple-500 flex-shrink-0" />
                      <h2 className="text-base font-heading tracking-widest text-foreground uppercase flex items-center gap-2">
                        <Tv2 className="w-3.5 h-3.5" />
                        Up Next
                      </h2>
                      <span className="text-xs text-muted-foreground font-medium ml-1 tabular-nums">
                        {upNextItems.length}
                      </span>
                      <div className="flex-1 h-px bg-border/40 ml-2" />
                    </div>

                    <div className="relative overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 flex gap-4 pb-3">
                      {upNextItems.map(({ show, nextEpisode }) => {
                        const syntheticItem = {
                          ...show,
                          id: nextEpisode.id,
                          title: `${show.title} - S${nextEpisode.season}E${nextEpisode.episode}: ${nextEpisode.title}`,
                        };
                        return (
                            <div
                              onClick={() => navigate(`/player/${nextEpisode.id}`)}
                              className="relative cursor-pointer group w-36 sm:w-44 flex-shrink-0 select-none"
                            >
                              <div className="relative aspect-poster rounded-xl overflow-hidden bg-card shadow-md shadow-black/40 group-hover:scale-105 transition-transform duration-200">
                                {show.poster ? (
                                  <img src={show.poster} alt={show.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-card p-2 text-center">
                                    <Tv2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-[10px] text-muted-foreground line-clamp-3">{show.title}</p>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
                                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                                  </div>
                                </div>
                                <div className="absolute top-2 left-2 bg-primary/95 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md">
                                  S{nextEpisode.season}E{nextEpisode.episode}
                                </div>
                              </div>
                              
                              <div className="mt-2 px-0.5">
                                <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                                  {show.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                  {nextEpisode.title || `Episode ${nextEpisode.episode}`}
                                </p>
                              </div>
                            </div>
                        );
                      })}
                      <div className="w-4 flex-shrink-0" />
                    </div>
                  </section>
                )}

            {!isDemoMode && continueWatchingItems.length > 0 && (
              <MediaCarousel
                title="Continue Watching"
                items={continueWatchingItems.filter(m => homeTab === 'all' || m.type === homeTab || (homeTab === 'movie' && m.type !== 'series'))}
                showProgress
                titleIcon={<Clock className="w-3.5 h-3.5" />}
                accentClass="bg-blue-500"
              />
            )}

            {myList.length > 0 && (
              <MediaCarousel
                title="My List"
                items={myList.filter(m => homeTab === 'all' || m.type === homeTab || (homeTab === 'movie' && m.type !== 'series'))}
                titleIcon={<Bookmark className="w-3.5 h-3.5" />}
                accentClass="bg-yellow-500"
              />
            )}

            {homeTab !== 'series' && (
              <MediaCarousel title="Recently Added" items={recentlyAdded.filter(m => homeTab === 'movie' ? m.type !== 'series' : true)} accentClass="bg-primary" />
            )}
            {homeTab === 'series' && (
              <MediaCarousel title="Recently Added" items={recentlyAdded.filter(m => m.type === 'series')} accentClass="bg-primary" />
            )}

            {homeTab !== 'series' && (
              <LazySection skeletonHeight={240}>
                <MediaCarousel title="Movies" items={movies} accentClass="bg-primary" />
              </LazySection>
            )}
            {homeTab !== 'movie' && (
              <LazySection skeletonHeight={240}>
                <MediaCarousel title="TV Shows & Series" items={series} accentClass="bg-purple-500" />
              </LazySection>
            )}
            {topRated.length > 0 && homeTab === 'all' && (
              <LazySection skeletonHeight={240}>
                <MediaCarousel
                  title="Top Rated"
                  items={topRated}
                  titleIcon={<Star className="w-3.5 h-3.5" />}
                  accentClass="bg-yellow-500"
                />
              </LazySection>
            )}
            {topRated.length > 0 && homeTab !== 'all' && (
              <LazySection skeletonHeight={240}>
                <MediaCarousel
                  title="Top Rated"
                  items={topRated.filter(m => homeTab === 'series' ? m.type === 'series' : m.type !== 'series')}
                  titleIcon={<Star className="w-3.5 h-3.5" />}
                  accentClass="bg-yellow-500"
                />
              </LazySection>
            )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phone Remote QR ── */}
      {/* Moved to header — RemoteButton is always visible in the nav */}
    </div>
  );
}
