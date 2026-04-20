/**
 * PlayerEndOverlay — post-watch screen shown at 85% completion.
 *
 * Shows:
 *   - "You finished" title card
 *   - Up Next card with autoplay countdown ring
 *   - "Also recommended" 3-up grid
 *   - Continue Watching row
 *   - Watch Again / Back to Home buttons
 */

import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, RotateCcw, Star, Sparkles } from 'lucide-react';

const AUTOPLAY_SECONDS = 60;

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * (seconds / total);
  return (
    <svg width="72" height="72" className="absolute inset-0 -rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s linear' }}
      />
    </svg>
  );
}

interface MediaItem {
  id: string;
  title: string;
  year: string | number;
  genre: string[];
  poster?: string;
  imdbRating?: string;
  progress?: number;
}

interface NextItem extends MediaItem {
  imdbRating: string;
}

interface Props {
  item: { title: string; year: string | number; genre: string[] };
  nextItem: NextItem | null;
  similarItems: MediaItem[];
  resumeItems: (MediaItem & { progress: number })[];
  autoplayCountdown: number;
  autoplayCancelled: boolean;
  autoplayTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | undefined>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  watchCompleteTriggered: React.MutableRefObject<boolean>;
  setShowEndOverlay: (v: boolean) => void;
  setAutoplayCancelled: (v: boolean) => void;
  fadeAndNavigate: (to: string) => void;
}

export default function PlayerEndOverlay({
  item, nextItem, similarItems, resumeItems,
  autoplayCountdown, autoplayCancelled, autoplayTimerRef,
  videoRef, watchCompleteTriggered,
  setShowEndOverlay, setAutoplayCancelled, fadeAndNavigate,
}: Props) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-6 overflow-y-auto py-8"
      onClick={e => e.stopPropagation()}
    >
      {/* Finished title */}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-white/50 text-xs font-medium uppercase tracking-widest">You finished</p>
        </div>
        <h2 className="text-2xl font-heading text-white">{item.title}</h2>
        <p className="text-white/40 text-sm">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
      </motion.div>

      {/* Up Next */}
      {nextItem && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="w-full max-w-md">
          <p className="text-white/40 text-xs uppercase tracking-widest text-center mb-3">
            {autoplayCancelled ? 'Up Next' : `Playing next in ${autoplayCountdown}s`}
          </p>
          <div className="flex gap-4 items-center bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="relative flex-shrink-0 w-16">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/10">
                {nextItem.poster ? (
                  <img src={nextItem.poster} alt={nextItem.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                  </div>
                )}
              </div>
              {!autoplayCancelled && (
                <div className="absolute -inset-1 flex items-center justify-center">
                  <CountdownRing seconds={autoplayCountdown} total={AUTOPLAY_SECONDS} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{nextItem.title}</p>
              <p className="text-white/40 text-xs">{nextItem.year} · {nextItem.genre.slice(0, 1).join(', ')}</p>
              {nextItem.imdbRating !== 'N/A' && (
                <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {nextItem.imdbRating}
                </p>
              )}
            </div>
            <button
              onClick={() => { setShowEndOverlay(false); navigate(`/player/${nextItem.id}`); }}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
            >
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </button>
          </div>
          {!autoplayCancelled && (
            <button
              onClick={() => { setAutoplayCancelled(true); clearInterval(autoplayTimerRef.current); }}
              className="mt-2 w-full text-center text-white/30 hover:text-white/60 text-xs transition-colors"
            >
              Cancel autoplay
            </button>
          )}
        </motion.div>
      )}

      {/* Also recommended */}
      {similarItems.slice(1, 4).length > 0 && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }} className="w-full max-w-md">
          <p className="text-white/30 text-xs uppercase tracking-widest text-center mb-2">Also recommended</p>
          <div className="grid grid-cols-3 gap-2">
            {similarItems.slice(1, 4).map(m => (
              <button key={m.id} onClick={() => { setShowEndOverlay(false); navigate(`/player/${m.id}`); }} className="group text-left">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-1 bg-white/10">
                  {m.poster ? (
                    <img src={m.poster} alt={m.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : null}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-6 h-6 text-white fill-white" />
                  </div>
                </div>
                <p className="text-white text-[11px] font-medium truncate">{m.title}</p>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Continue watching */}
      {resumeItems.length > 0 && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }} className="w-full max-w-md">
          <p className="text-white/30 text-xs uppercase tracking-widest text-center mb-2">Continue watching</p>
          <div className="flex flex-col gap-2">
            {resumeItems.map(m => (
              <button
                key={m.id}
                onClick={() => { setShowEndOverlay(false); navigate(`/player/${m.id}`); }}
                className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-2 transition-colors text-left"
              >
                <img src={m.poster} alt={m.title} className="w-10 aspect-[2/3] object-cover rounded flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{m.title}</p>
                  <div className="mt-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${m.progress}%` }} />
                  </div>
                </div>
                <Play className="w-4 h-4 text-white/50 flex-shrink-0" />
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-3">
        <button
          onClick={() => {
            setShowEndOverlay(false);
            clearInterval(autoplayTimerRef.current);
            if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); }
            watchCompleteTriggered.current = false;
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/50 text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Watch Again
        </button>
        <button
          onClick={() => fadeAndNavigate('/')}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary hover:bg-primary/80 text-white text-sm font-medium transition-colors"
        >
          Back to Home
        </button>
      </motion.div>
    </motion.div>
  );
}
