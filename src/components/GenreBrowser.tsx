/**
 * GenreBrowser — Genre tab for the Discover page.
 *
 * Layout:
 *   • Genre pill selector at the top (Action, Comedy, Horror, …)
 *   • Two horizontal scroll carousels per genre:
 *       1. "Must See"      — all-time classics (high vote_average + vote_count)
 *       2. "Top Rated Now" — currently popular titles
 *   • Every card has Trailer, Download, and Watchlist buttons
 *
 * Data: fetched from GET /api/tmdb/genres?genreId=<id> on demand.
 * Per-genre results are cached in a React ref so switching genres is instant
 * after the first load.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star, Download, Bookmark, BookmarkCheck, Play,
  ChevronLeft, ChevronRight, Loader2, Trophy, Flame,
} from 'lucide-react';
import { X, Volume2, VolumeX } from 'lucide-react';
import type { TMDBMovie } from '@/server/tmdbCache';
import { useMedia } from '@/context/MediaContext';
import { fetchTrailerKey } from '@/lib/trailerCache';
import ImageWithFallback from '@/components/ImageWithFallback';
import StremioDownloadModal, { DownloadTarget } from '@/components/StremioDownloadModal';

// ── Genre definitions ─────────────────────────────────────────────────────────

interface GenreDef {
  id: number;
  name: string;
  emoji: string;
}

const MOVIE_GENRES: GenreDef[] = [
  { id: 28,    name: 'Action',      emoji: '💥' },
  { id: 35,    name: 'Comedy',      emoji: '😂' },
  { id: 18,    name: 'Drama',       emoji: '🎭' },
  { id: 27,    name: 'Horror',      emoji: '👻' },
  { id: 878,   name: 'Sci-Fi',      emoji: '🚀' },
  { id: 53,    name: 'Thriller',    emoji: '🔪' },
  { id: 10749, name: 'Romance',     emoji: '❤️' },
  { id: 16,    name: 'Animation',   emoji: '🎨' },
  { id: 12,    name: 'Adventure',   emoji: '🗺️' },
  { id: 80,    name: 'Crime',       emoji: '🕵️' },
  { id: 14,    name: 'Fantasy',     emoji: '🧙' },
  { id: 9648,  name: 'Mystery',     emoji: '🔍' },
  { id: 99,    name: 'Documentary', emoji: '🎬' },
  { id: 10751, name: 'Family',      emoji: '👨‍👩‍👧' },
  { id: 37,    name: 'Western',     emoji: '🤠' },
  { id: 10752, name: 'War',         emoji: '⚔️' },
];

// TV show genres use different TMDB IDs
const TV_GENRES: GenreDef[] = [
  { id: 10759, name: 'Action & Adventure', emoji: '💥' },
  { id: 35,    name: 'Comedy',             emoji: '😂' },
  { id: 18,    name: 'Drama',              emoji: '🎭' },
  { id: 9648,  name: 'Mystery',            emoji: '🔍' },
  { id: 10765, name: 'Sci-Fi & Fantasy',   emoji: '🚀' },
  { id: 80,    name: 'Crime',              emoji: '🕵️' },
  { id: 10768, name: 'War & Politics',     emoji: '⚔️' },
  { id: 16,    name: 'Animation',          emoji: '🎨' },
  { id: 10751, name: 'Family',             emoji: '👨‍👩‍👧' },
  { id: 10762, name: 'Kids',               emoji: '🧒' },
  { id: 10763, name: 'News',               emoji: '📰' },
  { id: 10764, name: 'Reality',            emoji: '📺' },
  { id: 10766, name: 'Soap',               emoji: '🫧' },
  { id: 10767, name: 'Talk',               emoji: '🎙️' },
  { id: 99,    name: 'Documentary',        emoji: '🎬' },
];

type MediaType = 'movie' | 'tv';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenreData {
  mustSee: TMDBMovie[];
  topRated: TMDBMovie[];
}


// ── Trailer modal (inline, reused from discover page pattern) ─────────────────

function TrailerModal({
  movie, onClose,
}: { movie: TMDBMovie; onClose: () => void }) {
  const [trailerKey, setTrailerKey] = useState<string | null | 'loading'>('loading');
  const [muted, setMuted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const year = movie.release_date ? movie.release_date.slice(0, 4) : undefined;
    fetchTrailerKey(movie.title, year, 'movie').then(k => setTrailerKey(k));
  }, [movie]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' as const }}
          className="relative w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative w-full aspect-video bg-black">
            {trailerKey === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
              </div>
            )}
            {trailerKey === null && (
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageWithFallback
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="h-full w-full object-contain opacity-30"
                  fallbackClassName="h-full w-full opacity-30"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-white/60 text-sm font-medium">No trailer available</p>
                </div>
              </div>
            )}
            {trailerKey && trailerKey !== 'loading' && (
              <>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&iv_load_policy=3&color=white`}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  title={`${movie.title} — Official Trailer`}
                />
                <button
                  onClick={() => setMuted(m => !m)}
                  className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>

          <div className="p-4">
            <h2 className="text-base font-bold text-foreground">{movie.title}</h2>
            {movie.release_date && (
              <p className="text-xs text-muted-foreground mt-0.5">{movie.release_date.slice(0, 4)}</p>
            )}
            {movie.overview && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">{movie.overview}</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Genre movie card ──────────────────────────────────────────────────────────

function GenreCard({
  movie, inWatchlist, alreadyInLibrary,
  onAddToWatchlist, onRemoveFromWatchlist, onDownload,
}: {
  movie: TMDBMovie;
  inWatchlist: boolean;
  alreadyInLibrary: boolean;
  onAddToWatchlist: () => void;
  onRemoveFromWatchlist: () => void;
  onDownload: (m: TMDBMovie) => void;
}) {
  const [showTrailer, setShowTrailer] = useState(false);

  return (
    <>
      <div className="flex-shrink-0 w-36 sm:w-40 group">
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted mb-2">
          <ImageWithFallback
            src={movie.posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            fallbackClassName="w-full h-full"
            loading="lazy"
          />

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
            <button
              onClick={() => setShowTrailer(true)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors"
              title="Watch trailer"
            >
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => onDownload(movie)}
                disabled={alreadyInLibrary}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  alreadyInLibrary
                    ? 'bg-green-500/80 text-white cursor-default'
                    : 'bg-primary hover:bg-primary/80 text-primary-foreground'
                }`}
              >
                <Download className="w-2.5 h-2.5" />
                {alreadyInLibrary ? 'Owned' : 'Get'}
              </button>
              <button
                onClick={() => inWatchlist ? onRemoveFromWatchlist() : onAddToWatchlist()}
                className={`p-1 rounded-lg transition-colors ${
                  inWatchlist ? 'bg-primary/80 text-white' : 'bg-black/40 text-white hover:bg-black/60'
                }`}
                title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                {inWatchlist
                  ? <BookmarkCheck className="w-3 h-3" />
                  : <Bookmark className="w-3 h-3" />
                }
              </button>
            </div>
          </div>

          {/* Rating badge */}
          {movie.vote_average > 0 && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5">
              <Star className="w-2 h-2 text-yellow-400 fill-yellow-400" />
              <span className="text-[9px] text-white font-semibold">{movie.vote_average.toFixed(1)}</span>
            </div>
          )}
          {alreadyInLibrary && (
            <div className="absolute top-1.5 right-1.5 bg-green-500/90 rounded-full px-1.5 py-0.5">
              <span className="text-[8px] text-white font-bold uppercase tracking-wide">Owned</span>
            </div>
          )}
        </div>

        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2 px-0.5">{movie.title}</p>
        {movie.release_date && (
          <p className="text-xs text-muted-foreground mt-1 px-0.5">{movie.release_date.slice(0, 4)}</p>
        )}
      </div>

      {showTrailer && (
        <TrailerModal movie={movie} onClose={() => setShowTrailer(false)} />
      )}
    </>
  );
}

