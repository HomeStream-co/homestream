/**
 * HeroBanner — cinematic full-bleed hero with dual CTA.
 *
 * v2 improvements over Netflix/Prime:
 *  - Larger backdrop (80vh) with multi-layer gradient for depth
 *  - Animated title entrance per slide
 *  - Dual CTA: "Explore" + "Add to Watchlist"
 *  - Metadata row: rating, genres, year
 *  - Thumbnail strip on right with active glow
 *  - Progress bar timer indicator
 *  - Keyboard-accessible prev/next
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Star, Compass, Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TMDBMovie } from '@/server/tmdbCache';
import ImageWithFallback from '@/components/ImageWithFallback';

const SLIDE_INTERVAL_MS = 9000;

interface HeroBannerProps {
  movies: TMDBMovie[];
  loading?: boolean;
}

function formatYear(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 4);
}

export default function HeroBanner({ movies, loading }: HeroBannerProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [inWatchlist, setInWatchlist] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((next: number, dir: 1 | -1) => {
    setDirection(dir);
    setIndex(next);
  }, []);

  const advance = useCallback(() => {
    if (movies.length === 0) return;
    setDirection(1);
    setIndex(i => (i + 1) % movies.length);
  }, [movies.length]);

  useEffect(() => {
    if (paused || movies.length <= 1) return;
    timerRef.current = setInterval(advance, SLIDE_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, advance, movies.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go((index - 1 + movies.length) % movies.length, -1);
      if (e.key === 'ArrowRight') go((index + 1) % movies.length, 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, movies.length, go]);

  if (loading) {
    return (
      <div className="relative h-[80vh] overflow-hidden">
        <div className="absolute inset-0 shimmer" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="relative h-full flex items-end pb-20 px-8 lg:px-16">
          <div className="space-y-4 max-w-lg">
            <div className="h-3 w-28 bg-muted rounded-full" />
            <div className="h-14 w-96 bg-muted rounded-xl" />
            <div className="h-3 w-64 bg-muted rounded-full" />
            <div className="h-16 w-full max-w-sm bg-muted rounded-xl" />
            <div className="flex gap-3">
              <div className="h-10 w-32 bg-muted rounded-xl" />
              <div className="h-10 w-32 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (movies.length === 0) return null;

  const movie = movies[index];

  return (
    <div
      className="relative h-[80vh] overflow-hidden select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Backdrop ── */}
      <AnimatePresence mode="sync" custom={direction}>
        <motion.div
          key={movie.id}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, scale: 1.04, x: d * 40 }),
            center: { opacity: 1, scale: 1, x: 0 },
            exit: (d: number) => ({ opacity: 0, scale: 0.98, x: d * -40 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.7, ease: 'easeInOut' as const }}
          className="absolute inset-0"
        >
          {movie.backdropUrl ? (
            <ImageWithFallback
              src={movie.backdropUrl}
              alt={movie.title}
              className="w-full h-full object-cover"
              fallbackClassName="w-full h-full bg-gradient-to-br from-primary/20 to-background"
              style={{ filter: 'brightness(0.5) saturate(1.1)' }}
            />
          ) : movie.posterUrl ? (
            <ImageWithFallback
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover object-top"
              fallbackClassName="w-full h-full bg-gradient-to-br from-primary/20 to-background"
              style={{ filter: 'brightness(0.4) blur(6px) saturate(1.2)' }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-background" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Multi-layer gradient overlays for depth ── */}
      {/* Left-to-right: content area */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent pointer-events-none" />
      {/* Bottom-to-top: blends into page */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />
      {/* Top vignette for header readability */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      {/* ── Thumbnail strip (right side) ── */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-2 z-10">
        {movies.slice(0, 6).map((m, i) => (
          <motion.button
            key={m.id}
            onClick={() => go(i, i > index ? 1 : -1)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className={`relative w-14 h-20 rounded-lg overflow-hidden border-2 transition-all duration-300 ${
              i === index
                ? 'border-primary shadow-lg shadow-primary/40 scale-110'
                : 'border-transparent opacity-45 hover:opacity-75'
            }`}
          >
            {m.posterUrl ? (
              <ImageWithFallback src={m.posterUrl} alt={m.title} className="w-full h-full object-cover" fallbackClassName="w-full h-full bg-muted" />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
            {i === index && (
              <div className="absolute inset-0 ring-2 ring-primary/60 rounded-lg" />
            )}
          </motion.button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative h-full flex items-end pb-20 px-6 sm:px-10 lg:px-16 max-w-screen-2xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={movie.id}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
            className="max-w-2xl"
          >
            {/* Badge row */}
            <div className="flex items-center gap-2.5 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 border border-primary/35 text-primary text-[11px] font-bold uppercase tracking-widest">
                New This Month
              </span>
              {movie.vote_average > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-bold">
                  <Star className="w-3 h-3 fill-yellow-400" />
                  {movie.vote_average.toFixed(1)}
                </span>
              )}
              {movie.release_date && (
                <span className="text-xs text-muted-foreground font-medium">
                  {formatYear(movie.release_date)}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-heading text-foreground tracking-wide mb-3 leading-none drop-shadow-2xl">
              {movie.title}
            </h1>

            {/* Genre pills */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {movie.genres.slice(0, 4).map(g => (
                  <span key={g} className="px-2.5 py-1 rounded-full glass text-xs text-foreground/80 font-medium">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            {movie.overview && (
              <p className="text-sm text-foreground/70 mb-6 line-clamp-3 leading-relaxed max-w-lg">
                {movie.overview}
              </p>
            )}

            {/* CTA buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <motion.button
                onClick={() => navigate('/discover')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/85 text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/30 hover:shadow-primary/50"
              >
                <Compass className="w-4 h-4" />
                Explore in Discover
              </motion.button>

              <motion.button
                onClick={() => setInWatchlist(v => !v)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 glass hover:bg-white/15 text-foreground px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              >
                {inWatchlist
                  ? <><Check className="w-4 h-4 text-primary" /> In Watchlist</>
                  : <><Plus className="w-4 h-4" /> Add to Watchlist</>
                }
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Prev / Next arrows ── */}
      <button
        onClick={() => go((index - 1 + movies.length) % movies.length, -1)}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass-dark flex items-center justify-center text-white hover:bg-white/20 transition-all z-10"
        aria-label="Previous"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => go((index + 1) % movies.length, 1)}
        className="absolute right-24 xl:right-28 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass-dark flex items-center justify-center text-white hover:bg-white/20 transition-all z-10"
        aria-label="Next"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* ── Dot indicators ── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {movies.slice(0, 10).map((_, i) => (
          <button
            key={i}
            onClick={() => go(i, i > index ? 1 : -1)}
            className={`rounded-full transition-all duration-400 ${
              i === index
                ? 'w-8 h-1.5 bg-primary shadow-sm shadow-primary/60'
                : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/50'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* ── Auto-advance progress bar ── */}
      {!paused && movies.length > 1 && (
        <motion.div
          key={`${movie.id}-progress`}
          className="absolute bottom-0 left-0 h-0.5 bg-primary/70"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: SLIDE_INTERVAL_MS / 1000, ease: 'linear' as const }}
        />
      )}
    </div>
  );
}
