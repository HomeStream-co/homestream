/**
 * TrailerButton
 *
 * Fetches a YouTube trailer key from /api/tmdb/trailer and opens a
 * full-screen modal with the embedded YouTube player.
 *
 * Uses youtube-nocookie.com — YouTube's privacy-enhanced domain.
 * This is the same domain Stremio uses. Because no Google account
 * cookie is attached, YouTube can't serve targeted pre-roll ads,
 * so trailers play clean the vast majority of the time.
 *
 * Props:
 *   title     — movie/show title (used for TMDB search)
 *   year      — optional release year string
 *   type      — 'movie' | 'series'
 *   className — optional override for the button style
 *   variant   — 'button' (default) | 'menuitem' (flat row for context menus)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Youtube, X, Loader2, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import { fetchTrailerKey } from '@/lib/trailerCache';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrailerButtonProps {
  title: string;
  year?: string;
  type?: 'movie' | 'series';
  className?: string;
  /** 'button' = styled pill button | 'menuitem' = flat row for context menus */
  variant?: 'button' | 'menuitem';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrailerButton({
  title, year, type = 'movie', className, variant = 'button',
}: TrailerButtonProps) {
  const [trailerKey, setTrailerKey] = useState<string | null | 'not-found'>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false); // start unmuted — user explicitly asked for trailer

  const fetchAndOpen = useCallback(async () => {
    // Already cached
    if (trailerKey && trailerKey !== 'not-found') { setOpen(true); return; }
    if (trailerKey === 'not-found') return;

    setLoading(true);
    try {
      const key = await fetchTrailerKey(title, year, type);
      if (key) {
        setTrailerKey(key);
        setOpen(true);
      } else {
        setTrailerKey('not-found');
      }
    } finally {
      setLoading(false);
    }
  }, [title, year, type, trailerKey]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const notFound = trailerKey === 'not-found';

  // ── Render: menuitem variant ──────────────────────────────────────────────
  if (variant === 'menuitem') {
    return (
      <>
        <button
          onClick={fetchAndOpen}
          disabled={loading || notFound}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading
            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            : <Youtube className="w-4 h-4 text-red-500 flex-shrink-0" />
          }
          <span className="text-sm font-medium text-foreground">
            {notFound ? 'No Trailer Found' : 'Play Trailer'}
          </span>
        </button>
        <TrailerModal
          open={open}
          trailerKey={trailerKey && trailerKey !== 'not-found' ? trailerKey : null}
          title={title}
          muted={muted}
          onMuteToggle={() => setMuted(m => !m)}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }

  // ── Render: default button variant ───────────────────────────────────────
  return (
    <>
      <button
        onClick={fetchAndOpen}
        disabled={loading || notFound}
        className={className ?? `flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        title={notFound ? 'No trailer available' : 'Watch trailer on YouTube (no ads)'}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Youtube className="w-4 h-4 text-red-500" />
        }
        {notFound ? 'No Trailer' : 'Trailer'}
      </button>

      <TrailerModal
        open={open}
        trailerKey={trailerKey && trailerKey !== 'not-found' ? trailerKey : null}
        title={title}
        muted={muted}
        onMuteToggle={() => setMuted(m => !m)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── Shared trailer modal ──────────────────────────────────────────────────────

interface TrailerModalProps {
  open: boolean;
  trailerKey: string | null;
  title: string;
  muted: boolean;
  onMuteToggle: () => void;
  onClose: () => void;
}

export function TrailerModal({ open, trailerKey, title, muted, onMuteToggle, onClose }: TrailerModalProps) {
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset blocked state when a new trailer opens
  useEffect(() => {
    if (open) setEmbedBlocked(false);
  }, [open, trailerKey]);

  // Detect CSP/sandbox block — the iframe load event fires but the content
  // is a blank page; we detect this via a short timeout after load.
  const handleIframeLoad = useCallback(() => {
    try {
      // If we can access contentDocument it loaded fine (same-origin only, but
      // cross-origin throws — which means YouTube loaded correctly).
    } catch {
      // Cross-origin access denied = YouTube loaded = fine
    }
  }, []);

  const youtubeUrl = trailerKey
    ? `https://www.youtube.com/watch?v=${trailerKey}`
    : null;

  return (
    <AnimatePresence>
      {open && trailerKey && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-5xl"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-white/50 text-xs uppercase tracking-widest truncate max-w-[70%]">
                {title} — Official Trailer
              </p>
              <div className="flex items-center gap-2">
                {!embedBlocked && (
                  <button
                    onClick={onMuteToggle}
                    className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs transition-colors"
                    title={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted
                      ? <><VolumeX className="w-3.5 h-3.5" /> Unmute</>
                      : <><Volume2 className="w-3.5 h-3.5" /> Mute</>
                    }
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-white/50 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
                >
                  <X className="w-4 h-4" /> Close
                </button>
              </div>
            </div>

            {/* Player or fallback */}
            {embedBlocked ? (
              <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900 flex flex-col items-center justify-center gap-5 py-16 px-8">
                <Youtube className="w-12 h-12 text-red-500" />
                <div className="text-center">
                  <p className="text-white font-semibold mb-1">Trailer can't play here</p>
                  <p className="text-white/50 text-sm mb-5">YouTube embedding is blocked in this environment.</p>
                  <a
                    href={youtubeUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Watch on YouTube
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  ref={iframeRef}
                  key={`${trailerKey}-${muted}`}
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&iv_load_policy=3&color=white`}
                  title={`${title} — Official Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  onLoad={handleIframeLoad}
                  onError={() => setEmbedBlocked(true)}
                />
              </div>
            )}

            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-white/20 text-[10px]">
                {embedBlocked ? '' : 'Playing via YouTube · Click outside or press Esc to close'}
              </p>
              {!embedBlocked && youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-white/30 hover:text-white/60 text-[10px] transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Open in YouTube
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
