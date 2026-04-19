/**
 * Watch History — /history
 *
 * Shows all items the user has watched, sorted by most recently watched.
 * Each row shows: poster, title, type, last watched date, progress bar.
 * Users can remove individual items or clear all history.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Trash2, X, Play, CheckCircle2, Film, Tv, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HistoryItem {
  id: string;
  title: string;
  type: string;
  poster?: string;
  watchProgress: number;
  watchedSeconds: number;
  totalSeconds: number;
  lastWatchedAt?: string;
  watchedAt?: string;
  genre: string[];
  imdbRating?: string;
  year?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json() as HistoryItem[];
      setItems(data);
    } catch {
      toast.error('Failed to load watch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const removeItem = async (id: string) => {
    setRemovingId(id);
    try {
      await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('Removed from history');
    } catch {
      toast.error('Failed to remove item');
    } finally {
      setRemovingId(null);
    }
  };

  const clearAll = async () => {
    try {
      await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setItems([]);
      toast.success('Watch history cleared');
    } catch {
      toast.error('Failed to clear history');
    } finally {
      setClearAllOpen(false);
    }
  };

  // Group by date label
  const grouped = items.reduce<Record<string, HistoryItem[]>>((acc, item) => {
    const label = formatDate(item.lastWatchedAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
      <title>Watch History — HomeStream</title>

      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading text-foreground">Watch History</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? 'Loading…' : `${items.length} title${items.length !== 1 ? 's' : ''} watched`}
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => setClearAllOpen(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive border border-border hover:border-destructive/40 px-3 py-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear all
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <Clock className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-heading text-foreground mb-2">No watch history yet</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Start watching something and it'll appear here.
            </p>
            <Link
              to="/"
              className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Browse Library
            </Link>
          </motion.div>
        )}

        {/* Grouped list */}
        {!loading && Object.entries(grouped).map(([dateLabel, groupItems]) => (
          <div key={dateLabel} className="mb-8">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
              {dateLabel}
            </h2>
            <div className="space-y-2">
              <AnimatePresence>
                {groupItems.map(item => {
                  const isComplete = !!item.watchedAt || item.watchProgress === 0 && !!item.lastWatchedAt;
                  const detailPath = item.type === 'show' ? `/show/${item.id}` : `/movie/${item.id}`;

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-4 bg-card border border-border rounded-xl p-3 group hover:border-border/80 transition-colors"
                    >
                      {/* Poster */}
                      <Link to={detailPath} className="flex-shrink-0">
                        <div className="w-12 h-16 rounded-lg overflow-hidden bg-muted relative">
                          {item.poster ? (
                            <img
                              src={item.poster}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {item.type === 'show'
                                ? <Tv className="w-5 h-5 text-muted-foreground/40" />
                                : <Film className="w-5 h-5 text-muted-foreground/40" />
                              }
                            </div>
                          )}
                        </div>
                      </Link>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <Link to={detailPath} className="hover:text-primary transition-colors">
                          <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground capitalize">{item.type}</span>
                          {item.year && <span className="text-[11px] text-muted-foreground">{item.year}</span>}
                          {item.imdbRating && item.imdbRating !== 'N/A' && (
                            <span className="text-[11px] text-yellow-400">★ {item.imdbRating}</span>
                          )}
                          {item.totalSeconds > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              {formatDuration(item.totalSeconds)}
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        {!isComplete && item.watchProgress > 0 && (
                          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden w-full max-w-[200px]">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(item.watchProgress, 100)}%` }}
                            />
                          </div>
                        )}
                        {isComplete && (
                          <div className="flex items-center gap-1 mt-1">
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                            <span className="text-[11px] text-green-400">Watched</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          to={`/player/${item.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center"
                          title="Play"
                        >
                          <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                        </Link>
                        <button
                          onClick={() => removeItem(item.id)}
                          disabled={removingId === item.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground"
                          title="Remove from history"
                        >
                          {removingId === item.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* Clear all confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Clear all watch history?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This removes all watch history and progress data. Your library files are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-foreground border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearAll} className="bg-destructive hover:bg-destructive/80 text-white">
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
