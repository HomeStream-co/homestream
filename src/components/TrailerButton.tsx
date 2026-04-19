/**
 * TrailerButton
 *
 * Fetches a YouTube trailer key from /api/tmdb/trailer and shows an
 * inline modal with the embedded YouTube player.
 *
 * Props:
 *   title  — movie/show title (used for TMDB search)
 *   year   — optional release year
 *   type   — 'movie' | 'series'
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Youtube, X, Loader2 } from 'lucide-react';

interface TrailerButtonProps {
  title: string;
  year?: string;
  type?: 'movie' | 'series';
  className?: string;
}

export default function TrailerButton({ title, year, type = 'movie', className }: TrailerButtonProps) {
  const [trailerKey, setTrailerKey] = useState<string | null | 'not-found'>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchAndOpen = useCallback(async () => {
    if (trailerKey && trailerKey !== 'not-found') {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ title, type });
      if (year) params.set('year', year);
      const res = await fetch(`/api/tmdb/trailer?${params}`);
      const data = await res.json() as { trailerKey: string | null };
      if (data.trailerKey) {
        setTrailerKey(data.trailerKey);
        setOpen(true);
      } else {
        setTrailerKey('not-found');
      }
    } catch {
      setTrailerKey('not-found');
    } finally {
      setLoading(false);
    }
  }, [title, year, type, trailerKey]);

  return (
    <>
      <button
        onClick={fetchAndOpen}
        disabled={loading || trailerKey === 'not-found'}
        className={className ?? `flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        title={trailerKey === 'not-found' ? 'No trailer available' : 'Watch trailer'}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Youtube className="w-4 h-4 text-red-500" />
        }
        {trailerKey === 'not-found' ? 'No Trailer' : 'Trailer'}
      </button>

      <AnimatePresence>
        {open && trailerKey && trailerKey !== 'not-found' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-4xl"
            >
              {/* Close button */}
              <button
                onClick={() => setOpen(false)}
                className="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
              >
                <X className="w-4 h-4" /> Close
              </button>

              {/* Title */}
              <p className="text-white/50 text-xs uppercase tracking-widest text-center mb-3">{title} — Official Trailer</p>

              {/* YouTube embed */}
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full rounded-xl"
                  src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
                  title={`${title} trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
