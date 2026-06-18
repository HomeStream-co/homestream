import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Check, Film } from 'lucide-react';
import type { MediaItem } from '@/types/media';

function PosterImage({ poster, title }: { poster?: string; title: string }) {
  const [err, setErr] = useState(false);
  if (!poster || err) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
        <Film className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground text-center line-clamp-3">{title}</p>
      </div>
    );
  }
  return (
    <img
      src={poster}
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setErr(true)}
    />
  );
}

interface PickerProps {
  items: MediaItem[];
  onPlay: (itemId: string) => void;
  onClose: () => void;
}

function MoviePicker({ items, onPlay, onClose }: PickerProps) {
  // Sort movies by year or release order
  const movies = [...items].sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' as const }}
      className="absolute left-0 right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      style={{ minWidth: '260px' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
        {movies.map(m => {
          const watched = (m.watchProgress ?? 0) >= 90;
          return (
            <button
              key={m.id}
              onClick={() => onPlay(m.id)}
              className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-xl transition-colors group"
            >
              <div className="flex flex-col items-start min-w-0 pr-3">
                <span className={`text-sm font-medium truncate w-full text-left ${watched ? 'text-muted-foreground' : 'text-foreground group-hover:text-primary'}`}>
                  {m.title}
                </span>
                <span className="text-[10px] text-muted-foreground">{m.year}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {watched && <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />}
                <Play className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
      <div className="p-1 border-t border-border bg-muted/20">
        <button
          onClick={onClose}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}

interface CollectionCardProps {
  items: MediaItem[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  animDelay?: number;
}

export default function CollectionCard({
  items,
  selectMode,
  selectedIds,
  onToggleSelect,
  onDelete,
  onEdit,
  animDelay = 0,
}: CollectionCardProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const rep = items[0];
  const collectionInfo = rep.collection!;
  const title = collectionInfo.name;
  const poster = collectionInfo.poster || rep.poster;

  const anySelected = items.some(m => selectedIds.has(m.id));

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const handlePlay = (itemId: string) => {
    setPickerOpen(false);
    navigate(`/player/${itemId}`);
  };

  const handleCardClick = () => {
    if (selectMode) {
      items.forEach(m => onToggleSelect(m.id));
      return;
    }
    setPickerOpen(v => !v);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(animDelay, 0.4), ease: 'easeOut' as const }}
      className="group relative"
    >
      <div
        className={`aspect-[2/3] rounded-xl overflow-hidden bg-card relative transition-all duration-200 cursor-pointer ${
          selectMode && anySelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
            : 'group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] group-hover:-translate-y-0.5'
        }`}
        onClick={handleCardClick}
      >
        <PosterImage poster={poster} title={title} />

        {selectMode && (
          <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            anySelected ? 'bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]' : 'bg-black/50 border-white/60'
          }`}>
            {anySelected && <Check className="w-3.5 h-3.5 text-white" />}
          </div>
        )}

        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
          <div className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
            <Film className="w-3 h-3" />
            Collection
          </div>
          <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow">
            {items.length} Movies
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-end justify-between transition-opacity duration-300">
          <div className="flex-1 min-w-0 mr-2">
            <h3 className="font-medium text-sm text-white truncate drop-shadow-md">{title}</h3>
          </div>
          {!selectMode && (
            <button
              onClick={e => { e.stopPropagation(); setPickerOpen(v => !v); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                pickerOpen ? 'bg-primary text-white shadow-[0_0_15px_hsl(var(--primary)/0.4)]' : 'bg-white/20 hover:bg-primary/90 text-white backdrop-blur-sm'
              }`}
            >
              <Play className="w-4 h-4 ml-0.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pickerOpen && !selectMode && (
          <MoviePicker
            items={items}
            onPlay={handlePlay}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
