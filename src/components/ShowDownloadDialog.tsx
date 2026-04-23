/**
 * ShowDownloadDialog — episode/season selector for show downloads.
 *
 * Three modes the user can pick:
 *   1. All seasons   — queues every episode (same as old behaviour)
 *   2. Select season — queues all episodes in one chosen season
 *   3. Pick episodes — checkbox grid; user selects individual episodes
 *
 * Calls POST /api/stremio/download for each selected season/episode.
 */

import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Layers, ListVideo, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { MediaItem, Episode } from '@/types/media';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonGroup {
  number: number;
  episodes: Episode[];
  watched: number;
  total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: MediaItem;
  seasons: SeasonGroup[];
}

type Mode = 'all' | 'season' | 'episodes';

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowDownloadDialog({ open, onOpenChange, item, seasons }: Props) {
  const [mode, setMode] = useState<Mode>('all');
  const [selectedSeason, setSelectedSeason] = useState<string>(
    seasons[0]?.number.toString() ?? '1'
  );
  const [selectedEps, setSelectedEps] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const totalSeasons = useMemo(
    () => Math.max(...seasons.map(s => s.number), 1),
    [seasons]
  );

  const episodesForSeason = useMemo(
    () => seasons.find(s => s.number === parseInt(selectedSeason))?.episodes ?? [],
    [seasons, selectedSeason]
  );

  const toggleEp = (key: string) => {
    setSelectedEps(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const toggleAllInSeason = () => {
    const keys = episodesForSeason.map(e => `${e.season}-${e.episode}`);
    const allSelected = keys.every(k => selectedEps.has(k));
    setSelectedEps(prev => {
      const next = new Set(prev);
      if (allSelected) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleDownload = async () => {
    if (!item.imdbId) {
      toast.error('No IMDB ID found for this show');
      return;
    }

    setDownloading(true);
    try {
      if (mode === 'all') {
        // Queue all seasons — server probes episode counts dynamically
        const res = await fetch('/api/stremio/download', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imdbId: item.imdbId,
            type: 'series',
            title: item.title,
            poster: item.poster,
            totalSeasons,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success(`Queued all seasons of "${item.title}"`);

      } else if (mode === 'season') {
        // Queue one full season
        const res = await fetch('/api/stremio/download', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imdbId: item.imdbId,
            type: 'series',
            title: item.title,
            poster: item.poster,
            season: parseInt(selectedSeason),
            totalSeasons,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success(`Queued Season ${selectedSeason} of "${item.title}"`);

      } else {
        // Queue individual episodes — one request per episode
        if (selectedEps.size === 0) {
          toast.error('Select at least one episode');
          setDownloading(false);
          return;
        }

        const tasks = Array.from(selectedEps).map(key => {
          const [s, e] = key.split('-').map(Number);
          return { season: s, episode: e };
        });

        // Fire all in parallel (server handles VPN + queueing)
        const results = await Promise.allSettled(
          tasks.map(({ season, episode }) =>
            fetch('/api/stremio/download', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imdbId: item.imdbId,
                type: 'series',
                title: item.title,
                poster: item.poster,
                season,
                episode,
                totalSeasons,
              }),
            })
          )
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`Queued ${ok} episode${ok !== 1 ? 's' : ''}`);
        if (failed > 0) toast.error(`${failed} episode${failed !== 1 ? 's' : ''} failed to queue`);
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  // Label for the confirm button
  const confirmLabel = useMemo(() => {
    if (mode === 'all') return 'Download All Seasons';
    if (mode === 'season') return `Download Season ${selectedSeason}`;
    const n = selectedEps.size;
    return n === 0 ? 'Select Episodes' : `Download ${n} Episode${n !== 1 ? 's' : ''}`;
  }, [mode, selectedSeason, selectedEps]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Download Episodes
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{item.title}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-5">

          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'all',      icon: Layers,      label: 'All Seasons' },
              { id: 'season',   icon: ListVideo,   label: 'One Season'  },
              { id: 'episodes', icon: CheckSquare, label: 'Pick Episodes' },
            ] as { id: Mode; icon: React.ElementType; label: string }[]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors ${
                  mode === id
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* All seasons summary */}
          {mode === 'all' && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {totalSeasons} season{totalSeasons !== 1 ? 's' : ''} will be queued
              </p>
              <p className="text-xs text-muted-foreground">
                HomeStream will probe Torrentio for each season's episode count and
                queue everything it finds. New episodes only — already-downloaded
                episodes are skipped.
              </p>
            </div>
          )}

          {/* Season picker */}
          {(mode === 'season' || mode === 'episodes') && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Season</label>
              <Select value={selectedSeason} onValueChange={v => {
                setSelectedSeason(v);
                setSelectedEps(new Set());
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seasons.length > 0
                    ? seasons.map(s => (
                        <SelectItem key={s.number} value={s.number.toString()}>
                          Season {s.number}
                          {s.total > 0 ? ` — ${s.total} episode${s.total !== 1 ? 's' : ''}` : ''}
                        </SelectItem>
                      ))
                    : Array.from({ length: totalSeasons }, (_, i) => i + 1).map(n => (
                        <SelectItem key={n} value={n.toString()}>Season {n}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Episode picker grid */}
          {mode === 'episodes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Episodes</label>
                {episodesForSeason.length > 0 && (
                  <button
                    onClick={toggleAllInSeason}
                    className="text-xs text-primary hover:underline"
                  >
                    {episodesForSeason.every(e => selectedEps.has(`${e.season}-${e.episode}`))
                      ? 'Deselect all'
                      : 'Select all'}
                  </button>
                )}
              </div>

              {episodesForSeason.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {episodesForSeason.map(ep => {
                    const key = `${ep.season}-${ep.episode}`;
                    const checked = selectedEps.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-primary/10 border-primary/40'
                            : 'bg-card border-border hover:bg-muted'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleEp(key)}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">
                            E{String(ep.episode).padStart(2, '0')}
                          </p>
                          {ep.title && (
                            <p className="text-[10px] text-muted-foreground truncate">{ep.title}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">
                    No episode data in library for this season yet. HomeStream will
                    probe Torrentio for available episodes when you confirm.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    To pick specific episodes, add them to your library first via
                    the Episode Tracker, then download from here.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={downloading || (mode === 'episodes' && selectedEps.size === 0 && episodesForSeason.length > 0)}
          >
            {downloading ? (
              <>
                <span className="w-4 h-4 mr-2 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin inline-block" />
                Queuing…
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
