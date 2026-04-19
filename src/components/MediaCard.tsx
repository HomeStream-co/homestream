/**
 * MediaCard — unified poster card for movies, TV shows, and any library item.
 *
 * Replaces the old MediaCard, MovieCard, and ShowCard with one component.
 *
 * Routing logic:
 *   - movies  → click card body → /movie/:id  |  ▶ Play → /player/:id
 *   - series  → click card body → /show/:id   |  ▶ Play → /player/:id
 *   - default → click card body → /player/:id (legacy / unknown type)
 *
 * Props:
 *   showProgress  — show watch-progress bar on poster bottom edge
 *   size          — 'sm' (carousel) | 'md' (grid default)
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Plus, Check, Star, Film, Tv2, Info, CheckCircle2 } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';
import { useTheme } from '@/context/ThemeContext';
import { Progress } from '@/components/ui/progress';
import MediaContextMenu from '@/components/MediaContextMenu';

interface MediaCardProps {
  item: MediaItem;
  showProgress?: boolean;
  size?: 'sm' | 'md';
}

// ── Video prefetch ────────────────────────────────────────────────────────────
const PREFETCH_DELAY_MS = 300;
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

// ── Episode progress helper ───────────────────────────────────────────────────
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

  const inWatchlist = watchlist.includes(item.id);
  const watchProgress = continueWatching.find(c => c.id === item.id)?.progress || 0;
  const epProgress = item.type === 'series' ? getEpisodeProgress(item) : null;
  const allDone = epProgress ? epProgress.watched === epProgress.total && epProgress.total > 0 : false;

  // Hover prefetch
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleMouseEnter = useCallback(() => {
    if (!item.filename) return;
    hoverTimer.current = setTimeout(() => prefetchVideo(item.filename), PREFETCH_DELAY_MS);
  }, [item.filename]);
  const handleMouseLeave = useCallback(() => clearTimeout(hoverTimer.current), []);

  // Routing
  const detailPath = item.type === 'movie' ? `/movie/${item.id}` : item.type === 'series' ? `/show/${item.id}` : `/player/${item.id}`;
  const playerPath = `/player/${item.id}`;

  const handlePlay = (e: React.MouseEvent) => { e.stopPropagation(); navigate(playerPath); };
  const handleInfo = (e: React.MouseEvent) => { e.stopPropagation(); navigate(detailPath); };
  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    inWatchlist ? removeFromWatchlist(item.id) : addToWatchlist(item.id);
  };

  const FallbackIcon = item.type === 'series' ? Tv2 : Film;
  const widthClass = size === 'md' ? 'w-full' : 'w-36 sm:w-44 flex-shrink-0';

  return (
    <MediaContextMenu item={item}>
      <motion.div
        className={`relative cursor-pointer group ${widthClass}`}
        whileHover={{ scale: 1.05, zIndex: 10 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => navigate(detailPath)}
      >
      {/* ── Poster ── */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card">
        {!imgError && item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
            <FallbackIcon className="w-7 h-7 text-muted-foreground/40 flex-shrink-0" />
            <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-3">{item.title}</p>
          </div>
        )}

        {/* ── Hover overlay ── */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
          {/* Play */}
          <button
            onClick={handlePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
            title="Play"
          >
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </button>

          <div className="flex items-center gap-2">
            {/* Watchlist */}
            <button
              onClick={handleWatchlist}
              className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center hover:border-white transition-colors"
              title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist
                ? <Check className="w-3.5 h-3.5 text-white" />
                : <Plus className="w-3.5 h-3.5 text-white" />
              }
            </button>

            {/* Info — only for movie/series (has a detail page) */}
            {(item.type === 'movie' || item.type === 'series') && (
              <button
                onClick={handleInfo}
                className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center hover:border-white transition-colors"
                title="More info"
              >
                <Info className="w-3.5 h-3.5 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* ── IMDb rating badge ── */}
        {item.imdbRating && item.imdbRating !== 'N/A' && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 rounded px-1 py-0.5 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-accent fill-accent" />
            <span className="text-[10px] text-white font-medium">{item.imdbRating}</span>
          </div>
        )}

        {/* ── Watch progress bar (Continue Watching) ── */}
        {showProgress && watchProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div className="h-full bg-primary" style={{ width: `${Math.min(watchProgress, 100)}%` }} />
          </div>
        )}

        {/* ── Episode progress bar (TV shows) ── */}
        {item.type === 'series' && epProgress && epProgress.total > 0 && !showProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-primary transition-all" style={{ width: `${epProgress.pct}%` }} />
          </div>
        )}

        {/* ── All-episodes-done badge ── */}
        {allDone && (
          <div className="absolute top-1.5 left-1.5 bg-primary/90 text-white rounded-full p-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      {/* ── Title + meta ── */}
      <div className="mt-1.5 px-0.5">
        <p className="text-xs text-foreground font-medium truncate">{item.title}</p>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">{item.year}</p>
          {epProgress && (
            <p className="text-[10px] text-muted-foreground">{epProgress.watched}/{epProgress.total} ep</p>
          )}
        </div>

        {/* Episode progress bar under title */}
        {item.type === 'series' && epProgress && epProgress.total > 0 && epProgress.pct > 0 && (
          <Progress value={epProgress.pct} className="h-0.5 mt-1" />
        )}

        {/* AI enrichment tags */}
        {settings.showEnrichmentTags && (item.enrichment?.mood?.length || item.enrichment?.tags?.length) && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {item.enrichment?.mood?.slice(0, 1).map((m: string) => (
              <span key={m} className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-medium leading-none truncate max-w-[60px]">
                {m}
              </span>
            ))}
            {item.enrichment?.tags?.slice(0, 2).map((t: string) => (
              <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none truncate max-w-[60px]">
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
