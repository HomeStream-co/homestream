/**
 * PlayerInfoPanel — slide-in info panel (right side of player).
 * Shows poster, title, metadata, rating, plot, director, cast,
 * and a compact keyboard shortcut reference.
 */

import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { toActorsString } from '@/lib/utils';

interface Enrichment {
  whyWatch?: string;
  mood: string[];
  tags: string[];
  contentWarnings: string[];
  aiSummary?: string;
}

interface MediaItem {
  title: string;
  year: string | number;
  rated?: string;
  runtime?: string;
  imdbRating?: string;
  plot?: string;
  director?: string;
  actors?: string | string[];
  poster?: string;
  enrichment?: Enrichment;
}

interface Props {
  item: MediaItem;
}

export default function PlayerInfoPanel({ item }: Props) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25 }}
      className="absolute top-0 right-0 bottom-0 w-72 bg-black/90 backdrop-blur-sm p-5 overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      <img
        src={item.poster}
        alt={item.title}
        className="w-full aspect-[2/3] object-cover rounded-lg mb-4"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <h3 className="text-lg font-heading text-white mb-1">{item.title}</h3>
      <div className="flex items-center gap-2 mb-3 text-xs text-white/60">
        <span>{item.year}</span>
        {item.rated && item.rated !== 'N/A' && <span className="border border-white/30 px-1 rounded">{item.rated}</span>}
        {item.runtime && <span>{item.runtime}</span>}
      </div>
      {item.imdbRating !== 'N/A' && (
        <div className="flex items-center gap-1 mb-3">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          <span className="text-yellow-400 font-semibold text-sm">{item.imdbRating}/10</span>
        </div>
      )}
      <p className="text-xs text-white/70 leading-relaxed mb-3">{item.plot}</p>
      {item.director !== 'Unknown' && (
        <p className="text-xs text-white/50"><span className="text-white/70">Director:</span> {item.director}</p>
      )}
      {item.actors !== 'Unknown' && (
        <p className="text-xs text-white/50 mt-1"><span className="text-white/70">Cast:</span> {toActorsString(item.actors)}</p>
      )}
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Keyboard Shortcuts</p>
        {[
          ['Space / K', 'Play / Pause'],
          ['← / J', 'Rewind 10s'],
          ['→ / L', 'Forward 10s'],
          ['↑ / ↓', 'Volume'],
          ['M', 'Mute'],
          ['F', 'Fullscreen'],
          ['I', 'Toggle info'],
          ['Esc', 'Close panels'],
        ].map(([key, label]) => (
          <div key={key} className="flex justify-between text-xs mb-1">
            <kbd className="text-white/40 bg-white/10 px-1.5 rounded font-mono">{key}</kbd>
            <span className="text-white/30">{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
