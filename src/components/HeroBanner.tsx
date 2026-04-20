/**
 * HeroBanner — auto-scrolling banner of new movie release posters.
 *
 * - Cycles through TMDB "upcoming this month" posters every 8 seconds
 * - Shows title, release date, genres, rating, overview
 * - Pauses auto-advance on hover
 * - Dot indicators + prev/next arrows
 * - Graceful skeleton while loading
 * - Falls back to library hero if no TMDB data
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Star, Calendar, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TMDBMovie } from '@/server/tmdbCache';
import ImageWithFallback from '@/components/ImageWithFallback';

const SLIDE_INTERVAL_MS = 8000;

interface HeroBannerProps {
  movies: TMDBMovie[];
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

export default function HeroBanner({ movies, loading }: HeroBannerProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
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

  // Auto-advance
  useEffect(() => {
    if (paused || movies.length <= 1) return;
    timerRef.current = setInterval(advance, SLIDE_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, advance, movies.length]);

  const prev = () => {
    if (movies.length === 0) return;
    go((index - 1 + movies.length) % movies.length, -1);
  };
  const next = () => {
    if (movies.length === 0) return;
    go((index + 1) % movies.length, 1);
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="relative h-[72vh] bg-card animate-pulse overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
        <div className="absolute bottom-16 left-8 sm:left-12 space-y-3 max-w-lg">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-10 w-80 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded" />
          <div className="h-16 w-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // ── No data ──
  if (movies.length === 0) return null;

  const movie = movies[index];

  return (
    <div
      className="relative h-[72vh] overflow-hidden select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Backdrop ── */}
      <AnimatePresence mode="sync" custom={direction}>
        <motion.div
          key={movie.id}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: d * 60 }),
            center: { opacity: 1, x: 0 },
            exit: (d: number) => ({ opacity: 0, x: d * -60 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.6, ease: 'easeInOut' as const }}
          className="absolute inset-0"
        >
          {movie.backdropUrl ? (
            <ImageWithFallback
              src={movie.backdropUrl}
              alt={movie.title}
              className="w-full h-full object-cover scale-105"
              fallbackClassName="w-full h-full scale-105 bg-gradient-to-br from-primary/20 to-background"
              style={{ filter: 'brightness(0.45)' }}
            />
          ) : movie.posterUrl ? (
            <ImageWithFallback
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover object-top scale-105"
              fallbackClassName="w-full h-full scale-105 bg-gradient-to-br from-primary/20 to-background"
              style={{ filter: 'brightness(0.45) blur(4px)' }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/55 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />

      {/* ── Poster thumbnail strip (right side) ── */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-2 z-10">
        {movies.slice(0, 6).map((m, i) => (
          <button
            key={m.id}
            onClick={() => go(i, i > index ? 1 : -1)}
            className={`w-12 h-16 rounded-md overflow-hidden border-2 transition-all duration-200 ${
              i === index ? 'border-primary scale-110 shadow-lg shadow-primary/30' : 'border-transparent opacity-50 hover:opacity-80'
            }`}
          >
            {m.posterUrl ? (
              <ImageWithFallback src={m.posterUrl} alt={m.title} className="w-full h-full object-cover" fallbackClassName="w-full h-full bg-muted" />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative h-full flex items-end pb-16 px-4 sm:px-8 lg:px-12 max-w-screen-2xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={movie.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: 'easeOut' as const }}
            className="max-w-xl"
          >
            {/* "New This Month" badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] font-semibold uppercase tracking-wide">
                <Calendar className="w-3 h-3" />
                New This Month
              </span>
              {movie.vote_average > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-semibold">
                  <Star className="w-3 h-3 fill-yellow-400" />
                  {movie.vote_average.toFixed(1)}
                </span>
              )}
            </div>

            <h2 className="text-4xl sm:text-5xl font-heading text-foreground tracking-wide mb-2 leading-tight">
              {movie.title}
            </h2>

            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground flex-wrap">
              {movie.release_date && <span>{formatDate(movie.release_date)}</span>}
              {movie.genres && movie.genres.slice(0, 3).map(g => (
                <span key={g} className="px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{g}</span>
              ))}
            </div>

            {movie.overview && (
              <p className="text-sm text-foreground/75 mb-5 line-clamp-3 leading-relaxed max-w-md">
                {movie.overview}
              </p>
            )}

            <button
              onClick={() => navigate('/discover')}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/80 text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            >
              <Compass className="w-4 h-4" />
              View in Discover
            </button>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Prev / Next arrows ── */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors z-10 backdrop-blur-sm"
        aria-label="Previous"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-20 lg:right-24 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors z-10 backdrop-blur-sm"
        aria-label="Next"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* ── Dot indicators ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {movies.slice(0, 10).map((_, i) => (
          <button
            key={i}
            onClick={() => go(i, i > index ? 1 : -1)}
            className={`rounded-full transition-all duration-300 ${
              i === index
                ? 'w-6 h-1.5 bg-primary'
                : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Progress bar (auto-advance timer) */}
      {!paused && movies.length > 1 && (
        <motion.div
          key={`${movie.id}-progress`}
          className="absolute bottom-0 left-0 h-0.5 bg-primary/60"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: SLIDE_INTERVAL_MS / 1000, ease: 'linear' as const }}
        />
      )}
    </div>
  );
}
