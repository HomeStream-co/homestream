import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { Episode, Season, MediaItem } from '@/types/media';
import { Progress } from '@/components/ui/progress';

interface EpisodeTrackerProps {
  show: MediaItem;
  onUpdate?: (episodes: Episode[]) => void;
}

function groupIntoSeasons(episodes: Episode[]): Season[] {
  const map = new Map<number, Episode[]>();
  for (const ep of episodes) {
    if (!map.has(ep.season)) map.set(ep.season, []);
    map.get(ep.season)!.push(ep);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([number, eps]) => ({
      number,
      episodes: eps.sort((a, b) => a.episode - b.episode),
      watchedCount: eps.filter(e => e.watched).length,
      totalCount: eps.length,
    }));
}

export default function EpisodeTracker({ show, onUpdate }: EpisodeTrackerProps) {
  const [episodes, setEpisodes] = useState<Episode[]>(show.episodes || []);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set([1]));
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ season: 1, episodeCount: 10, startEpisode: 1, titlePrefix: 'Episode' });

  useEffect(() => {
    setSeasons(groupIntoSeasons(episodes));
  }, [episodes]);

  // Fetch latest episodes from server
  const fetchEpisodes = useCallback(async () => {
    if (show.type !== 'series') return;
    try {
      setLoading(true);
      const res = await fetch(`/api/media/${show.id}/episodes`);
      if (res.ok) {
        const data: Episode[] = await res.json();
        setEpisodes(data);
        onUpdate?.(data);
      }
    } catch (err) {
      console.error('Failed to fetch episodes:', err);
    } finally {
      setLoading(false);
    }
  }, [show.id, show.type, onUpdate]);

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  const toggleEpisode = async (ep: Episode) => {
    setTogglingId(ep.id);
    const newWatched = !ep.watched;

    // Optimistic update
    setEpisodes(prev =>
      prev.map(e => e.id === ep.id ? { ...e, watched: newWatched, watchedAt: newWatched ? new Date().toISOString() : undefined } : e)
    );

    try {
      const res = await fetch(`/api/media/${show.id}/episodes/${ep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watched: newWatched }),
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch {
      // Revert on error
      setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, watched: ep.watched } : e));
      toast.error('Failed to update episode');
    } finally {
      setTogglingId(null);
    }
  };

  const markSeasonWatched = async (season: Season, watched: boolean) => {
    const updates = season.episodes.filter(ep => ep.watched !== watched);
    if (updates.length === 0) return;

    // Optimistic update all at once
    setEpisodes(prev =>
      prev.map(e =>
        season.episodes.some(se => se.id === e.id)
          ? { ...e, watched, watchedAt: watched ? new Date().toISOString() : undefined }
          : e
      )
    );

    try {
      await Promise.all(
        updates.map(ep =>
          fetch(`/api/media/${show.id}/episodes/${ep.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watched }),
          })
        )
      );
      toast.success(`Season ${season.number} marked as ${watched ? 'watched' : 'unwatched'}`);
    } catch {
      fetchEpisodes(); // Re-fetch on error
      toast.error('Failed to update season');
    }
  };

  const addEpisodes = async () => {
    const newEps = Array.from({ length: addForm.episodeCount }, (_, i) => ({
      season: addForm.season,
      episode: addForm.startEpisode + i,
      title: `${addForm.titlePrefix} ${addForm.startEpisode + i}`,
    }));

    try {
      const res = await fetch(`/api/media/${show.id}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEps),
      });
      if (!res.ok) throw new Error('Failed to add episodes');
      const updated: Episode[] = await res.json();
      setEpisodes(updated);
      onUpdate?.(updated);
      setShowAddForm(false);
      toast.success(`Added ${newEps.length} episodes to Season ${addForm.season}`);
      setExpandedSeasons(prev => new Set([...prev, addForm.season]));
    } catch {
      toast.error('Failed to add episodes');
    }
  };

  const totalWatched = episodes.filter(e => e.watched).length;
  const totalEpisodes = episodes.length;
  const overallProgress = totalEpisodes > 0 ? (totalWatched / totalEpisodes) * 100 : 0;

  const toggleSeason = (n: number) => {
    setExpandedSeasons(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  if (loading && episodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      {totalEpisodes > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Overall Progress</span>
            <span className="text-sm text-muted-foreground">
              {totalWatched} / {totalEpisodes} episodes
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1.5">
            {Math.round(overallProgress)}% complete · {seasons.length} season{seasons.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Season List */}
      {seasons.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground text-sm mb-3">No episodes tracked yet.</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add episodes to get started
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {seasons.map(season => {
            const expanded = expandedSeasons.has(season.number);
            const allWatched = season.watchedCount === season.totalCount;
            const seasonProgress = (season.watchedCount / season.totalCount) * 100;

            return (
              <div key={season.number} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Season Header */}
                <button
                  onClick={() => toggleSeason(season.number)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                >
                  <span className="text-muted-foreground">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className="font-medium text-foreground flex-1">Season {season.number}</span>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 w-24">
                      <Progress value={seasonProgress} className="h-1.5 flex-1" />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {season.watchedCount}/{season.totalCount}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); markSeasonWatched(season, !allWatched); }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                        allWatched
                          ? 'border-primary/50 text-primary bg-primary/10 hover:bg-primary/20'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
                      }`}
                    >
                      {allWatched ? '✓ Watched' : 'Mark all'}
                    </button>
                  </div>
                </button>

                {/* Episode List */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border divide-y divide-border/50">
                        {season.episodes.map(ep => (
                          <div
                            key={ep.id}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                              ep.watched ? 'bg-primary/5' : 'hover:bg-secondary/30'
                            }`}
                          >
                            <button
                              onClick={() => toggleEpisode(ep)}
                              disabled={togglingId === ep.id}
                              className="flex-shrink-0 transition-colors"
                            >
                              {togglingId === ep.id ? (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              ) : ep.watched ? (
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                              ) : (
                                <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  E{String(ep.episode).padStart(2, '0')}
                                </span>
                                <span className={`text-sm truncate ${ep.watched ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {ep.title}
                                </span>
                              </div>
                              {ep.plot && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{ep.plot}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {ep.runtime && (
                                <span className="text-xs text-muted-foreground hidden sm:block">{ep.runtime}</span>
                              )}
                              {ep.watchedAt && (
                                <span className="text-xs text-muted-foreground hidden md:block">
                                  {new Date(ep.watchedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Episodes Button */}
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAddForm ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showAddForm ? 'Cancel' : 'Add episodes'}
      </button>

      {/* Add Episodes Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-xl p-4 space-y-3"
          >
            <p className="text-sm font-medium text-foreground">Add Episodes</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Season #</label>
                <input
                  type="number"
                  min={1}
                  value={addForm.season}
                  onChange={e => setAddForm(p => ({ ...p, season: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Start at Ep #</label>
                <input
                  type="number"
                  min={1}
                  value={addForm.startEpisode}
                  onChange={e => setAddForm(p => ({ ...p, startEpisode: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Episode Count</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={addForm.episodeCount}
                  onChange={e => setAddForm(p => ({ ...p, episodeCount: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Title Prefix</label>
                <input
                  type="text"
                  value={addForm.titlePrefix}
                  onChange={e => setAddForm(p => ({ ...p, titlePrefix: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addEpisodes}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add {addForm.episodeCount} episodes to Season {addForm.season}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
