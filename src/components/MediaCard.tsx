/**
 * MediaCard — stub component.
 * Replace with full implementation when you send src/components/MediaCard.tsx.
 */
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  showProgress?: boolean;
}

export default function MediaCard({ item, showProgress }: Props) {
  return (
    <Link to={`/player/${item.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card mb-2">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Play className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
        {showProgress && item.watchProgress > 2 && item.watchProgress < 95 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-primary" style={{ width: `${item.watchProgress}%` }} />
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
      <p className="text-xs text-muted-foreground">{item.year}</p>
    </Link>
  );
}
