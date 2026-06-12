/**
 * ShowCard — a single poster card representing a whole TV show in the library.
 *
 * Clicking the card (or the play button) opens a season/episode picker panel
 * that slides in below the card. Selecting an episode navigates to the player.
 *
 * Props:
 *   items  — all MediaItem records for this show (one per episode group / season)
 *   The first item's poster/title/year/rating is used for the card face.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ChevronDown, Tv2, Star, Check, Trash2, Edit2, Bell } from 'lucide-react';
import type { MediaItem, Episode } from '@/types/media';
import { toast } from 'sonner';

// ── helpers ──────────────────────────────────────────────────────────────────

function PosterImage({ poster, title }: { poster?: string; title: string }) {
  const [err, setErr] = useState(false);
  if (!poster || err) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
        <Tv2 className="w-8 h-8 text-muted-foreground/30" />
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

// ── Season/Episode picker ─────────────────────────────────────────────────────

interface PickerProps {
  items: MediaItem[];
  onPlay: (itemId: string, episodeId?: string) => void;
  onClose: () => void;
}

function EpisodePicker({ items, onPlay, onClose }: PickerProps) {
  // Build season map: season number → episodes (from all items' episodes arrays)
  // Each item may represent a season or a batch of episodes.
  const seasonMap = new Map<number, { episode: Episode; itemId: string }[]>();

  for (const item of items) {
    if (item.episodes && item.episodes.length > 0) {
      for (const ep of item.episodes) {
        const s = ep.season ?? 1;
        if (!seasonMap.has(s)) seasonMap.set(s, []);
        seasonMap.get(s)!.push({ episode: ep, itemId: item.id });
      }
    } else {
      // Item has no episodes array — treat the item itself as a single episode
      // Try to parse S/E from filename or fall back to season 1 ep 1
      const s = 1;
      if (!seasonMap.has(s)) seasonMap.set(s, []);
      seasonMap.get(s)!.push({
        episode: {
          id: item.id,
          season: 1,
          episode: seasonMap.get(s)!.length + 1,
          title: item.title,
          watched: (item.watchProgress ?? 0) >= 90,
        },
        itemId: item.id,
      });
    }
  }

  const seasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
  const [activeSeason, setActiveSeason] = useState(seasons[0] ?? 1);
  const episodes = (seasonMap.get(activeSeason) ?? []).sort(
    (a, b) => a.episode.episode - b.episode.episode,
  );

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
      {/* Season tabs */}
      {seasons.length > 1 && (
        <div className="flex gap-1 p-2 border-b border-border bg-muted/30 overflow-x-auto">
          {seasons.map(s => (
            <button
              key={s}
              onClick={() => setActiveSeason(s)}
              className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeSeason === s
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              S{s}
            </button>
          ))}
        </div>
      )}

      {/* Episode list */}
      <div className="max-h-64 overflow-y-auto">
        {episodes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No episodes found</p>
        ) : (
          episodes.map(({ episode: ep, itemId }) => (
            <button
              key={ep.id}
              onClick={() => onPlay(itemId, ep.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left group"
            >
              {/* Episode number badge */}
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                {ep.episode}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {ep.title || `Episode ${ep.episode}`}
                </p>
                {ep.runtime && (
                  <p className="text-[10px] text-muted-foreground">{ep.runtime}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {ep.watched && (
                  <Check className="w-3.5 h-3.5 text-primary" />
                )}
                <Play className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Close */}
      <div className="border-t border-border p-2">
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

// ── ShowCard ──────────────────────────────────────────────────────────────────

interface ShowCardProps {
  items: MediaItem[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  animDelay?: number;
}

export default function ShowCard({
  items,
  selectMode,
  selectedIds,
  onToggleSelect,
  onDelete,
  onEdit,
  animDelay = 0,
}: ShowCardProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [subscribed, setSubscribed] = useState(false);

  // Representative item — first one, used for poster/title/rating
  const rep = items[0];

  // Check subscription status on mount
  useEffect(() => {
    const imdbId = rep.imdbId;
    if (!imdbId) return;
    fetch('/api/subscriptions', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { subscriptions?: Array<{ imdbId: string }> }) => {
        setSubscribed(!!data.subscriptions?.find(s => s.imdbId === imdbId));
      })
      .catch(() => {});
  }, [rep.imdbId]);

  const handleSubscribeToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const imdbId = rep.imdbId;
    if (!imdbId) return;

    if (subscribed) {
      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imdbId, action: 'unsubscribe' }),
        });
        if (!res.ok) throw new Error('Unsubscribe failed');
        setSubscribed(false);
        toast.success(`Unsubscribed from ${rep.title}`);
      } catch {
        toast.error('Failed to unsubscribe');
      }
    } else {
      const totalSeasons = Math.max(
        ...items.flatMap(m => m.episodes?.map(ep => ep.season) ?? [1]),
        1,
      );
      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imdbId,
            title: rep.title,
            poster: rep.poster,
            totalSeasons,
            schedule: 'daily',
            enabled: true,
          }),
        });
        if (!res.ok) throw new Error('Subscribe failed');
        setSubscribed(true);
        toast.success(`Subscribed to ${rep.title} — new episodes will auto-download`);
      } catch {
        toast.error('Failed to subscribe');
      }
    }
  };

  const anySelected = items.some(m => selectedIds.has(m.id));

  // Total episode count across all items
  const totalEpisodes = items.reduce((sum, m) => {
    if (m.episodes && m.episodes.length > 0) return sum + m.episodes.length;
    return sum + 1;
  }, 0);

  // Watched count
  const watchedCount = items.reduce((sum, m) => {
    if (m.episodes && m.episodes.length > 0) {
      return sum + m.episodes.filter(e => e.watched).length;
    }
    return sum + ((m.watchProgress ?? 0) >= 90 ? 1 : 0);
  }, 0);

  // Close picker when clicking outside
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

  const handlePlay = (itemId: string, episodeId?: string) => {
    setPickerOpen(false);
    const url = episodeId ? `/player/${itemId}?episode=${episodeId}` : `/player/${itemId}`;
    navigate(url);
  };

  const handleCardClick = () => {
    if (selectMode) {
      // In select mode, toggle all episodes of this show
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
      {/* Poster card */}
      <div
        className={`aspect-[2/3] rounded-xl overflow-hidden bg-card relative transition-all duration-200 cursor-pointer ${
          selectMode && anySelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
            : 'group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] group-hover:-translate-y-0.5'
        }`}
        onClick={handleCardClick}
      >
        <PosterImage poster={rep.poster} title={rep.title} />

        {/* Select checkbox */}
        {selectMode && (
          <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            anySelected
              ? 'bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]'
              : 'bg-black/50 border-white/60'
          }`}>
            {anySelected && <Check className="w-3.5 h-3.5 text-white" />}
          </div>
        )}

        {/* Episode count badge */}
        {!selectMode && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-white/20 rounded-full px-2 py-0.5">
            <Tv2 className="w-2.5 h-2.5 text-white/70" />
            <span className="text-[9px] text-white font-semibold">
              {watchedCount}/{totalEpisodes}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        {!selectMode && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 p-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={e => { e.stopPropagation(); setPickerOpen(v => !v); }}
              className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:bg-primary/90 transition-colors"
              title="Select episode"
            >
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </motion.button>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); onEdit(rep); }}
                className="p-1.5 bg-white/15 hover:bg-white/25 rounded-full transition-colors backdrop-blur-sm"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5 text-white" />
              </button>
              {rep.imdbId && (
                <button
                  onClick={handleSubscribeToggle}
                  className={`p-1.5 rounded-full transition-colors backdrop-blur-sm ${
                    subscribed
                      ? 'bg-primary/80 hover:bg-primary'
                      : 'bg-white/15 hover:bg-white/25'
                  }`}
                  title={subscribed ? 'Unsubscribe from auto-download' : 'Subscribe to auto-download new episodes'}
                >
                  {subscribed
                    ? <Bell className="w-3.5 h-3.5 text-white fill-white" />
                    : <Bell className="w-3.5 h-3.5 text-white" />
                  }
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDelete(rep.id); }}
                className="p-1.5 bg-destructive/70 hover:bg-destructive rounded-full transition-colors"
                title="Delete show"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        )}

        {/* Picker toggle chevron */}
        {!selectMode && (
          <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 transition-all duration-200 ${pickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <div className="bg-black/70 backdrop-blur-sm border border-white/20 rounded-full px-2.5 py-0.5 flex items-center gap-1">
              <span className="text-[9px] text-white font-medium">Episodes</span>
              <ChevronDown className={`w-3 h-3 text-white transition-transform duration-200 ${pickerOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        )}
      </div>

      {/* Title + meta */}
      <div className="mt-2 px-0.5">
        <p className="text-xs font-semibold text-foreground truncate leading-snug">{rep.title}</p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[10px] text-muted-foreground">{rep.year}</p>
          {rep.imdbRating && rep.imdbRating !== 'N/A' && (
            <p className="text-[10px] text-yellow-400 flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-yellow-400" /> {rep.imdbRating}
            </p>
          )}
        </div>
      </div>

      {/* Episode picker dropdown */}
      <AnimatePresence>
        {pickerOpen && (
          <EpisodePicker
            items={items}
            onPlay={handlePlay}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
