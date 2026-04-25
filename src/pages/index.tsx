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

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus, Check, Star, Upload, Clock, Search, X, SlidersHorizontal, Bookmark, Smartphone, QrCode, Copy, Tv2, RefreshCw } from 'lucide-react';
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
// Scan with your phone → opens the remote instantly.

/** Returns true when the IP is a loopback / non-routable address that phones can't reach */
function isLocalhostIP(ip: string): boolean {
  return ip === 'localhost' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

function RemoteQRWidget() {
  const [data, setData] = useState<{ url: string; qr: string; lanIP?: string; mdnsUrl?: string; ipUrl?: string; port?: string } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedIP, setCopiedIP] = useState(false);

  // QR now always encodes the raw IP — use that as the primary display address.
  // hs.local is shown as a secondary "type it manually" hint (works on iOS/macOS).
  const displayAddress = data?.lanIP ?? window.location.hostname;
  const port      = data?.port  ?? '3000';
  const remoteUrl = data?.url   ?? `http://${displayAddress}:${port}/remote`;

  // True when the server returned localhost — QR would be useless on a phone
  const isLocalhost = isLocalhostIP(data?.lanIP ?? window.location.hostname);

  const fetchQr = useCallback(() => {
    setLoading(true);
    setQrError(false);
    fetch('/api/remote/qr?format=svg')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { url?: string; qr?: string; lanIP?: string; mdnsUrl?: string; ipUrl?: string; port?: string }) => {
        if (d?.url && d?.qr) {
          setData({ url: d.url, qr: d.qr, lanIP: d.lanIP, mdnsUrl: d.mdnsUrl, ipUrl: d.ipUrl, port: d.port });
        } else {
          setQrError(true);
        }
      })
      .catch(() => setQrError(true))
      .finally(() => setLoading(false));
  }, []);

  function copyUrl() {
    navigator.clipboard.writeText(remoteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {}); // non-fatal — ignore
  }

  function copyIP() {
    const toCopy = `${displayAddress}:${port}`;
    navigator.clipboard.writeText(toCopy).then(() => {
      setCopiedIP(true);
      setTimeout(() => setCopiedIP(false), 2000);
    }).catch(() => {}); // non-fatal — ignore
  }

  useEffect(() => {
    fetchQr();
  }, [fetchQr]);

  // Determine what to show in the QR area
  const showQR   = data && !qrError && !isLocalhost;
  const showNoLAN = !loading && (qrError || isLocalhost);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 w-64"
          >
            {/* Header */}
            <div className="flex items-center gap-2 w-full">
              <Smartphone className="w-4 h-4 text-primary flex-shrink-0" />
              <p className="text-xs font-semibold text-foreground">Phone Remote</p>
              <button
                onClick={fetchQr}
                disabled={loading}
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Refresh QR code"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* QR code */}
            {loading && (
              <div className="w-40 h-40 rounded-xl bg-muted flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {showQR && (
              <>
                <div
                  className="w-40 h-40 [&_svg]:w-full [&_svg]:h-full rounded-xl overflow-hidden bg-white p-2 flex-shrink-0"
                  dangerouslySetInnerHTML={{ __html: data!.qr }}
                />
                <p className="text-[10px] text-muted-foreground text-center leading-relaxed -mt-1">
                  Scan with your phone camera
                </p>
              </>
            )}

            {showNoLAN && (
              <div className="w-40 h-40 rounded-xl bg-muted flex flex-col items-center justify-center gap-2 text-center px-3">
                <QrCode className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {isLocalhost
                    ? 'Running on localhost — connect to your LAN to get a scannable QR code'
                    : 'QR unavailable — type the address below on your phone'}
                </p>
                {isLocalhost && (
                  <button
                    onClick={fetchQr}
                    className="text-[9px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Retry
                  </button>
                )}
              </div>
            )}

            {/* Address — IP is primary (what the QR encodes), hs.local as manual hint */}
            {!loading && (
              <div className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">Server address (scan QR or type)</p>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 text-sm font-mono font-bold tracking-wide ${isLocalhost ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {isLocalhost ? 'Not on LAN' : `${displayAddress}:${port}`}
                  </code>
                  {!isLocalhost && (
                    <button onClick={copyIP} title="Copy address" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                      {copiedIP ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                {/* hs.local as a secondary hint — works on iOS/macOS without typing the IP */}
                {!isLocalhost && data?.mdnsUrl && (
                  <p className="text-[9px] text-muted-foreground/60 mt-1 font-mono">
                    Also try: {data.mdnsUrl.replace(/^https?:\/\//, '').replace(/\/remote$/, '')} (iOS/macOS only)
                  </p>
                )}
              </div>
            )}

            {/* Full URL — copy (only when we have a real LAN address) */}
            {!loading && !isLocalhost && (
              <button
                onClick={copyUrl}
                title="Copy full URL"
                className="w-full flex items-center gap-1.5 bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-2 transition-colors group"
              >
                <code className="flex-1 text-[10px] text-muted-foreground truncate text-left font-mono">{remoteUrl}</code>
                {copied
                  ? <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                  : <Copy className="w-3 h-3 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />}
              </button>
            )}

            {!loading && !isLocalhost && (
              <a
                href={remoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center text-[10px] bg-primary/10 text-primary rounded-lg py-1.5 font-medium hover:bg-primary/20 transition-colors"
              >
                Open on this device
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button — always visible */}
      <motion.button
        onClick={() => setExpanded(v => !v)}
        whileTap={{ scale: 0.92 }}
        className={`flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg border transition-all ${
          expanded
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card text-foreground border-border hover:border-primary/50'
        }`}
        title="Open phone remote"
      >
        <QrCode className="w-4 h-4" />
        <span className="text-xs font-semibold hidden sm:inline">Phone Remote</span>
      </motion.button>
    </div>
  );
}

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
                    transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.25 }}
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
            {continueWatchingItems.length > 0 && (
              <MediaCarousel
                title="Continue Watching"
                items={continueWatchingItems}
                showProgress
                titleIcon={<Clock className="w-3.5 h-3.5" />}
                accentClass="bg-blue-500"
              />
            )}

            {myList.length > 0 && (
              <MediaCarousel
                title="My List"
                items={myList}
                titleIcon={<Bookmark className="w-3.5 h-3.5" />}
                accentClass="bg-yellow-500"
              />
            )}

            <MediaCarousel title="Recently Added" items={recentlyAdded} accentClass="bg-primary" />

            <LazySection skeletonHeight={240}>
              <MediaCarousel title="Movies" items={movies} accentClass="bg-primary" />
            </LazySection>
            <LazySection skeletonHeight={240}>
              <MediaCarousel title="TV Shows & Series" items={series} accentClass="bg-purple-500" />
            </LazySection>
            {topRated.length > 0 && (
              <LazySection skeletonHeight={240}>
                <MediaCarousel
                  title="Top Rated"
                  items={topRated}
                  titleIcon={<Star className="w-3.5 h-3.5" />}
                  accentClass="bg-yellow-500"
                />
              </LazySection>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phone Remote QR ── */}
      <RemoteQRWidget />
    </div>
  );
}
