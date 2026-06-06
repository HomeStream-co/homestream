/**
 * MediaContextMenu — Stremio-style slide-in side panel
 *
 * Opens when the user right-clicks (desktop) or long-presses (mobile) any
 * MediaCard in the library or carousels.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Info, Star, StarOff, X, Film, Tv2, Trash2, AlertTriangle,
} from 'lucide-react';
import type { MediaItem } from '@/types/media';
import { useMedia } from '@/context/MediaContext';
import TrailerButton from '@/components/TrailerButton';
import { toast } from 'sonner';

interface MediaContextMenuProps {
  item: MediaItem;
  children: React.ReactNode;
  disabled?: boolean;
}

export default function MediaContextMenu({ item, children, disabled = false }: MediaContextMenuProps) {
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist, deleteMedia } = useMedia();
  const inWatchlist = watchlist.includes(item.id);

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback((x: number, y: number) => {
    if (disabled) return;
    setMenuPos({ x, y });
    setOpen(true);
  }, [disabled]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuPos(null);
    setConfirmDelete(false);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }, [openMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      openMenu(touch.clientX, touch.clientY);
    }, 500);
  }, [openMenu]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [open, closeMenu]);

  const detailPath = item.type === 'movie'
    ? `/movie/${item.id}`
    : item.type === 'series'
      ? `/show/${item.id}`
      : `/player/${item.id}`;

  const playerPath = `/player/${item.id}`;

  const handlePlay = () => { closeMenu(); navigate(playerPath); };
  const handleInfo = () => { closeMenu(); navigate(detailPath); };
  const handleFavorite = () => {
    if (inWatchlist) { removeFromWatchlist(item.id); } else { addToWatchlist(item.id); }
  };
  const handleDeleteConfirmed = async () => {
    closeMenu();
    await deleteMedia(item.id);
    toast.success(`"${item.title}" removed from library`);
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const getMenuStyle = (): React.CSSProperties => {
    if (isMobile || !menuPos) return {};
    const menuW = 220;
    const menuH = 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = menuPos.x + 8;
    let y = menuPos.y + 8;
    if (x + menuW > vw - 12) x = menuPos.x - menuW - 8;
    if (y + menuH > vh - 12) y = menuPos.y - menuH - 8;
    return { position: 'fixed', left: x, top: y, zIndex: 300 };
  };

  const FallbackIcon = item.type === 'series' ? Tv2 : Film;

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      className="relative"
    >
      {children}

      <AnimatePresence>
        {open && (
          <>
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[290] bg-black/50"
                onClick={closeMenu}
              />
            )}

            <motion.div
              ref={menuRef}
              initial={isMobile ? { y: '100%', opacity: 1 } : { opacity: 0, scale: 0.95 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={isMobile ? { y: '100%', opacity: 1 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={isMobile
                ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300 }
                : getMenuStyle()
              }
              className={`bg-card border border-border shadow-2xl overflow-hidden ${
                isMobile ? 'rounded-t-2xl' : 'rounded-xl w-56'
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                <div className="w-10 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {item.poster
                    ? <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <FallbackIcon className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{item.title}</p>
                  {item.year && <p className="text-xs text-muted-foreground mt-0.5">{item.year}</p>}
                </div>
                <button
                  onClick={closeMenu}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {confirmDelete ? (
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-foreground">Remove from library?</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      This removes the entry from HomeStream. The file on disk is not deleted.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteConfirmed}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />Remove
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={handlePlay} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Play className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground ml-0.5" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {item.type === 'series' ? 'Watch Show' : 'Play'}
                      </span>
                    </button>

                    {(item.type === 'movie' || item.type === 'series') && (
                      <button onClick={handleInfo} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <Info className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium text-foreground">More Info</span>
                      </button>
                    )}

                    <button onClick={handleFavorite} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inWatchlist ? 'bg-yellow-500/20' : 'bg-muted'}`}>
                        {inWatchlist
                          ? <StarOff className="w-3.5 h-3.5 text-yellow-500" />
                          : <Star className="w-3.5 h-3.5 text-muted-foreground" />
                        }
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {inWatchlist ? 'Remove from Favorites' : 'Add to Favorites'}
                      </span>
                    </button>

                    <TrailerButton
                      title={item.title}
                      year={item.year}
                      type={item.type === 'series' ? 'series' : 'movie'}
                      variant="menuitem"
                    />

                    <div className="border-t border-border mx-4 my-1" />
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-left group"
                    >
                      <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </div>
                      <span className="text-sm font-medium text-red-400">Remove from Library</span>
                    </button>
                  </>
                )}
              </div>

              {isMobile && <div className="h-safe-bottom pb-4" />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
