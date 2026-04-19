/**
 * ShowCard — poster card that navigates to /show/:id (detail page).
 *
 * Used on the TV Shows grid. Click anywhere → detail page.
 * Hover overlay shows episode progress + a quick-play button.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Tv2, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { MediaItem } from '@/types/media';

interface ShowCardProps {
  show: MediaItem;
}

function getProgress(show: MediaItem) {
  const eps = show.episodes || [];
  if (eps.length === 0) return null;
  const watched = eps.filter(e => e.watched).length;
  return { watched, total: eps.length, pct: (watched / eps.length) * 100 };
}

export default function ShowCard({ show }: ShowCardProps) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const prog = getProgress(show);
  const done = prog ? prog.watched === prog.total && prog.total > 0 : false;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/player/${show.id}`);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.15 }}
      className="cursor-pointer group"
      onClick={() => navigate(`/show/${show.id}`)}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-lg">
        {/* Poster */}
        {!imgError && show.poster ? (
          <img
            src={show.poster}
            alt={show.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3">
            <Tv2 className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-3">{show.title}</p>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
          {/* Quick-play */}
          <button
            onClick={handlePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
            title="Play"
          >
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </button>
          <p className="text-white text-[10px] font-medium">View Details</p>
        </div>

        {/* Episode progress bar */}
        {prog && prog.total > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${prog.pct}%` }}
            />
          </div>
        )}

        {/* Completed badge */}
        {done && (
          <div className="absolute top-2 right-2 bg-primary/90 text-white rounded-full p-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Title + meta */}
      <div className="mt-2">
        <p className="text-sm font-medium text-foreground truncate">{show.title}</p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{show.year}</p>
          {prog ? (
            <p className="text-xs text-muted-foreground">{prog.watched}/{prog.total} ep</p>
          ) : (
            <p className="text-xs text-muted-foreground">No episodes</p>
          )}
        </div>
        {/* Progress bar under title */}
        {prog && prog.total > 0 && prog.pct > 0 && (
          <Progress value={prog.pct} className="h-0.5 mt-1" />
        )}
      </div>
    </motion.div>
  );
}
