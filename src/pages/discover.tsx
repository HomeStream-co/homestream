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

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Compass, Star, Calendar, Download, Bookmark, BookmarkCheck,
  Loader2, WifiOff, RefreshCw, Film, TrendingUp, Sparkles,
  ChevronDown, Search, X,
} from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import { useTMDBContext } from '@/context/TMDBContext';
import type { TMDBMovie } from '@/server/tmdbCache';

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

  return (
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onDownload(movie)}
            disabled={alreadyInLibrary}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              alreadyInLibrary
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary hover:bg-primary/80 text-primary-foreground'
            }`}
          >
            <Download className="w-3 h-3" />
            {alreadyInLibrary ? 'In Library' : 'Download'}
          </button>
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
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? movies : movies.slice(0, 12);

  if (movies.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-bold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">({movies.length})</span>
        </div>
        {movies.length > 12 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
          >
            {showAll ? 'Show less' : `Show all ${movies.length}`}
            <ChevronDown className={`w-3 h-3 transition-transform ${showAll ? 'rotate-180' : ''}`} />
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
    </section>
  );
}

// ── Stremio download modal ────────────────────────────────────────────────────

function DownloadModal({ movie, onClose }: { movie: TMDBMovie; onClose: () => void }) {
  const [searching, setSearching] = useState(false);
  const [streams, setStreams] = useState<{ name: string; title: string; url: string }[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setError('');
    try {
      // Use Cinemeta to find the IMDB ID, then Torrentio for streams
      const metaRes = await fetch(
        `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(movie.title)}.json`
      );
      const metaData = await metaRes.json() as { metas?: { id: string; name: string }[] };
      const meta = metaData.metas?.[0];
      if (!meta?.id) throw new Error('Title not found in Cinemeta');

      const streamRes = await fetch(
        `https://torrentio.strem.fun/sort=seeders/stream/movie/${meta.id}.json`
      );
      const streamData = await streamRes.json() as { streams?: { name: string; title: string; infoHash: string; fileIdx?: number }[] };
      const found = (streamData.streams ?? []).slice(0, 8).map(s => ({
        name: s.name,
        title: s.title,
        url: s.infoHash,
      }));
      if (found.length === 0) throw new Error('No streams found');
      setStreams(found);
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  const startDownload = async (stream: { name: string; title: string; url: string }) => {
    setDownloading(stream.url);
    try {
      await fetch('/api/stremio/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          infoHash: stream.url,
          title: movie.title,
          type: 'movie',
          quality: stream.name,
          poster: movie.posterUrl,
        }),
      });
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
            {movie.posterUrl && (
              <img src={movie.posterUrl} alt={movie.title} className="w-8 h-12 rounded object-cover" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{movie.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(movie.release_date)}</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const { library, watchlist, addToWatchlist, removeFromWatchlist } = useMedia();
  const [downloadTarget, setDownloadTarget] = useState<TMDBMovie | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { upcoming, trending, recommended, loading, stale, error, refresh, lastRefreshed } = useTMDBContext();

  // Build a set of library titles (lowercase) to mark "already in library"
  const libraryTitles = useMemo(
    () => new Set(library.map(m => m.title.toLowerCase())),
    [library]
  );

  // Search filter across all sections
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

  return (
    <>
      <title>Discover — HomeStream</title>
      <meta name="description" content="Browse new releases, trending movies, and personalised recommendations. Download directly to your HomeStream server." />

      <div className="min-h-screen bg-background pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">

          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
                <Compass className="w-6 h-6 text-primary" />
                Discover
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                New releases, trending movies, and picks based on what you watch
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
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

              {/* Refresh */}
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

          {/* ── Status notices ── */}
          {stale && !loading && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              Showing cached data — TMDB was unreachable. Data will refresh automatically when back online.
              {lastRefreshed && <span className="ml-auto">Last updated: {lastRefreshed.toLocaleDateString()}</span>}
            </div>
          )}

          {error && !stale && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── Loading state ── */}
          {loading && upcoming.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Fetching new releases from TMDB…</p>
            </div>
          )}

          {/* ── Sections ── */}
          {!loading || upcoming.length > 0 ? (
            <>
              <Section
                title="New This Month"
                icon={Calendar}
                movies={filteredUpcoming}
                libraryTitles={libraryTitles}
                watchlist={watchlist}
                onAddToWatchlist={addToWatchlist}
                onRemoveFromWatchlist={removeFromWatchlist}
                onDownload={setDownloadTarget}
              />
              <Section
                title="Trending This Week"
                icon={TrendingUp}
                movies={filteredTrending}
                libraryTitles={libraryTitles}
                watchlist={watchlist}
                onAddToWatchlist={addToWatchlist}
                onRemoveFromWatchlist={removeFromWatchlist}
                onDownload={setDownloadTarget}
              />
              {recommended.length > 0 && (
                <Section
                  title="Recommended For You"
                  icon={Sparkles}
                  movies={filteredRecommended}
                  libraryTitles={libraryTitles}
                  watchlist={watchlist}
                  onAddToWatchlist={addToWatchlist}
                  onRemoveFromWatchlist={removeFromWatchlist}
                  onDownload={setDownloadTarget}
                />
              )}

              {filteredUpcoming.length === 0 && filteredTrending.length === 0 && filteredRecommended.length === 0 && searchQuery && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  No results for "{searchQuery}"
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* ── Download modal ── */}
      <AnimatePresence>
        {downloadTarget && (
          <DownloadModal
            movie={downloadTarget}
            onClose={() => setDownloadTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
