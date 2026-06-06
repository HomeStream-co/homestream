import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, ChevronDown, Shuffle } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useMedia } from '@/context/MediaContext';
import MediaCarousel from '@/components/MediaCarousel';
import AIChatAssistant from '@/components/AIChatAssistant';
import Spinner from '@/components/Spinner';
import type { MediaItem } from '@/types/media';

function HeroSection({ item }: { item: MediaItem }) {
  const navigate = useNavigate();
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <section className="relative w-full h-[70vh] min-h-[480px] max-h-[720px] overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background" />
      <AnimatePresence>
        {item.poster && (
          <motion.img
            key={item.id}
            src={item.poster}
            alt=""
            onLoad={() => setImgLoaded(true)}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: imgLoaded ? 1 : 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        )}
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      {/* Content */}
      <div className="relative h-full flex items-end pb-16 px-6 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-xl"
        >
          {item.type === 'series' && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary border border-primary/40 bg-primary/10 px-2 py-0.5 rounded mb-3">
              Series
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl font-heading text-foreground leading-tight mb-2">
            {item.title}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            {item.year && <span>{item.year}</span>}
            {item.rated && <span className="border border-border px-1.5 py-0.5 rounded text-xs">{item.rated}</span>}
            {item.runtime && <span>{item.runtime}</span>}
            {item.imdbRating !== 'N/A' && (
              <span className="text-yellow-400 font-semibold">★ {item.imdbRating}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-6 max-w-md">
            {item.enrichment?.aiSummary ?? item.plot}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/player/${item.id}`)}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              <Play className="w-4 h-4 fill-current" />
              Play Now
            </button>
            <button
              onClick={() => navigate(`/player/${item.id}?info=1`)}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-foreground font-medium rounded-xl transition-all border border-white/10"
            >
              <Info className="w-4 h-4" />
              More Info
            </button>
          </div>
        </motion.div>
      </div>

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 text-muted-foreground/40"
      >
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  );
}

export default function HomePage() {
  const { library, loading, continueWatching, watchlist } = useMedia();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [heroItem, setHeroItem] = useState<MediaItem | null>(null);
  const heroIndexRef = useRef(0);

  const searchQuery = searchParams.get('q') ?? '';

  // Pick hero — highest rated item not yet fully watched
  useEffect(() => {
    if (!library.length) return;
    const candidates = library
      .filter(m => m.poster && m.watchProgress < 90 && m.imdbRating !== 'N/A')
      .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating));
    if (candidates.length) {
      setHeroItem(candidates[heroIndexRef.current % candidates.length]);
    }
  }, [library]);

  const shuffleHero = () => {
    const candidates = library.filter(m => m.poster && m.watchProgress < 90);
    if (!candidates.length) return;
    heroIndexRef.current = (heroIndexRef.current + 1) % candidates.length;
    setHeroItem(candidates[heroIndexRef.current]);
  };

  // Derived rows
  const continueItems = continueWatching
    .map(c => library.find(m => m.id === c.id))
    .filter(Boolean) as MediaItem[];

  const watchlistItems = watchlist
    .map(id => library.find(m => m.id === id))
    .filter(Boolean) as MediaItem[];

  const recentlyAdded = [...library]
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 20);

  const topRated = [...library]
    .filter(m => m.imdbRating !== 'N/A')
    .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating))
    .slice(0, 20);

  const movies = library.filter(m => m.type === 'movie').slice(0, 20);
  const series = library.filter(m => m.type === 'series').slice(0, 20);

  // Search results
  const searchResults = searchQuery
    ? library.filter(m =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.director.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (typeof m.actors === 'string' ? m.actors : m.actors.join(', ')).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  if (loading && !library.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  // Empty library state
  if (!loading && !library.length) {
    return (
      <>
        <Helmet>
          <title>HomeStream — Your Personal Media Server</title>
          <meta name="description" content="Stream your personal media library from anywhere." />
        </Helmet>
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Play className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-heading text-foreground mb-2">Welcome to HomeStream</h1>
            <p className="text-muted-foreground max-w-sm">Your library is empty. Upload your first movie or TV show to get started.</p>
          </div>
          <button
            onClick={() => navigate('/library')}
            className="px-6 py-3 bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-xl transition-all"
          >
            Upload Media
          </button>
        </div>
        <AIChatAssistant />
      </>
    );
  }

  // Search results view
  if (searchQuery) {
    return (
      <>
        <Helmet>
          <title>Search: {searchQuery} — HomeStream</title>
        </Helmet>
        <div className="pt-24 px-6 sm:px-10 lg:px-16 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
            </h2>
            <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Clear search</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-muted-foreground">No titles matched your search.</p>
          ) : (
            <MediaCarousel items={searchResults} title="" />
          )}        </div>
        <AIChatAssistant />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>HomeStream — Your Personal Media Server</title>
        <meta name="description" content="Stream your personal media library. Movies, TV shows, and more — all from your own server." />
      </Helmet>

      <div className="pb-16">
        {/* Hero */}
        {heroItem && (
          <div className="relative">
            <HeroSection item={heroItem} />
            <button
              onClick={shuffleHero}
              className="absolute top-20 right-6 sm:right-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-black/30 hover:bg-black/50 px-3 py-1.5 rounded-lg transition-all border border-white/10"
            >
              <Shuffle className="w-3 h-3" />
              Shuffle
            </button>
          </div>
        )}

        {/* Carousels */}
        <div className="mt-2 flex flex-col gap-10 px-4 sm:px-6 lg:px-10">
          {continueItems.length > 0 && (
            <MediaCarousel title="Continue Watching" items={continueItems} showProgress />
          )}
          {watchlistItems.length > 0 && (
            <MediaCarousel title="My Watchlist" items={watchlistItems} />
          )}
          <MediaCarousel title="Recently Added" items={recentlyAdded} />
          {topRated.length > 0 && (
            <MediaCarousel title="Top Rated" items={topRated} />
          )}
          {movies.length > 0 && (
            <MediaCarousel title="Movies" items={movies} />
          )}
          {series.length > 0 && (
            <MediaCarousel title="TV Series" items={series} />
          )}
        </div>
      </div>

      <AIChatAssistant />
    </>
  );
}
