import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Plus, Check, Star } from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';

interface MediaCardProps {
  item: MediaItem;
  showProgress?: boolean;
}

export default function MediaCard({ item, showProgress = false }: MediaCardProps) {
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist, continueWatching } = useMedia();
  const [imgError, setImgError] = useState(false);
  const inWatchlist = watchlist.includes(item.id);
  const progress = continueWatching.find(c => c.id === item.id)?.progress || 0;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/player/${item.id}`);
  };

  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) removeFromWatchlist(item.id);
    else addToWatchlist(item.id);
  };

  return (
    <motion.div
      className="relative flex-shrink-0 w-36 sm:w-44 cursor-pointer group"
      whileHover={{ scale: 1.05, zIndex: 10 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/player/${item.id}`)}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card">
        {!imgError ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground text-xs text-center p-2">
            {item.title}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
          <button
            onClick={handlePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
          >
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </button>
          <button
            onClick={handleWatchlist}
            className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center hover:border-white transition-colors"
          >
            {inWatchlist
              ? <Check className="w-3.5 h-3.5 text-white" />
              : <Plus className="w-3.5 h-3.5 text-white" />
            }
          </button>
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
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-1.5 px-0.5">
        <p className="text-xs text-foreground font-medium truncate">{item.title}</p>
        <p className="text-[10px] text-muted-foreground">{item.year}</p>
      </div>
    </motion.div>
  );
}
