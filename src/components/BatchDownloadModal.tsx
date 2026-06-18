import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface BatchDownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imdbId: string;
  title: string;
  season: number;
}

interface StreamPreview {
  episode: number;
  sizeBytes: number;
  quality: string;
  source: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function BatchDownloadModal({ open, onOpenChange, imdbId, title, season }: BatchDownloadModalProps) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previews, setPreviews] = useState<StreamPreview[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetchPreviews();
    } else {
      setPreviews([]);
      setTotalBytes(0);
      setError('');
    }
  }, [open, imdbId, season]);

  const fetchPreviews = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stremio/season-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imdbId, title, season }),
      });
      if (!res.ok) throw new Error('Failed to fetch season data');
      const data = await res.json();
      setPreviews(data.previews || []);
      setTotalBytes(data.totalBytes || 0);
    } catch (err) {
      console.error(err);
      setError('Could not calculate sizes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId,
          type: 'series',
          title,
          season,
          totalSeasons: season, // just required by backend
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to queue download');
      }
      toast.success(`Successfully queued Season ${season} for download!`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading tracking-wide flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            Download Season {season}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground animate-pulse">Scanning torrent indexers for Season {season}...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-destructive">
              <AlertCircle className="w-10 h-10 mb-4 opacity-80" />
              <p className="text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchPreviews}>Retry Scan</Button>
            </div>
          ) : previews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No episodes found for Season {season}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Data Required</p>
                  <p className="text-3xl font-bold text-foreground">{formatBytes(totalBytes)}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                  {previews.length} Episodes Included
                </p>
                {previews.map((p) => (
                  <div key={p.episode} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-foreground w-6">E{p.episode}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/50">
                        {p.quality}
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">{formatBytes(p.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between border-t border-border/40 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            disabled={loading || downloading || previews.length === 0} 
            onClick={handleDownload}
            className="gap-2 font-bold shadow-lg shadow-primary/20"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {downloading ? 'Queueing...' : `Download All (${formatBytes(totalBytes)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
