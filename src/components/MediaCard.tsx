/**
 * MediaCard — cinematic poster card for movies, TV shows, and library items.
 *
 * v2 improvements:
 *  - Larger hover overlay with smooth gradient reveal
 *  - Animated play button with glow
 *  - Richer metadata: rating badge, type indicator, progress ring
 *  - Title gradient on hover
 *  - Smooth scale + shadow on hover
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Plus, Check, Star, Film, Tv2, Info, CheckCircle2 } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';
import { useTheme } from '@/context/ThemeContext';
import MediaContextMenu from '@/components/MediaContextMenu';

interface MediaCardProps {
  item: MediaItem;
  showProgress?: boolean;
  size?: 'sm' | 'md';
}

const PREFETCH_DELAY_MS = 350;
const PREFETCH_BYTES = 4 * 1024 * 1024;
const prefetchedFiles = new Set<string>();

function prefetchVideo(filename: string) {
  if (prefetchedFiles.has(filename)) return;
  prefetchedFiles.add(filename);
  fetch(`/api/stream/${filename}`, {
    headers: { Range: `bytes=0-${PREFETCH_BYTES - 1}` },
    cache: 'default',
  }).catch(() => { prefetchedFiles.delete(filename); });
}

function getEpisodeProgress(item: MediaItem) {
  const eps = item.episodes || [];
  if (eps.length === 0) return null;
  const watched = eps.filter(e => e.watched).length;
  return { watched, total: eps.length, pct: (watched / eps.length) * 100 };
}

export default function MediaCard({ item, showProgress = false, size = 'sm' }: MediaCardProps) {
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const { settings } = useTheme();
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Derive item-specific values with useMemo so the card only re-renders when
  // its own watchlist/progress state actually changes — not on every library update.
  const inWatchlist = useMemo(() => watchlist.includes(item.id), [watchlist, item.id]);
  const watchProgress = useMemo(
    () => continueWatching.find(c => c.id === item.id)?.progress || 0,
    [continueWatching, item.id],
  );
  const epProgress = item.type === 'series' ? getEpisodeProgress(item) : null;
  const allDone = epProgress ? epProgress.watched === epProgress.total && epProgress.total > 0 : false;

  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (!item.filename) return;
    hoverTimer.current = setTimeout(() => prefetchVideo(item.filename), PREFETCH_DELAY_MS);
  }, [item.filename]);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    clearTimeout(hoverTimer.current);
  }, []);

  const detailPath = item.type === 'movie' ? `/movie/${item.id}` : item.type === 'series' ? `/show/${item.id}` : `/player/${item.id}`;
  const playerPath = `/player/${item.id}`;

  const handlePlay = (e: React.MouseEvent) => { e.stopPropagation(); navigate(playerPath); };
  const handleInfo = (e: React.MouseEvent) => { e.stopPropagation(); navigate(detailPath); };
  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) { removeFromWatchlist(item.id); } else { addToWatchlist(item.id); }
  };

  const FallbackIcon = item.type === 'series' ? Tv2 : Film;
  const widthClass = size === 'md' ? 'w-full' : 'w-36 sm:w-44 flex-shrink-0';

  return (
    <MediaContextMenu item={item}>
      <motion.div
        className={`relative cursor-pointer group ${widthClass}`}
        whileHover={{ scale: 1.06, zIndex: 20 }}
        transition={{ duration: 0.22, ease: 'easeOut' as const }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => navigate(detailPath)}
      >
        {/* ── Poster ── */}
        <div className={`relative aspect-poster rounded-xl overflow-hidden bg-card transition-shadow duration-300 ${hovered ? 'shadow-2xl shadow-black/70' : 'shadow-md shadow-black/40'}`}>
          {!imgError && item.poster ? (
            <img
              src={item.poster}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
              <FallbackIcon className="w-8 h-8 text-muted-foreground/30 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-3">{item.title}</p>
            </div>
          )}

          {/* ── Hover overlay — gradient reveal ── */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.25) 100%)' }}
              >
                {/* Play button */}
                <motion.button
                  onClick={handlePlay}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.04, duration: 0.2, ease: 'backOut' as const }}
                  className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/85 transition-colors shadow-lg shadow-primary/50"
                  title="Play"
                >
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </motion.button>

                {/* Secondary actions */}
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.08, duration: 0.2 }}
                  className="flex items-center gap-2"
                >
                  <button
                    onClick={handleWatchlist}
                    className="w-8 h-8 rounded-full border border-white/40 bg-black/30 flex items-center justify-center hover:border-white hover:bg-black/50 transition-all"
                    title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    {inWatchlist
                      ? <Check className="w-3.5 h-3.5 text-primary" />
                      : <Plus className="w-3.5 h-3.5 text-white" />
                    }
                  </button>

                  {(item.type === 'movie' || item.type === 'series') && (
                    <button
                      onClick={handleInfo}
                      className="w-8 h-8 rounded-full border border-white/40 bg-black/30 flex items-center justify-center hover:border-white hover:bg-black/50 transition-all"
                      title="More info"
                    >
                      <Info className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── IMDb rating badge ── */}
          {item.imdbRating && item.imdbRating !== 'N/A' && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] text-white font-semibold">{item.imdbRating}</span>
            </div>
          )}

          {/* ── Type badge (TV) ── */}
          {item.type === 'series' && (
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5">
              <span className="text-[9px] text-white/80 font-semibold uppercase tracking-wider">TV</span>
            </div>
          )}

          {/* ── Watch progress bar ── */}
          {showProgress && watchProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(watchProgress, 100)}%` }}
              />
            </div>
          )}

          {/* ── Episode progress bar ── */}
          {item.type === 'series' && epProgress && epProgress.total > 0 && !showProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div className="h-full bg-primary/80 transition-all" style={{ width: `${epProgress.pct}%` }} />
            </div>
          )}

          {/* ── All-done badge ── */}
          {allDone && (
            <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground rounded-full p-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* ── Title + meta ── */}
        <div className="mt-2 px-0.5">
          <p className={`text-xs font-semibold truncate transition-colors duration-200 ${hovered ? 'text-primary' : 'text-foreground'}`}>
            {item.title}
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[10px] text-muted-foreground">{item.year}</p>
            {epProgress && (
              <p className="text-[10px] text-muted-foreground">{epProgress.watched}/{epProgress.total} ep</p>
            )}
          </div>

          {/* AI enrichment tags */}
          {settings.showEnrichmentTags && (item.enrichment?.mood?.length || item.enrichment?.tags?.length) && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {item.enrichment?.mood?.slice(0, 1).map((m: string) => (
                <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium leading-none truncate max-w-[64px]">
                  {m}
                </span>
              ))}
              {item.enrichment?.tags?.slice(0, 2).map((t: string) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium leading-none truncate max-w-[64px]">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </MediaContextMenu>
  );
}
