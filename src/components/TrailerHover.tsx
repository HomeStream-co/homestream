/**
 * TrailerHover — Netflix-style trailer preview on card hover
 *
 * Wraps any content (typically a MediaCard). On hover:
 *   1. Waits 800ms (prevents accidental triggers while scrolling)
 *   2. Fetches the YouTube trailer key from /api/tmdb/trailer
 *   3. Shows an embedded YouTube iframe (muted autoplay) in a floating card
 *   4. Card expands with title, genre, and action buttons
 *
 * On mouse-leave: immediately hides the preview.
 *
 * Trailer keys are cached in-memory so repeated hovers don't re-fetch.
 *
 * Usage:
 *   <TrailerHover item={mediaItem}>
 *     <MediaCard item={mediaItem} />
 *   </TrailerHover>
 *
 * Note: YouTube autoplay requires mute=1. The user can unmute inside the iframe.
 * If no trailer is found, the component is transparent — children render normally.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Plus, Star, Volume2, VolumeX } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';

// ── Trailer key cache ─────────────────────────────────────────────────────────
const trailerCache = new Map<string, string | null>();
// In-flight deduplication — prevents duplicate fetches for the same item
// when multiple cards are hovered in quick succession (e.g. fast scrolling).
const inFlight = new Map<string, Promise<string | null>>();
// Max concurrent trailer fetches — prevents hammering TMDB on carousel scroll.
let activeFetches = 0;
const MAX_CONCURRENT_FETCHES = 2;

async function fetchTrailerKey(item: MediaItem): Promise<string | null> {
  const cacheKey = `${item.id}`;
  if (trailerCache.has(cacheKey)) return trailerCache.get(cacheKey)!;
  // Return existing in-flight promise if one is already running for this item
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)!;
  // Throttle: if too many fetches are running, skip rather than queue
  if (activeFetches >= MAX_CONCURRENT_FETCHES) return null;

  const promise = (async () => {
    activeFetches++;
    try {
      const params = new URLSearchParams({
        title: item.title,
        type: item.type === 'series' ? 'series' : 'movie',
        ...(item.year ? { year: String(item.year) } : {}),
      });
      const res = await fetch(`/api/tmdb/trailer?${params}`);
      const data = await res.json() as { trailerKey?: string | null };
      const key = data.trailerKey ?? null;
      trailerCache.set(cacheKey, key);
      return key;
    } catch {
      trailerCache.set(cacheKey, null);
      return null;
    } finally {
      activeFetches--;
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TrailerHoverProps {
  item: MediaItem;
  children: React.ReactNode;
  /** Delay before showing preview (ms). Default 800. */
  delay?: number;
  /** Disable on mobile (default true — hover doesn't work on touch) */
  disableOnMobile?: boolean;
}

export default function TrailerHover({
  item,
  children,
  delay = 800,
  disableOnMobile = true,
}: TrailerHoverProps) {
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useMedia();
  // Memoize so this component only re-renders when THIS item's watchlist state changes
  const inWatchlist = useMemo(() => watchlist.includes(item.id), [watchlist, item.id]);

  const [showPreview, setShowPreview] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [position, setPosition] = useState<'left' | 'right' | 'center'>('center');

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  );

  const handleMouseEnter = useCallback(async () => {
    if (disableOnMobile && isMobile.current) return;

    // Determine popup position based on card position in viewport
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      if (rect.left < vw * 0.25) setPosition('right');
      else if (rect.right > vw * 0.75) setPosition('left');
      else setPosition('center');
    }

    hoverTimer.current = setTimeout(async () => {
      const key = await fetchTrailerKey(item);
      setTrailerKey(key);
      setShowPreview(true);
    }, delay);
  }, [item, delay, disableOnMobile]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setShowPreview(false);
    setMuted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const path = item.type === 'series' ? `/show/${item.id}` : `/player/${item.id}`;
    navigate(path);
  };

  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) removeFromWatchlist(item.id);
    else addToWatchlist(item.id);
  };

  // Popup X offset based on position
  const popupX = position === 'right' ? '0%' : position === 'left' ? '-60%' : '-30%';

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-0 z-50 w-72 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-card"
            style={{ left: popupX }}
            onMouseEnter={() => {
              // Keep preview open when hovering the popup itself
              if (hoverTimer.current) clearTimeout(hoverTimer.current);
            }}
          >
            {/* Video area */}
            <div className="relative w-full aspect-video bg-black">
              {trailerKey ? (
                <>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&rel=0&loop=1&playlist=${trailerKey}`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen={false}
                    className="absolute inset-0 w-full h-full"
                    title={`${item.title} trailer`}
                  />
                  {/* Mute toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
                  >
                    {muted
                      ? <VolumeX className="w-3.5 h-3.5" />
                      : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </>
              ) : (
                /* No trailer — show poster */
                <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-muted-foreground text-xs">No preview</div>
                  )}
                </div>
              )}
            </div>

            {/* Info area */}
            <div className="p-3 flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground leading-tight line-clamp-1">{item.title}</p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.year && <span>{item.year}</span>}
                {item.imdbRating && (
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    {item.imdbRating}
                  </span>
                )}
                {item.genre && <span className="capitalize">{item.genre}</span>}
              </div>

              {item.enrichment?.aiSummary && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {item.enrichment.aiSummary}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  {item.type === 'series' ? 'View' : 'Play'}
                </button>
                <button
                  onClick={handleWatchlist}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    inWatchlist
                      ? 'border-primary text-primary bg-primary/10 hover:bg-primary/20'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  }`}
                >
                  <Plus className={`w-3 h-3 transition-transform ${inWatchlist ? 'rotate-45' : ''}`} />
                  {inWatchlist ? 'Remove' : 'My List'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