// ── Horizontal carousel ───────────────────────────────────────────────────────

function HorizontalCarousel({
  title, icon: Icon, iconColor, movies, watchlist, libraryTitles,
  onAddToWatchlist, onRemoveFromWatchlist, onDownload,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  movies: TMDBMovie[];
  watchlist: string[];
  libraryTitles: Set<string>;
  onAddToWatchlist: (id: string) => void;
  onRemoveFromWatchlist: (id: string) => void;
  onDownload: (m: TMDBMovie) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'right' ? 320 : -320, behavior: 'smooth' });
  };

  if (movies.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <span className="text-[10px] text-muted-foreground">({movies.length})</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            className="w-7 h-7 rounded-full border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-7 h-7 rounded-full border border-border bg-card hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {movies.map(movie => (
          <GenreCard
            key={movie.id}
            movie={movie}
            inWatchlist={watchlist.includes(`tmdb-${movie.id}`)}
            alreadyInLibrary={libraryTitles.has(movie.title.toLowerCase())}
            onAddToWatchlist={() => onAddToWatchlist(`tmdb-${movie.id}`)}
            onRemoveFromWatchlist={() => onRemoveFromWatchlist(`tmdb-${movie.id}`)}
            onDownload={onDownload}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main GenreBrowser ─────────────────────────────────────────────────────────

export default function GenreBrowser() {
  const { library, watchlist, addToWatchlist, removeFromWatchlist } = useMedia();
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [activeGenre, setActiveGenre] = useState<GenreDef>(MOVIE_GENRES[0]);
  const [genreData, setGenreData] = useState<GenreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null);

  // Separate caches for movies and TV so switching back is instant
  const movieCache = useRef<Map<number, GenreData>>(new Map());
  const tvCache    = useRef<Map<number, GenreData>>(new Map());

  const libraryTitles = new Set(library.map(m => m.title.toLowerCase()));

  const loadGenre = useCallback(async (genre: GenreDef, type: MediaType) => {
    setActiveGenre(genre);
    setError(null);

    const cache = type === 'tv' ? tvCache : movieCache;

    if (cache.current.has(genre.id)) {
      setGenreData(cache.current.get(genre.id)!);
      return;
    }

    setLoading(true);
    setGenreData(null);
    try {
      const res = await fetch(`/api/tmdb/genres?genreId=${genre.id}&mediaType=${type}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as GenreData;
      cache.current.set(genre.id, data);
      setGenreData(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Switch media type — reset to first genre of the new type
  const handleMediaTypeSwitch = useCallback((type: MediaType) => {
    setMediaType(type);
    const genres = type === 'tv' ? TV_GENRES : MOVIE_GENRES;
    loadGenre(genres[0], type);
  }, [loadGenre]);

  // Load first movie genre on mount
  useEffect(() => {
    loadGenre(MOVIE_GENRES[0], 'movie');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = useCallback((movie: TMDBMovie) => {
    setDownloadTarget({
      title: movie.title,
      posterUrl: movie.posterUrl,
      release_date: movie.release_date,
      type: mediaType === 'tv' ? 'series' : 'movie',
    });
  }, [mediaType]);

  const genres = mediaType === 'tv' ? TV_GENRES : MOVIE_GENRES;

  return (
    <>
      {/* Movies / TV Shows toggle */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex bg-card border border-border rounded-lg p-1 gap-1">
          <button
            onClick={() => handleMediaTypeSwitch('movie')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              mediaType === 'movie'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎬 Movies
          </button>
          <button
            onClick={() => handleMediaTypeSwitch('tv')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              mediaType === 'tv'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📺 TV Shows
          </button>
        </div>
      </div>

      {/* Genre pill selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-8" style={{ scrollbarWidth: 'none' }}>
        {genres.map(genre => (
          <button
            key={genre.id}
            onClick={() => loadGenre(genre, mediaType)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              activeGenre.id === genre.id
                ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
            }`}
          >
            <span className="text-base leading-none">{genre.emoji}</span>
            {genre.name}
          </button>
        ))}
      </div>

      {/* Genre header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">{activeGenre.emoji}</span>
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">{activeGenre.name}</h2>
          <p className="text-xs text-muted-foreground">
            {mediaType === 'tv' ? "Must-see series and what's trending right now" : "Must-see classics and what's hot right now"}
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading {activeGenre.name} titles…</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-center py-16">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button
            onClick={() => loadGenre(activeGenre, mediaType)}
            className="text-xs text-primary hover:text-primary/80"
          >
            Try again
          </button>
        </div>
      )}

      {/* Carousels */}
      <AnimatePresence mode="wait">
        {genreData && !loading && (
          <motion.div
            key={`${mediaType}-${activeGenre.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {genreData.mustSee.length === 0 && genreData.topRated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground text-sm">No titles found for this genre yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Add your TMDB API Key in Settings to pull live data.</p>
              </div>
            ) : (
              <>
                <HorizontalCarousel
                  title="Must See"
                  icon={Trophy}
                  iconColor="text-yellow-500"
                  movies={genreData.mustSee}
                  watchlist={watchlist}
                  libraryTitles={libraryTitles}
                  onAddToWatchlist={addToWatchlist}
                  onRemoveFromWatchlist={removeFromWatchlist}
                  onDownload={handleDownload}
                />
                <HorizontalCarousel
                  title={mediaType === 'tv' ? 'Trending Right Now' : 'Top Rated Right Now'}
                  icon={Flame}
                  iconColor="text-orange-500"
                  movies={genreData.topRated}
                  watchlist={watchlist}
                  libraryTitles={libraryTitles}
                  onAddToWatchlist={addToWatchlist}
                  onRemoveFromWatchlist={removeFromWatchlist}
                  onDownload={handleDownload}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Download modal */}
      <AnimatePresence>
        {downloadTarget && (
          <StremioDownloadModal
            target={downloadTarget}
            onClose={() => setDownloadTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

