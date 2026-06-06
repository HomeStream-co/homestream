/**
 * MovieCollectionDownloadDialog
 *
 * Lets the user queue downloads for an entire movie franchise/collection.
 * The dialog shows:
 *   - The current movie (pre-checked, greyed out — already in library)
 *   - AI-suggested similar titles from enrichment.similarTitles
 *   - A free-text field to add extra titles manually
 *
 * Each selected title is sent to POST /api/stremio/download as a movie search.
 */

import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Film, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MediaItem } from '@/types/media';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: MediaItem;
  /** Titles already in the library — shown greyed out / pre-checked */
  libraryTitles: Set<string>;
}

export default function MovieCollectionDownloadDialog({ open, onOpenChange, item, libraryTitles }: Props) {
  const suggestedTitles: string[] = useMemo(
    () => item.enrichment?.similarTitles ?? [],
    [item.enrichment?.similarTitles],
  );

  // Selected set — keyed by title string
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestedTitles));
  const [customInput, setCustomInput] = useState('');
  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  const toggle = (title: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(title)) { next.delete(title); } else { next.add(title); }
      return next;
    });
  };

  const addCustom = () => {
    const t = customInput.trim();
    if (!t) return;
    if (!customTitles.includes(t) && !suggestedTitles.includes(t)) {
      setCustomTitles(prev => [...prev, t]);
      setSelected(prev => new Set([...prev, t]));
    }
    setCustomInput('');
  };

  const removeCustom = (t: string) => {
    setCustomTitles(prev => prev.filter(x => x !== t));
    setSelected(prev => { const next = new Set(prev); next.delete(t); return next; });
  };

  const allTitles = [...suggestedTitles, ...customTitles];
  const toDownload = allTitles.filter(t => selected.has(t) && !libraryTitles.has(t.toLowerCase()));

  const handleDownload = async () => {
    if (toDownload.length === 0) {
      toast.error('Select at least one title not already in your library');
      return;
    }
    setDownloading(true);
    try {
      const results = await Promise.allSettled(
        toDownload.map(async title => {
          const res = await fetch('/api/stremio/download', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imdbId: 'search',   // server falls back to title search
              type: 'movie',
              title,
              poster: '',
            }),
          });
          if (res.status === 503) throw new Error('No download backend');
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
            throw new Error(err.message ?? err.error ?? `Server error ${res.status}`);
          }
          return title;
        })
      );

      const ok = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (ok > 0) toast.success(`Queued ${ok} movie${ok !== 1 ? 's' : ''} for download`);
      if (failed > 0) {
        if (results.some(r => r.status === 'rejected' && (r as PromiseRejectedResult).reason?.message?.includes('No download backend'))) {
          toast.error('qBittorrent required — start it then try again');
        } else {
          toast.error(`${failed} title${failed !== 1 ? 's' : ''} failed to queue`);
        }
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Download Collection
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Queue related movies from the <span className="font-semibold text-foreground">{item.title}</span> series
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-4">

          {/* Current movie — always shown, greyed out */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/50">
            <Checkbox checked disabled className="opacity-50" />
            <Film className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground line-through">{item.title}</span>
            <span className="ml-auto text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">In library</span>
          </div>

          {/* Suggested titles */}
          {allTitles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">
                Related titles
              </p>
              {allTitles.map(title => {
                const inLib = libraryTitles.has(title.toLowerCase());
                const isChecked = selected.has(title);
                const isCustom = customTitles.includes(title);
                return (
                  <label
                    key={title}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      inLib
                        ? 'bg-muted/30 border-border/40 opacity-60 cursor-default'
                        : isChecked
                          ? 'bg-primary/10 border-primary/40'
                          : 'bg-card border-border hover:bg-muted'
                    }`}
                  >
                    <Checkbox
                      checked={inLib ? true : isChecked}
                      disabled={inLib}
                      onCheckedChange={() => { if (!inLib) toggle(title); }}
                      className={inLib ? 'opacity-50' : ''}
                    />
                    <Film className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className={`text-sm flex-1 ${inLib ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {title}
                    </span>
                    {inLib && (
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 flex-shrink-0">
                        In library
                      </span>
                    )}
                    {isCustom && !inLib && (
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); removeCustom(title); }}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                No AI-suggested related titles yet. Add titles manually below, or run AI enrichment on this movie first.
              </p>
            </div>
          )}

          {/* Add custom title */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">
              Add a title manually
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                placeholder="e.g. The Dark Knight Rises"
                className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustom}
                disabled={!customInput.trim()}
                className="px-3"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={downloading || toDownload.length === 0}
          >
            {downloading ? (
              <>
                <span className="w-4 h-4 mr-2 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin inline-block" />
                Queuing…
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {toDownload.length === 0
                  ? 'Select titles'
                  : `Download ${toDownload.length} Movie${toDownload.length !== 1 ? 's' : ''}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
