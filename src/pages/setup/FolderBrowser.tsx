/**
 * FolderBrowser — inline directory picker for the setup wizard.
 *
 * Two modes:
 *  1. Electron: calls POST /api/setup/open-dialog → native OS folder picker
 *  2. Web / non-Electron: GET /api/setup/browse-folder → tree browser panel
 *
 * The tree browser works on both Linux and Windows paths.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FolderOpen, ChevronRight, ChevronUp, Loader2,
  HardDrive, X, Check, Monitor,
} from 'lucide-react';

interface BrowseResult {
  current: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

interface Props {
  /** Current value of the path input — used as the starting directory */
  initialPath: string;
  /** Called when the user confirms a selection */
  onSelect: (path: string) => void;
  /** Called when the user dismisses the browser */
  onClose: () => void;
  /** Whether the server is running inside Electron */
  isElectron: boolean;
}

export default function FolderBrowser({ initialPath, onSelect, onClose, isElectron }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(initialPath);
  const [electronChecked, setElectronChecked] = useState(false);

  // ── Electron native dialog ────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) { setElectronChecked(true); return; }

    // Try the native dialog first
    fetch('/api/setup/open-dialog', { method: 'POST' })
      .then(r => r.json())
      .then((d: { supported: boolean; canceled?: boolean; path?: string }) => {
        if (d.supported && !d.canceled && d.path) {
          onSelect(d.path);
          return;
        }
        // Not supported or canceled — fall through to tree browser
        setElectronChecked(true);
      })
      .catch(() => setElectronChecked(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tree browser ──────────────────────────────────────────────────────────
  const browse = useCallback((p: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/setup/browse-folder?path=${encodeURIComponent(p)}`)
      .then(r => r.json())
      .then((d: BrowseResult & { error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d);
        setSelected(d.current);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!isElectron || electronChecked) {
      browse(initialPath || '/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electronChecked]);

  // Still waiting for Electron dialog response
  if (isElectron && !electronChecked) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
        <Monitor className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-sm">Opening system folder picker…</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground underline mt-1">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 rounded-xl border border-border bg-background overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <HardDrive className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="flex-1 text-xs font-mono text-muted-foreground truncate min-w-0">
          {data?.current ?? '…'}
        </span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Up button */}
      {data?.parent && (
        <button
          onClick={() => browse(data.parent!)}
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors border-b border-border/50"
        >
          <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-mono truncate">..</span>
        </button>
      )}

      {/* Directory list */}
      <div className="max-h-56 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive px-3 py-4 text-center">{error}</p>
        )}
        {!loading && !error && data?.dirs.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">No subdirectories found</p>
        )}
        {!loading && !error && data?.dirs.map(dir => (
          <button
            key={dir.path}
            onClick={() => browse(dir.path)}
            onDoubleClick={() => { setSelected(dir.path); onSelect(dir.path); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left group ${
              selected === dir.path
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/40'
            }`}
          >
            {selected === dir.path
              ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              : <Folder className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />}
            <span className="flex-1 font-mono truncate">{dir.name}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>

      {/* Footer — confirm current path */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/20">
        <span className="flex-1 text-[11px] font-mono text-muted-foreground truncate min-w-0">
          {selected || data?.current || '—'}
        </span>
        <button
          onClick={() => onSelect(selected || data?.current || '')}
          disabled={!selected && !data?.current}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <Check className="w-3 h-3" /> Select
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center pb-2 px-3">
        Click a folder to navigate · double-click or press Select to choose it
      </p>
    </div>
  );
}
