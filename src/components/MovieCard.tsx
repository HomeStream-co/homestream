/**
 * MovieCard — poster card that navigates to /movie/:id (detail page).
 *
 * Used on the Movies page and anywhere we want the full detail view
 * instead of going straight to the player.
 *
 * Identical layout to MediaCard but:
 *   - Click / Play → /movie/:id
 *   - Shows a subtle "Detail" affordance on hover
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Plus, Check, Star, Film, Info } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';
import { useTheme } from '@/context/ThemeContext';

interface MovieCardProps {
  item: MediaItem;
  showProgress?: boolean;
}

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

export default function MovieCard({ item, showProgress = false }: MovieCardProps) {
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const { settings: appSettings } = useTheme();
  const [imgError, setImgError] = useState(false);
  const inWatchlist = watchlist.includes(item.id);
  const progress = continueWatching.find(c => c.id === item.id)?.progress || 0;

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMouseEnter = useCallback(() => {
    if (!item.filename) return;
    hoverTimerRef.current = setTimeout(() => prefetchVideo(item.filename), PREFETCH_DELAY_MS);
  }, [item.filename]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
  }, []);

  // Play goes straight to player; card click goes to detail page
  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/player/${item.id}`);
  };

  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) removeFromWatchlist(item.id);
    else addToWatchlist(item.id);
  };

  const handleInfo = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/movie/${item.id}`);
  };

  return (
    <motion.div
      className="relative flex-shrink-0 w-36 sm:w-44 cursor-pointer group"
      whileHover={{ scale: 1.05, zIndex: 10 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => navigate(`/movie/${item.id}`)}
    >
      {/* Poster */}
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
            <Film className="w-7 h-7 text-muted-foreground/40 flex-shrink-0" />
            <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-3">{item.title}</p>
          </div>
        )}

        {/* Hover overlay */}
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

            {/* Info / detail */}
            <button
              onClick={handleInfo}
              className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center hover:border-white transition-colors"
              title="More info"
            >
              <Info className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>

        {/* Rating badge */}
        {item.imdbRating && item.imdbRating !== 'N/A' && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 rounded px-1 py-0.5 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-accent fill-accent" />
            <span className="text-[10px] text-white font-medium">{item.imdbRating}</span>
          </div>
        )}

        {/* Progress bar */}
        {showProgress && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div className="h-full bg-primary" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
      </div>

      {/* Title + meta */}
      <div className="mt-1.5 px-0.5">
        <p className="text-xs text-foreground font-medium truncate">{item.title}</p>
        <p className="text-[10px] text-muted-foreground">{item.year}</p>
        {appSettings.showEnrichmentTags && (item.enrichment?.mood?.length || item.enrichment?.tags?.length) ? (
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
        ) : null}
      </div>
    </motion.div>
  );
}
