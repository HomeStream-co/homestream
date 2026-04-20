/**
 * Discover page — /discover
 *
 * Three sections:
 *  1. "New This Month"   — TMDB upcoming releases (current month window)
 *  2. "Trending Now"     — TMDB trending this week
 *  3. "Recommended For You" — based on genres + actors in your library
 *
 * Each card shows:
 *  - Poster, title, release date, genres, rating, overview snippet
 *  - "Download" button → triggers Stremio search / qBittorrent download
 *  - "Add to Watchlist" toggle
 *
 * Data: fetched once from /api/tmdb (30-day cache). No background polling.
 * Offline: shows last cached data with a "Showing cached data" notice.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Compass, Star, Calendar, Download, Bookmark, BookmarkCheck,
  Loader2, WifiOff, RefreshCw, Film, TrendingUp, Sparkles,
  ChevronDown, Search, X, Tv2, Clapperboard, Play, Volume2, VolumeX,
} from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import { useTMDBContext } from '@/context/TMDBContext';
import type { TMDBMovie } from '@/server/tmdbCache';
import { fetchTrailerKey } from '@/lib/trailerCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function formatRating(r: number) {
  if (!r) return null;
  return r.toFixed(1);
}

// ── Trailer Modal ─────────────────────────────────────────────────────────────

interface TrailerModalProps {
  movie: TMDBMovie;
  inWatchlist: boolean;
  alreadyInLibrary: boolean;
  onClose: () => void;
  onDownload: (movie: TMDBMovie) => void;
  onAddToWatchlist: () => void;
  onRemoveFromWatchlist: () => void;
}

function TrailerModal({
  movie, inWatchlist, alreadyInLibrary,
  onClose, onDownload, onAddToWatchlist, onRemoveFromWatchlist,
}: TrailerModalProps) {
  const [trailerKey, setTrailerKey] = useState<string | null | 'loading'>('loading');
  const [muted, setMuted] = useState(false); // start unmuted — user explicitly opened trailer
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const year = movie.release_date ? movie.release_date.slice(0, 4) : undefined;
    fetchTrailerKey(movie.title, year, 'movie').then(key => setTrailerKey(key));
  }, [movie]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const year = movie.release_date ? movie.release_date.slice(0, 4) : '';

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Video area */}
          <div className="relative w-full aspect-video bg-black">
            {trailerKey === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
              </div>
            )}

            {trailerKey === null && (
              /* No trailer found — show backdrop/poster */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/20">
                {movie.posterUrl ? (
                  <img
                    src={movie.posterUrl}
                    alt={movie.title}
                    className="h-full w-full object-contain opacity-30"
                  />
                ) : (
                  <Film className="w-16 h-16 text-muted-foreground/30" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <p className="text-white/60 text-sm font-medium">No trailer available</p>
                    <p className="text-white/30 text-xs mt-1">TMDB doesn't have a trailer for this title yet</p>
                  </div>
                </div>
              </div>
            )}

            {trailerKey && trailerKey !== 'loading' && (
              <>
                {/*
                  youtube-nocookie.com = YouTube's privacy-enhanced mode.
                  This is the same domain Stremio uses — it strips tracking cookies
                  and suppresses most pre-roll ads because no user profile is attached.
                  Not 100% ad-free but significantly cleaner than youtube.com.
                */}
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&iv_load_policy=3&color=white`}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  title={`${movie.title} — Official Trailer`}
                />
                {/* Mute toggle overlay */}
                <button
                  onClick={() => setMuted(m => !m)}
                  className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>

          {/* Info + actions */}
          <div className="p-4 flex flex-col gap-3">
            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground leading-tight">{movie.title}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {year && <span className="text-xs text-muted-foreground">{year}</span>}
                  {movie.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      {formatRating(movie.vote_average)}
                    </span>
                  )}
                  {movie.genres && movie.genres.slice(0, 3).map(g => (
                    <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{g}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Overview */}
            {movie.overview && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {movie.overview}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => { onDownload(movie); onClose(); }}
                disabled={alreadyInLibrary}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  alreadyInLibrary
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                }`}
              >
                <Download className="w-4 h-4" />
                {alreadyInLibrary ? 'Already in Library' : 'Download'}
              </button>

              <button
                onClick={() => inWatchlist ? onRemoveFromWatchlist() : onAddToWatchlist()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  inWatchlist
                    ? 'border-primary bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                {inWatchlist
                  ? <><BookmarkCheck className="w-4 h-4" /> Saved</>
                  : <><Bookmark className="w-4 h-4" /> My List</>
                }
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Movie card ────────────────────────────────────────────────────────────────

interface MovieCardProps {
  movie: TMDBMovie;
  inWatchlist: boolean;
  alreadyInLibrary: boolean;
  onAddToWatchlist: () => void;
  onRemoveFromWatchlist: () => void;
  onDownload: (movie: TMDBMovie) => void;
}

function MovieCard({
  movie, inWatchlist, alreadyInLibrary,
  onAddToWatchlist, onRemoveFromWatchlist, onDownload,
}: MovieCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group hover:border-primary/40 transition-colors"
      >
        {/* Poster */}
        <div className="relative aspect-[2/3] overflow-hidden bg-muted flex-shrink-0">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-10 h-10 text-muted-foreground/40" />
            </div>
          )}

          {/* Trailer play button — appears on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <button
              onClick={() => setShowTrailer(true)}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors"
              title="Watch trailer"
            >
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </button>
          </div>

          {/* Rating badge */}
          {movie.vote_average > 0 && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] text-white font-semibold">{formatRating(movie.vote_average)}</span>
            </div>
          )}
          {/* Already in library badge */}
          {alreadyInLibrary && (
            <div className="absolute top-2 right-2 bg-green-500/90 backdrop-blur-sm rounded-full px-2 py-0.5">
              <span className="text-[9px] text-white font-bold uppercase tracking-wide">In Library</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col flex-1">
          <h3 className="text-sm font-semibold text-foreground leading-tight mb-1 line-clamp-2">
            {movie.title}
          </h3>

          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {movie.release_date && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="w-2.5 h-2.5" />
                {formatDate(movie.release_date)}
              </span>
            )}
          </div>

          {/* Genres */}
          {movie.genres && movie.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {movie.genres.slice(0, 3).map(g => (
                <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview (expandable) */}
          {movie.overview && (
            <div className="mb-2">
              <p className={`text-[11px] text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                {movie.overview}
              </p>
              {movie.overview.length > 100 && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="text-[10px] text-primary hover:text-primary/80 mt-0.5 flex items-center gap-0.5"
                >
                  {expanded ? 'Less' : 'More'}
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Actions: Trailer + Download + Watchlist */}
          <div className="flex items-center gap-1.5 mt-2">
            {/* Trailer button */}
            <button
              onClick={() => setShowTrailer(true)}
              className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground text-xs font-semibold transition-colors"
              title="Watch trailer"
            >
              <Play className="w-3 h-3" />
              Trailer
            </button>

            {/* Download button */}
            <button
              onClick={() => onDownload(movie)}
              disabled={alreadyInLibrary}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                alreadyInLibrary
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/80 text-primary-foreground'
              }`}
            >
              <Download className="w-3 h-3" />
              {alreadyInLibrary ? 'In Library' : 'Download'}
            </button>

            {/* Watchlist */}
            <button
              onClick={() => inWatchlist ? onRemoveFromWatchlist() : onAddToWatchlist()}
              className={`p-2 rounded-lg border transition-colors ${
                inWatchlist
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
              }`}
              title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist
                ? <BookmarkCheck className="w-3.5 h-3.5" />
                : <Bookmark className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>
      </motion.div>

      {/* Trailer modal — rendered outside the card so it's not clipped */}
      {showTrailer && (
        <TrailerModal
          movie={movie}
          inWatchlist={inWatchlist}
          alreadyInLibrary={alreadyInLibrary}
          onClose={() => setShowTrailer(false)}
          onDownload={onDownload}
          onAddToWatchlist={onAddToWatchlist}
          onRemoveFromWatchlist={onRemoveFromWatchlist}
        />
      )}
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, movies, libraryTitles, watchlist,
  onAddToWatchlist, onRemoveFromWatchlist, onDownload,
}: {
  title: string;
  icon: React.ElementType;
  movies: TMDBMovie[];
  libraryTitles: Set<string>;
  watchlist: string[];
  onAddToWatchlist: (id: string) => void;
  onRemoveFromWatchlist: (id: string) => void;
  onDownload: (movie: TMDBMovie) => void;
}) {
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const visible = movies.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < movies.length;

  if (movies.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-bold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">({movies.length})</span>
        </div>
        {page > 1 && (
          <button
            onClick={() => setPage(1)}
            className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3 rotate-180" />
            Show less
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        <AnimatePresence mode="popLayout">
          {visible.map(movie => (
            <MovieCard
              key={movie.id}
              movie={movie}
              inWatchlist={watchlist.includes(`tmdb-${movie.id}`)}
              alreadyInLibrary={libraryTitles.has(movie.title.toLowerCase())}
              onAddToWatchlist={() => onAddToWatchlist(`tmdb-${movie.id}`)}
              onRemoveFromWatchlist={() => onRemoveFromWatchlist(`tmdb-${movie.id}`)}
              onDownload={onDownload}
            />
          ))}
        </AnimatePresence>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border hover:border-primary/40 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            Load more ({movies.length - visible.length} remaining)
          </button>
        </div>
      )}
    </section>
  );
}

// ── Stremio download modal ────────────────────────────────────────────────────

interface DownloadTarget {
  title: string;
  posterUrl?: string;
  release_date?: string;
  imdbId?: string;       // from direct search results
  tmdbId?: number;       // from TMDB cards
  type: 'movie' | 'series';
}

function DownloadModal({ target, onClose }: { target: DownloadTarget; onClose: () => void }) {
  const [searching, setSearching] = useState(false);
  const [streams, setStreams] = useState<{ name: string; title: string; url: string; imdbId: string }[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setError('');
    try {
      // Step 1: resolve IMDB ID via Cinemeta
      let imdbId = target.imdbId;
      if (!imdbId) {
        const metaRes = await fetch(
          `https://v3-cinemeta.strem.io/catalog/${target.type}/top/search=${encodeURIComponent(target.title)}.json`
        );
        const metaData = await metaRes.json() as { metas?: { id: string; name: string }[] };
        imdbId = metaData.metas?.[0]?.id;
        if (!imdbId) throw new Error('Title not found in Cinemeta');
      }

      // Step 2: fetch streams from Torrentio
      const streamRes = await fetch(
        `https://torrentio.strem.fun/sort=seeders/stream/${target.type}/${imdbId}.json`
      );
      const streamData = await streamRes.json() as {
        streams?: { name: string; title: string; infoHash: string }[]
      };
      const found = (streamData.streams ?? []).slice(0, 10).map(s => ({
        name: s.name,
        title: s.title,
        url: s.infoHash,
        imdbId: imdbId!,
      }));
      if (found.length === 0) throw new Error('No streams found — try a different title');
      setStreams(found);
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  const startDownload = async (stream: { name: string; title: string; url: string; imdbId: string }) => {
    setDownloading(stream.url);
    try {
      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: stream.imdbId,
          infoHash: stream.url,
          title: target.title,
          type: target.type,
          quality: stream.name,
          poster: target.posterUrl,
          streams: [{ infoHash: stream.url, magnet: `magnet:?xt=urn:btih:${stream.url}`, quality: stream.name, name: stream.name, size: '', seeds: '' }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onClose();
    } catch {
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {target.posterUrl && (
              <img src={target.posterUrl} alt={target.title} className="w-8 h-12 rounded object-cover" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{target.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{target.type} · {target.release_date ? formatDate(target.release_date) : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {streams.length === 0 && !searching && !error && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Search for available torrents to download to your HomeStream server.
              </p>
              <button
                onClick={search}
                className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm mx-auto transition-colors"
              >
                <Search className="w-4 h-4" />
                Search Torrents
              </button>
            </div>
          )}

          {searching && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching for streams…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-4">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button onClick={search} className="text-xs text-primary hover:text-primary/80">Try again</button>
            </div>
          )}

          {streams.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Select a quality to download:</p>
              {streams.map(s => (
                <button
                  key={s.url}
                  onClick={() => startDownload(s)}
                  disabled={!!downloading}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{s.title}</p>
                  </div>
                  {downloading === s.url ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Direct search (Cinemeta) ──────────────────────────────────────────────────

interface CinemetaResult {
  id: string;
  name: string;
  year?: number;
  poster?: string;
  description?: string;
  imdbRating?: string;
  genres?: string[];
  type: 'movie' | 'series';
}

function DirectSearchCard({
  result, alreadyInLibrary, onDownload,
}: {
  result: CinemetaResult;
  alreadyInLibrary: boolean;
  onDownload: (r: CinemetaResult) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group hover:border-primary/40 transition-colors">
      <div className="relative aspect-[2/3] overflow-hidden bg-muted flex-shrink-0">
        {result.poster ? (
          <img src={result.poster} alt={result.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {result.type === 'series' ? <Tv2 className="w-10 h-10 text-muted-foreground/40" /> : <Film className="w-10 h-10 text-muted-foreground/40" />}
          </div>
        )}
        {result.imdbRating && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] text-white font-semibold">{result.imdbRating}</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-muted/80 backdrop-blur-sm rounded-full px-2 py-0.5">
          <span className="text-[9px] text-foreground font-bold uppercase tracking-wide">{result.type === 'series' ? 'TV' : 'Movie'}</span>
        </div>
        {alreadyInLibrary && (
          <div className="absolute bottom-2 left-2 bg-green-500/90 backdrop-blur-sm rounded-full px-2 py-0.5">
            <span className="text-[9px] text-white font-bold uppercase tracking-wide">In Library</span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-foreground leading-tight mb-1 line-clamp-2">{result.name}</h3>
        {result.year && <p className="text-[10px] text-muted-foreground mb-1">{result.year}</p>}
        {result.genres && result.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {result.genres.slice(0, 3).map(g => (
              <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{g}</span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onDownload(result)}
          disabled={alreadyInLibrary}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors mt-2 ${
            alreadyInLibrary
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary hover:bg-primary/80 text-primary-foreground'
          }`}
        >
          <Download className="w-3 h-3" />
          {alreadyInLibrary ? 'In Library' : 'Download'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const { library, watchlist, addToWatchlist, removeFromWatchlist } = useMedia();
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'movies' | 'shows' | 'search'>('movies');

  // Direct search state
  const [directQuery, setDirectQuery] = useState('');
  const [directType, setDirectType] = useState<'movie' | 'series'>('movie');
  const [directResults, setDirectResults] = useState<CinemetaResult[]>([]);
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState('');

  const { upcoming, trending, trendingShows, recommended, loading, stale, error, refresh, lastRefreshed } = useTMDBContext();

  const libraryTitles = useMemo(
    () => new Set(library.map(m => m.title.toLowerCase())),
    [library]
  );

  const filterMovies = (movies: TMDBMovie[]) => {
    if (!searchQuery.trim()) return movies;
    const q = searchQuery.toLowerCase();
    return movies.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.overview ?? '').toLowerCase().includes(q) ||
      (m.genres ?? []).some(g => g.toLowerCase().includes(q))
    );
  };

  const filteredUpcoming = filterMovies(upcoming);
  const filteredTrending = filterMovies(trending);
  const filteredRecommended = filterMovies(recommended);

  // TV shows from dedicated TMDB /trending/tv/week endpoint
  const filteredShows = useMemo(() => filterMovies(trendingShows), [trendingShows, searchQuery, filterMovies]);

  const handleTMDBDownload = useCallback((movie: TMDBMovie) => {
    setDownloadTarget({ title: movie.title, posterUrl: movie.posterUrl, release_date: movie.release_date, type: 'movie' });
  }, []);

  const handleDirectDownload = useCallback((result: CinemetaResult) => {
    setDownloadTarget({
      title: result.name,
      posterUrl: result.poster,
      imdbId: result.id,
      type: result.type,
    });
  }, []);

  const runDirectSearch = async () => {
    if (!directQuery.trim()) return;
    setDirectLoading(true);
    setDirectError('');
    setDirectResults([]);
    try {
      const res = await fetch('/api/stremio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: directQuery.trim(), type: directType }),
      });
      const data = await res.json() as { results?: CinemetaResult[] };
      if (!data.results || data.results.length === 0) throw new Error('No results found');
      setDirectResults(data.results);
    } catch (err) {
      setDirectError(String(err));
    } finally {
      setDirectLoading(false);
    }
  };

  const TABS = [
    { id: 'movies' as const, label: 'Movies', icon: Film },
    { id: 'shows' as const, label: 'TV Shows', icon: Tv2 },
    { id: 'search' as const, label: 'Search & Download', icon: Clapperboard },
  ];

  return (
    <>
      <title>Discover — HomeStream</title>
      <meta name="description" content="Browse new releases, trending movies, and personalised recommendations. Download directly to your HomeStream server." />

      <div className="min-h-screen bg-background pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">

          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
                <Compass className="w-6 h-6 text-primary" />
                Discover
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                New releases, trending titles, and direct search to download anything
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeTab !== 'search' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter titles…"
                    className="pl-8 pr-3 py-2 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-44"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/40 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Force refresh from TMDB"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 mb-6 bg-muted/30 p-1 rounded-xl w-fit">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Status notices ── */}
          {stale && !loading && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              Showing cached data — TMDB was unreachable.
              {lastRefreshed && <span className="ml-auto">Last updated: {lastRefreshed.toLocaleDateString()}</span>}
            </div>
          )}
          {error && !stale && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />{error}
            </div>
          )}

          {/* ── Movies tab ── */}
          {activeTab === 'movies' && (
            <>
              {loading && upcoming.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-muted-foreground text-sm">Fetching new releases from TMDB…</p>
                </div>
              )}
              {(!loading || upcoming.length > 0) && (
                <>
                  <Section key={`upcoming-${searchQuery}`} title="New This Month" icon={Calendar} movies={filteredUpcoming} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                  <Section key={`trending-${searchQuery}`} title="Trending This Week" icon={TrendingUp} movies={filteredTrending} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                  {recommended.length > 0 && (
                    <Section key={`recommended-${searchQuery}`} title="Recommended For You" icon={Sparkles} movies={filteredRecommended} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                  )}
                  {filteredUpcoming.length === 0 && filteredTrending.length === 0 && filteredRecommended.length === 0 && searchQuery && (
                    <div className="text-center py-16 text-muted-foreground text-sm">No results for "{searchQuery}"</div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── TV Shows tab ── */}
          {activeTab === 'shows' && (
            <div>
              {filteredShows.length > 0 ? (
                <Section key={`shows-${searchQuery}`} title="Trending TV Shows" icon={Tv2} movies={filteredShows} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
              ) : loading ? (
                <div className="text-center py-16">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">Loading TV shows…</p>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Tv2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm mb-2">No TV shows found.</p>
                  <p className="text-muted-foreground text-xs">Use the <button onClick={() => setActiveTab('search')} className="text-primary hover:underline">Search & Download</button> tab to find any TV show by name.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Search & Download tab ── */}
          {activeTab === 'search' && (
            <div>
              <div className="bg-card border border-border rounded-2xl p-5 mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Clapperboard className="w-4 h-4 text-primary" />
                  Search Any Movie or TV Show
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Search the Cinemeta catalog (same database as Stremio) and download anything directly to your HomeStream server.
                </p>

                <div className="flex gap-2 mb-3">
                  {(['movie', 'series'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setDirectType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        directType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t === 'movie' ? <Film className="w-3 h-3" /> : <Tv2 className="w-3 h-3" />}
                      {t === 'movie' ? 'Movies' : 'TV Shows'}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={directQuery}
                      onChange={e => setDirectQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runDirectSearch()}
                      placeholder={`Search ${directType === 'movie' ? 'movies' : 'TV shows'}…`}
                      className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    onClick={runDirectSearch}
                    disabled={!directQuery.trim() || directLoading}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {directLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>

              {directError && (
                <div className="text-center py-8 text-red-400 text-sm">{directError}</div>
              )}

              {directResults.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-4">{directResults.length} results for "{directQuery}"</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {directResults.map(r => (
                      <DirectSearchCard
                        key={r.id}
                        result={r}
                        alreadyInLibrary={libraryTitles.has(r.name.toLowerCase())}
                        onDownload={handleDirectDownload}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!directLoading && directResults.length === 0 && !directError && (
                <div className="text-center py-16 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm">Search for any movie or TV show above to find download options</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Download modal ── */}
      <AnimatePresence>
        {downloadTarget && (
          <DownloadModal
            target={downloadTarget}
            onClose={() => setDownloadTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
