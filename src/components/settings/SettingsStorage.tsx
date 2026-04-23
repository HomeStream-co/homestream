import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Database, HardDrive, ScanLine, AlertTriangle,
  Loader2, CheckCircle2, Film, Tv2, Layers,
} from 'lucide-react';
import { SectionHeader, fmtBytes } from './shared';

interface StorageStats {
  libraryBytes: number;
  libraryCount: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
}

interface SettingsStorageProps {
  /** Passed down from the orchestrator so the panel can share the already-loaded stats */
  storageStats: StorageStats | null;
  storageLoading: boolean;
  onScanComplete: () => void; // tells orchestrator to re-fetch stats
}

export default function SettingsStorage({
  storageStats, storageLoading, onScanComplete,
}: SettingsStorageProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ added: number; skipped: number } | null>(null);

  const [allocMovies, setAllocMovies] = useState(() =>
    (storageStats as unknown as { storageAllocation?: { moviesPct: number } } | null)
      ?.storageAllocation?.moviesPct ?? 60,
  );
  const [allocTv, setAllocTv] = useState(() =>
    (storageStats as unknown as { storageAllocation?: { tvPct: number } } | null)
      ?.storageAllocation?.tvPct ?? 30,
  );
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocSaved, setAllocSaved] = useState(false);
  const allocOther = Math.max(0, 100 - allocMovies - allocTv);

  const handleScanLibrary = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/library/scan', { method: 'POST' });
      const data = await res.json() as { added: number; skipped: number; errors?: string[] };
      setScanResult({ added: data.added, skipped: data.skipped });
      if (data.added > 0) {
        toast.success(`Found ${data.added} new file${data.added !== 1 ? 's' : ''} — added to library`);
        onScanComplete();
      } else {
        toast.info('Library is up to date — no new files found');
      }
    } catch {
      toast.error('Scan failed — check server logs');
    } finally {
      setScanning(false);
    }
  }, [onScanComplete]);

  const saveAllocation = useCallback(async () => {
    setAllocSaving(true);
    setAllocSaved(false);
    try {
      const res = await fetch('/api/library/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moviesPct: allocMovies, tvPct: allocTv }),
      });
      if (!res.ok) throw new Error('Save failed');
      setAllocSaved(true);
      setTimeout(() => setAllocSaved(false), 3000);
      toast.success('Storage allocation saved');
    } catch {
      toast.error('Failed to save allocation');
    } finally {
      setAllocSaving(false);
    }
  }, [allocMovies, allocTv]);

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Database} label="Storage & Library" />
      <div className="px-4 pb-4 space-y-3">

        {/* Disk stats */}
        {storageLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading storage info…
          </div>
        ) : storageStats ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="w-3 h-3" /> Library ({storageStats.libraryCount} items)
              </span>
              <span className="text-foreground font-medium">{fmtBytes(storageStats.libraryBytes)}</span>
            </div>
            {storageStats.diskTotalBytes && storageStats.diskFreeBytes !== null && (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Disk free</span>
                  <span className={`font-medium ${
                    storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 ? 'text-destructive' :
                    storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.2 ? 'text-orange-400' : 'text-foreground'
                  }`}>
                    {fmtBytes(storageStats.diskFreeBytes)} / {fmtBytes(storageStats.diskTotalBytes)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 ? 'bg-destructive' :
                      storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.2 ? 'bg-orange-400' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.round(((storageStats.diskTotalBytes - storageStats.diskFreeBytes) / storageStats.diskTotalBytes) * 100)}%` }}
                  />
                </div>
                {storageStats.diskFreeBytes / storageStats.diskTotalBytes < 0.1 && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-destructive leading-snug">
                      Disk is nearly full. Downloads and transcoding may fail. Free up space soon.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Storage info unavailable</p>
        )}

        {/* Scan button */}
        <div className="space-y-1.5">
          <button
            onClick={handleScanLibrary}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <ScanLine className={`w-3.5 h-3.5 ${scanning ? 'animate-pulse' : ''}`} />
            {scanning ? 'Scanning media folder…' : 'Scan Library for New Files'}
          </button>
          {scanResult && (
            <p className="text-[10px] text-center text-muted-foreground">
              {scanResult.added > 0
                ? `✓ Added ${scanResult.added} new file${scanResult.added !== 1 ? 's' : ''} · ${scanResult.skipped} already in library`
                : `✓ Up to date · ${scanResult.skipped} file${scanResult.skipped !== 1 ? 's' : ''} already in library`}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground text-center">Finds video files in your media folder not yet in the library</p>
        </div>

        {/* Allocation sliders */}
        <div className="border-t border-border/40 pt-3 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Storage Allocation Targets</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Set how much of your disk you want reserved for each content type. These are soft targets — HomeStream uses them to warn you when a category is over-allocated.
          </p>

          {/* Movies */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5">
                <Film className="w-3 h-3 text-blue-400" /> Movies
              </span>
              <span className="font-mono font-semibold text-foreground">{allocMovies}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={allocMovies}
              onChange={e => {
                const v = Number(e.target.value);
                setAllocMovies(v);
                if (v + allocTv > 100) setAllocTv(100 - v);
              }}
              className="w-full accent-blue-400 cursor-pointer"
            />
          </div>

          {/* TV */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5">
                <Tv2 className="w-3 h-3 text-purple-400" /> TV Shows
              </span>
              <span className="font-mono font-semibold text-foreground">{allocTv}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={allocTv}
              onChange={e => {
                const v = Number(e.target.value);
                setAllocTv(v);
                if (allocMovies + v > 100) setAllocMovies(100 - v);
              }}
              className="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          {/* Other (read-only) */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Other (remainder)
            </span>
            <span className="font-mono text-muted-foreground">{allocOther}%</span>
          </div>

          {/* Visual bar */}
          <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
            <div className="bg-blue-400 rounded-l-full transition-all" style={{ width: `${allocMovies}%` }} />
            <div className="bg-purple-400 transition-all" style={{ width: `${allocTv}%` }} />
            <div className="bg-muted flex-1 rounded-r-full" />
          </div>

          <button
            onClick={saveAllocation}
            disabled={allocSaving}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              allocSaved
                ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
            } disabled:opacity-60`}
          >
            {allocSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             allocSaved  ? <CheckCircle2 className="w-3.5 h-3.5" /> :
             <HardDrive className="w-3.5 h-3.5" />}
            {allocSaving ? 'Saving…' : allocSaved ? 'Saved!' : 'Save Allocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
