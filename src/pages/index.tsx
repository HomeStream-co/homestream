/**
 * Home page — HomeStream
 *
 * Layout (top → bottom):
 *  1. HeroBanner  — scrolling new-release posters from TMDB (this month)
 *                   Falls back to library featured hero when no TMDB data yet
 *  2. Continue Watching carousel  — FIRST carousel, always on top
 *  3. Kids mode banner (if restricted profile)
 *  4. Recently Added
 *  5. Movies
 *  6. TV Shows & Series
 *  7. Top Rated
 *  8. My List
 */

import { useNavigate } from 'react-router-dom';
import { Play, Plus, Check, Star, Upload, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import MediaCarousel from '@/components/MediaCarousel';
import HeroBanner from '@/components/HeroBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { useTMDB } from '@/hooks/useTMDB';

export default function HomePage() {
  const { library, loading, watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const { isAllowed, activeProfile } = useProfile();
  const navigate = useNavigate();

  // Apply Kids filter to the entire library before building any carousel
  const visibleLibrary = library.filter(m => isAllowed(m.rated));

  // ── Derive all unique genre names from the library for personalised recs ──
  const libraryGenres = Array.from(
    new Set(visibleLibrary.flatMap(m => m.genre ?? []))
  );

  // ── TMDB data — fetched once, 30-day cache, no background polling ──
  const { upcoming, loading: tmdbLoading } = useTMDB(libraryGenres);

  // ── Library-based carousels ──
  const featured = visibleLibrary[0];
  const inWatchlist = featured ? watchlist.includes(featured.id) : false;

  const recentlyAdded = [...visibleLibrary].slice(0, 20);
  const movies = visibleLibrary.filter(m => m.type === 'movie');
  const series = visibleLibrary.filter(m => m.type === 'series');
  const topRated = [...visibleLibrary]
    .filter(m => m.imdbRating !== 'N/A')
    .sort((a, b) => parseFloat(b.imdbRating) - parseFloat(a.imdbRating))
    .slice(0, 20);

  // Continue Watching — sorted by lastWatchedAt (most recent first)
  const continueWatchingItems = visibleLibrary
    .filter(m => continueWatching.some(c => c.id === m.id && c.progress > 0))
    .sort((a, b) => {
      const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
      const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
      return tb - ta;
    });

  // ── Hero section logic ──
  // Show TMDB banner when we have upcoming movies (even while library loads)
  // Fall back to library hero when TMDB has nothing yet
  const showTMDBBanner = upcoming.length > 0;
  const showLibraryHero = !showTMDBBanner && !loading && !!featured;
  const showEmptyState = !showTMDBBanner && !loading && !featured;
  const showHeroSkeleton = loading && !showTMDBBanner;

  return (
    <div className="bg-background">
      <title>HomeStream — Your Personal Cinema</title>

      {/* ── Hero ── */}
      {showHeroSkeleton ? (
        <div className="relative h-[72vh] bg-card">
          <Skeleton className="w-full h-full" />
        </div>
      ) : showTMDBBanner ? (
        <HeroBanner movies={upcoming} loading={tmdbLoading && upcoming.length === 0} />
      ) : showLibraryHero ? (
        /* Library featured hero (fallback when TMDB not yet loaded) */
        <div className="relative h-[70vh] overflow-hidden">
          {featured!.poster ? (
            <img
              src={featured!.poster}
              alt={featured!.title}
              className="absolute inset-0 w-full h-full object-cover scale-110"
              style={{ filter: 'blur(2px) brightness(0.4)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : null}
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
                {featured!.runtime && featured!.runtime !== 'Unknown' && (
                  <span>{featured!.runtime}</span>
                )}
                <span>{featured!.genre.slice(0, 2).join(' · ')}</span>
              </div>
              <p className="text-sm text-foreground/80 mb-6 line-clamp-3 leading-relaxed">
                {featured!.plot}
              </p>
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
          <button
            onClick={() => navigate('/library')}
            className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Your First Movie
          </button>
        </div>
      ) : null}

      {/* ── Carousels ── */}
      <div className="pt-6">

        {/* ── 1. CONTINUE WATCHING — always first ── */}
        {continueWatchingItems.length > 0 && (
          <div className="mb-2">
            <MediaCarousel
              title="Continue Watching"
              items={continueWatchingItems}
              showProgress
              titleIcon={<Clock className="w-4 h-4 text-primary" />}
            />
          </div>
        )}

        {/* Kids mode banner */}
        {activeProfile?.restricted && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mb-6 flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-2.5">
            <span className="text-lg">🧒</span>
            <p className="text-xs text-yellow-400 font-medium">
              Kids mode — showing G &amp; PG rated content only
            </p>
          </div>
        )}

        <MediaCarousel title="Recently Added" items={recentlyAdded} />
        <MediaCarousel title="Movies" items={movies} />
        <MediaCarousel title="TV Shows & Series" items={series} />
        {topRated.length > 0 && (
          <MediaCarousel title="Top Rated" items={topRated} />
        )}
        {watchlist.length > 0 && (
          <MediaCarousel
            title="My List"
            items={visibleLibrary.filter(m => watchlist.includes(m.id))}
          />
        )}
      </div>
    </div>
  );
}
