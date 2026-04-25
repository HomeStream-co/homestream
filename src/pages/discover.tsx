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
  Star, Calendar, Download, Bookmark, BookmarkCheck,
  Loader2, WifiOff, RefreshCw, Film, TrendingUp, Sparkles,
  ChevronDown, Search, X, Tv2, Clapperboard, Play, Volume2, VolumeX, Layers,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useTMDBContext } from '@/context/TMDBContext';
import type { TMDBMovie } from '@/server/tmdbCache';
import { fetchTrailerKey } from '@/lib/trailerCache';
import GenreBrowser from '@/components/GenreBrowser';
import ImageWithFallback from '@/components/ImageWithFallback';

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
          <ImageWithFallback
            src={movie.posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            fallbackClassName="w-full h-full"
            loading="lazy"
          />

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
  // Full stream data preserved so the download call can send real magnet URIs with trackers
  const [streams, setStreams] = useState<{
    name: string;
    title: string;
    url: string;
    imdbId: string;
    quality: string;
    size: string;
    seeds: string;
    magnet: string;
    source: string;
  }[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setError('');
    try {
      // Route through the backend proxy — avoids CORS and works in all environments.
      // /api/stremio/stream handles Torrentio + Prowlarr + Nyaa server-side.
      const res = await fetch('/api/stremio/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: target.imdbId ?? null,
          title: target.title,
          type: target.type,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(data.error ?? data.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { streams?: { name: string; quality: string; size: string; seeds: string; magnet: string; infoHash: string; source: string }[]; imdbId?: string };
      const resolvedImdbId = data.imdbId ?? target.imdbId ?? '';
      const found = (data.streams ?? []).slice(0, 15).map(s => ({
        name: s.name,
        // Human-readable label shown in the picker
        title: `${s.quality}${s.size ? ` · ${s.size}` : ''}${s.seeds ? ` · 👤 ${s.seeds}` : ''}`,
        url: s.infoHash,
        imdbId: resolvedImdbId,
        // Preserve full stream data so the download call gets real magnet URIs + tracker list
        quality: s.quality,
        size: s.size,
        seeds: s.seeds,
        magnet: s.magnet,
        source: s.source,
      }));
      if (found.length === 0) throw new Error('No streams found — try a different title or check your Prowlarr config');
      setStreams(found);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "Failed to fetch" means the browser couldn't reach the server at all
      setError(msg === 'Failed to fetch'
        ? 'Could not reach the HomeStream server. Make sure the app is running.'
        : msg);
    } finally {
      setSearching(false);
    }
  };

  const startDownload = async (stream: { name: string; title: string; url: string; imdbId: string; quality: string; size: string; seeds: string; magnet: string; source: string }) => {
    setDownloading(stream.url);
    try {
      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: stream.imdbId,
          infoHash: stream.url,
          title: target.title,
          type: target.type,
          quality: stream.quality,
          poster: target.posterUrl,
          // Pass the full stream object so the server uses the real magnet URI
          // (with tracker announce URLs) instead of reconstructing a bare magnet.
          streams: [{
            infoHash: stream.url,
            magnet: stream.magnet || `magnet:?xt=urn:btih:${stream.url}`,
            quality: stream.quality,
            name: stream.name,
            size: stream.size,
            seeds: stream.seeds,
            source: (stream.source as 'torrentio' | 'prowlarr' | 'nyaa') ?? 'torrentio',
          }],
        }),
      });

      if (res.status === 409) {
        // Duplicate — already queued or downloading
        const data = await res.json() as { jobId?: string; message?: string };
        toast.custom(() => (
          <div className="flex items-start gap-3 bg-card border border-yellow-500/30 rounded-xl px-4 py-3 shadow-xl max-w-sm">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Already in queue</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground">{target.title}</span> is already being downloaded
                {data.jobId ? ` (job ${data.jobId.slice(0, 8)}…)` : ''}.
                Check the Downloads page.
              </p>
            </div>
          </div>
        ), { duration: 5000 });
        onClose();
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(errData.message ?? errData.error ?? `Server error ${res.status}`);
      }

      toast.success(`Download queued — ${target.title}`, {
        description: stream.name,
        duration: 4000,
      });
      onClose();
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
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
            <ImageWithFallback
              src={target.posterUrl}
              alt={target.title}
              className="w-8 h-12 rounded object-cover"
              fallbackClassName="w-8 h-12 rounded bg-muted"
            />
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
        <ImageWithFallback
          src={result.poster}
          alt={result.name}
          fallbackIcon={result.type === 'series' ? 'tv' : 'film'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          fallbackClassName="w-full h-full"
          loading="lazy"
        />
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
  const [activeTab, setActiveTab] = useState<'movies' | 'shows' | 'genres' | 'search'>('movies');

  // Direct search state
  const [directQuery, setDirectQuery] = useState('');
  const [directType, setDirectType] = useState<'movie' | 'series'>('movie');
  const [directResults, setDirectResults] = useState<CinemetaResult[]>([]);
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState('');

  const { upcoming, trending, trendingShows, topRatedShows, popularShows, recommended, loading, stale, error, refresh, lastRefreshed } = useTMDBContext();

  const libraryTitles = useMemo(
    () => new Set(library.map(m => m.title.toLowerCase())),
    [library]
  );

  const filterMovies = useCallback((movies: TMDBMovie[]) => {
    if (!searchQuery.trim()) return movies;
    const q = searchQuery.toLowerCase();
    return movies.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.overview ?? '').toLowerCase().includes(q) ||
      (m.genres ?? []).some(g => g.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const filteredUpcoming = filterMovies(upcoming);
  const filteredTrending = filterMovies(trending);
  const filteredRecommended = filterMovies(recommended);

  // TV shows from dedicated TMDB endpoints
  const filteredShows = useMemo(() => filterMovies(trendingShows), [trendingShows, filterMovies]);
  const filteredTopRatedShows = useMemo(() => filterMovies(topRatedShows), [topRatedShows, filterMovies]);
  const filteredPopularShows = useMemo(() => filterMovies(popularShows), [popularShows, filterMovies]);

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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: directQuery.trim(), type: directType }),
      });
      const data = await res.json() as { results?: CinemetaResult[] };
      if (!data.results || data.results.length === 0) throw new Error('No results found');
      setDirectResults(data.results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDirectError(msg === 'Failed to fetch'
        ? 'Could not reach the HomeStream server. Make sure the app is running.'
        : msg);
    } finally {
      setDirectLoading(false);
    }
  };

  const TABS = [
    { id: 'movies' as const, label: 'Movies', icon: Film },
    { id: 'shows' as const, label: 'TV Shows', icon: Tv2 },
    { id: 'genres' as const, label: 'Browse by Genre', icon: Layers },
    { id: 'search' as const, label: 'Search & Download', icon: Clapperboard },
  ];

  return (
    <>
      <title>Discover — HomeStream</title>
      <meta name="description" content="Browse new releases, trending movies, and personalised recommendations. Download directly to your HomeStream server." />

      <div className="min-h-screen bg-background pb-20">

        {/* ── Cinematic page header ── */}
        <div className="relative pt-24 pb-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-screen-2xl mx-auto relative">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-6 bg-primary rounded-full" />
                  <span className="text-xs text-primary font-bold uppercase tracking-widest">Browse</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-heading text-foreground tracking-wide">
                  Discover
                </h1>
                <p className="text-muted-foreground text-sm mt-1.5 max-w-md">
                  New releases, trending titles, and direct search to download anything to your server
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {activeTab !== 'search' && activeTab !== 'genres' && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Filter titles…"
                      className="pl-9 pr-3 py-2 text-xs glass rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-48"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass text-xs font-medium text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                  title="Force refresh from TMDB"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* ── Premium tab bar ── */}
            <div className="flex gap-1 mt-8 border-b border-border/40">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="discover-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Status notices */}
          {stale && !loading && (
            <div className="flex items-center gap-2 mb-6 px-4 py-3 rounded-xl glass border-yellow-500/20 text-xs text-muted-foreground">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
              Showing cached data — TMDB was unreachable.
              {lastRefreshed && <span className="ml-auto">Last updated: {lastRefreshed.toLocaleDateString()}</span>}
            </div>
          )}
          {error && !stale && (
            <div className="flex items-center gap-2 mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />{error}
            </div>
          )}

          {/* ── Movies tab ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'movies' && (
              <motion.div key="movies" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {loading && upcoming.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm">Fetching new releases from TMDB…</p>
                  </div>
                ) : (
                  <>
                    <Section key={`upcoming-${searchQuery}`} title="New This Month" icon={Calendar} movies={filteredUpcoming} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    <Section key={`trending-${searchQuery}`} title="Trending This Week" icon={TrendingUp} movies={filteredTrending} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    {recommended.length > 0 && (
                      <Section key={`recommended-${searchQuery}`} title="Recommended For You" icon={Sparkles} movies={filteredRecommended} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    )}
                    {filteredUpcoming.length === 0 && filteredTrending.length === 0 && filteredRecommended.length === 0 && searchQuery && (
                      <div className="text-center py-20 text-muted-foreground text-sm">No results for "{searchQuery}"</div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── TV Shows tab ── */}
            {activeTab === 'shows' && (
              <motion.div key="shows" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {loading && trendingShows.length === 0 ? (
                  <div className="text-center py-32">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">Loading TV shows…</p>
                  </div>
                ) : trendingShows.length === 0 && topRatedShows.length === 0 && popularShows.length === 0 ? (
                  <div className="text-center py-32">
                    <Tv2 className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm mb-2">No TV shows found.</p>
                    <p className="text-muted-foreground text-xs">
                      Use the{' '}
                      <button onClick={() => setActiveTab('search')} className="text-primary hover:underline font-medium">
                        Search &amp; Download
                      </button>{' '}
                      tab to find any TV show by name.
                    </p>
                  </div>
                ) : (
                  <>
                    {filteredShows.length > 0 && (
                      <Section key={`shows-trending-${searchQuery}`} title="Trending This Week" icon={TrendingUp} movies={filteredShows} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    )}
                    {filteredPopularShows.length > 0 && (
                      <Section key={`shows-popular-${searchQuery}`} title="Popular Right Now" icon={Sparkles} movies={filteredPopularShows} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    )}
                    {filteredTopRatedShows.length > 0 && (
                      <Section key={`shows-toprated-${searchQuery}`} title="All-Time Top Rated" icon={Star} movies={filteredTopRatedShows} libraryTitles={libraryTitles} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} onDownload={handleTMDBDownload} />
                    )}
                    {filteredShows.length === 0 && filteredPopularShows.length === 0 && filteredTopRatedShows.length === 0 && searchQuery && (
                      <div className="text-center py-20 text-muted-foreground text-sm">No TV shows match "{searchQuery}"</div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── Genres tab ── */}
            {activeTab === 'genres' && (
              <motion.div key="genres" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <GenreBrowser />
              </motion.div>
            )}

            {/* ── Search & Download tab ── */}
            {activeTab === 'search' && (
              <motion.div key="search" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {/* Search card */}
                <div className="glass rounded-2xl p-6 mb-8 border border-border/60">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Clapperboard className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Search Any Movie or TV Show</h2>
                      <p className="text-xs text-muted-foreground">Powered by Cinemeta — same database as Stremio</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-4">
                    {(['movie', 'series'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setDirectType(t)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                          directType === t
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                            : 'glass text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv2 className="w-3.5 h-3.5" />}
                        {t === 'movie' ? 'Movies' : 'TV Shows'}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={directQuery}
                        onChange={e => setDirectQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && runDirectSearch()}
                        placeholder={`Search ${directType === 'movie' ? 'movies' : 'TV shows'}…`}
                        className="w-full pl-10 pr-4 py-3 glass rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <motion.button
                      onClick={runDirectSearch}
                      disabled={!directQuery.trim() || directLoading}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary/85 text-primary-foreground rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-md shadow-primary/25"
                    >
                      {directLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Search
                    </motion.button>
                  </div>
                </div>

                {directError && (
                  <div className="text-center py-8 text-red-400 text-sm">{directError}</div>
                )}

                {directResults.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-1 h-5 bg-primary rounded-full" />
                      <p className="text-sm font-heading tracking-widest text-foreground uppercase">
                        {directResults.length} Results
                      </p>
                      <span className="text-xs text-muted-foreground">for "{directQuery}"</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {directResults.map((r, i) => (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.04, 0.5), duration: 0.25 }}
                        >
                          <DirectSearchCard
                            result={r}
                            alreadyInLibrary={libraryTitles.has(r.name.toLowerCase())}
                            onDownload={handleDirectDownload}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {!directLoading && directResults.length === 0 && !directError && (
                  <div className="text-center py-24 text-muted-foreground">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <Search className="w-7 h-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">Find anything</p>
                    <p className="text-xs">Search for any movie or TV show to find download options</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
