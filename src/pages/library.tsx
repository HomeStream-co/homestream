import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Film, Trash2, Edit2, Check, X, Star, AlertCircle,
  Upload, Clapperboard, Cpu, CheckCircle2, Clock, Zap, WifiOff, PenLine, Captions, Play,
  Search, SlidersHorizontal, RefreshCw, Wand2, MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VirtuosoGrid } from 'react-virtuoso';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import { useTheme } from '@/context/ThemeContext';
import type { MediaItem } from '@/types/media';
import { Skeleton } from '@/components/ui/skeleton';
import EnrichmentWizard from '@/components/EnrichmentWizard';
import EnrichmentRevealModal from '@/components/EnrichmentRevealModal';
import CaptionManager from '@/components/CaptionManager';
import TrailerButton from '@/components/TrailerButton';
import MediaContextMenu from '@/components/MediaContextMenu';
import ShowCard from '@/components/ShowCard';
import TrailerHover from '@/components/TrailerHover';
import type { MediaEnrichment } from '@/types/media';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Offline Metadata Notice ─────────────────────────────────────────────────

interface OfflineMetadataNoticeProps {
  mediaId: string;
  currentTitle: string;
  onSaved: (title: string) => void;
}

const RATING_OPTIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA', 'NR'];

function OfflineMetadataNotice({ mediaId, currentTitle, onSaved }: OfflineMetadataNoticeProps) {
  const [editing, setEditing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [title, setTitle] = useState(currentTitle);
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [plot, setPlot] = useState('');
  const [rated, setRated] = useState('NR');
  const [imdbRating, setImdbRating] = useState('');
  const [saving, setSaving] = useState(false);

  /** Try to pull OMDB data now that we may be back online */
  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/media/${mediaId}/fetch-metadata`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { success: boolean; item?: { title: string }; message?: string };
      if (data.success && data.item) {
        onSaved(data.item.title);
        toast.success(`Metadata fetched for "${data.item.title}"`);
      } else {
        toast.error(data.message || 'Still offline — try again when connected');
      }
    } catch { // non-fatal — network error, toast shown to user
      toast.error('Could not reach server');
    } finally {
      setRetrying(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim() || currentTitle,
        year: year.trim() || 'Unknown',
        genre: genre ? genre.split(',').map(g => g.trim()).filter(Boolean) : ['Unknown'],
        plot: plot.trim() || '',
        rated,
      };
      if (imdbRating.trim()) {
        const parsed = parseFloat(imdbRating);
        if (!isNaN(parsed)) body.imdbRating = parsed.toFixed(1);
      }
      await fetch(`/api/media/${mediaId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, needsMetadata: false }),
      });
      onSaved((body.title as string));
      setEditing(false);
    } catch { // non-fatal — network error, toast shown to user
      toast.error('Failed to save metadata');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <p className="text-xs text-yellow-500 flex-1">
            Uploaded offline — no movie info fetched automatically.
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1 text-xs bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
          >
            {retrying ? (
              <><span className="animate-spin inline-block w-3 h-3 border border-primary border-t-transparent rounded-full" /> Fetching…</>
            ) : (
              <><Zap className="w-3 h-3" /> Fetch from OMDB</>
            )}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded transition-colors"
          >
            <PenLine className="w-3 h-3" />
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
          <PenLine className="w-3 h-3" /> Add movie details manually
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          {retrying ? (
            <span className="animate-spin inline-block w-2.5 h-2.5 border border-primary border-t-transparent rounded-full" />
          ) : (
            <Zap className="w-2.5 h-2.5" />
          )}
          {retrying ? 'Fetching…' : 'Try OMDB instead'}
        </button>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />

      {/* Year + Rating */}
      <div className="flex gap-2">
        <input
          value={year}
          onChange={e => setYear(e.target.value)}
          placeholder="Year (e.g. 2023)"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        <select
          value={rated}
          onChange={e => setRated(e.target.value)}
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          {RATING_OPTIONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Genre + IMDb */}
      <div className="flex gap-2">
        <input
          value={genre}
          onChange={e => setGenre(e.target.value)}
          placeholder="Genres (e.g. Action, Drama)"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        <input
          value={imdbRating}
          onChange={e => setImdbRating(e.target.value)}
          placeholder="IMDb (e.g. 7.5)"
          className="w-28 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {/* Plot */}
      <textarea
        value={plot}
        onChange={e => setPlot(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
      />

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-primary hover:bg-primary/80 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── StorageSavingsBadge — shown below card title after a successful encode ───

function StorageSavingsBadge({ savedBytes, originalSize }: { savedBytes: number; originalSize: number }) {
  const savedMB = savedBytes / 1_048_576;
  const pct = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  // Format: "↓ 1.2 GB (43%)" or "↓ 340 MB (18%)"
  const label = savedMB >= 1024
    ? `↓ ${(savedMB / 1024).toFixed(1)} GB (${pct}%)`
    : `↓ ${Math.round(savedMB)} MB (${pct}%)`;

  return (
    <p className="text-[9px] text-emerald-500 font-medium mt-0.5 truncate" title={`Saved ${label} vs original`}>
      {label} saved
    </p>
  );
}

// ─── PosterImage — img with icon+title fallback (no external placeholder URLs) ──

function PosterImage({ poster, title }: { poster: string; title: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
        <Film className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground text-center line-clamp-3">{title}</p>
      </div>
    );
  }
  return (
    <img
      src={poster}
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type UploadPhase = 'uploading' | 'transcoding' | 'metadata' | 'done' | 'error';

interface TranscodeInfo {
  progress: number;
  fps?: number;
  speed?: string;
  eta?: number;
  status: string;
}

interface UploadingFile {
  id: string;           // local UI id
  transcodeId?: string; // server mediaId for SSE polling
  name: string;
  uploadProgress: number;
  phase: UploadPhase;
  transcode: TranscodeInfo;
  result?: MediaItem;
  error?: string;
  showEnrichment: boolean;   // show the wizard panel after transcode done
  enrichmentDone: boolean;   // wizard finished
  needsMetadata?: boolean;   // true = offline upload, user should fill in details
  offlineMode?: boolean;     // true = server had no internet during upload
  // Closed captions
  ccStatus?: 'fetching' | 'done' | 'failed' | 'offline';
  ccLangs?: { en?: string; es?: string };
}

interface EditState {
  id: string;
  title: string;
  year: string;
  genre: string;
  poster: string;
  plot: string;
  runtime: string;
  director: string;
  actors: string;
  imdbId: string;
  rated: string;
  imdbRating: string;
}

// ─── Phase label helpers ──────────────────────────────────────────────────────

function phaseLabel(u: UploadingFile): string {
  switch (u.phase) {
    case 'uploading':   return `Uploading… ${u.uploadProgress}%`;
    case 'transcoding': {
      const pct = u.transcode.progress;
      const eta = u.transcode.eta;
      const speed = u.transcode.speed;
      let label = `Transcoding… ${pct}%`;
      if (speed && speed !== '?x') label += ` · ${speed}`;
      if (eta && eta > 0) label += ` · ~${eta}s left`;
      return label;
    }
    case 'metadata':    return 'Fetching movie info…';
    case 'done':        return '✓ Ready to watch';
    case 'error':       return '✗ Error';
  }
}

function phaseColor(phase: UploadPhase): string {
  switch (phase) {
    case 'done':  return 'text-green-400';
    case 'error': return 'text-destructive';
    default:      return 'text-muted-foreground';
  }
}

function phaseIcon(phase: UploadPhase) {
  switch (phase) {
    case 'uploading':   return <Upload className="w-3.5 h-3.5" />;
    case 'transcoding': return <Cpu className="w-3.5 h-3.5 animate-pulse" />;
    case 'metadata':    return <Clapperboard className="w-3.5 h-3.5" />;
    case 'done':        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case 'error':       return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
  }
}

/** Combined 0-100 progress across all 3 phases */
function totalProgress(u: UploadingFile): number {
  switch (u.phase) {
    case 'uploading':   return Math.round(u.uploadProgress * 0.3);           // 0-30%
    case 'transcoding': return 30 + Math.round(u.transcode.progress * 0.6); // 30-90%
    case 'metadata':    return 92;
    case 'done':        return 100;
    case 'error':       return 0;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LibraryPage() {
  const navigate = useNavigate();
  const { library, loading, isDemoMode, refreshLibrary, deleteMedia, updateMedia } = useMedia();
  const { isAllowed } = useProfile();
  const { settings: appSettings } = useTheme();
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'series'>('all');
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  // Netflix-style reveal modal — pops up when AI enrichment finishes
  const [revealModal, setRevealModal] = useState<{
    item: MediaItem;
    enrichment: MediaEnrichment;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  // ── Bulk delete state ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkEnrichCurrentIndex, setBulkEnrichCurrentIndex] = useState(0);
  const [bulkEnrichTotal, setBulkEnrichTotal] = useState(0);
  const [bulkEnrichCurrentName, setBulkEnrichCurrentName] = useState('');

  // ── Search + Sort + Rescan ──
  const [searchParams] = useSearchParams();
  const [libSearch, setLibSearch] = useState(searchParams.get('search') || '');
  const [libSort, setLibSort] = useState<'added' | 'title' | 'rating' | 'year'>('added');
  const [rescanning, setRescanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    const s = searchParams.get('search');
    if (s !== null && s !== libSearch) setLibSearch(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleRescan() {
    setRescanning(true);
    try {
      const res = await fetch('/api/library/rescan', { method: 'POST', credentials: 'include' });
      const data = await res.json() as { success: boolean; added?: number; error?: string };
      if (data.success) {
        toast.success(`Library rescanned — ${data.added ?? 0} new items found`);
        refreshLibrary();
      } else {
        toast.error(`Rescan failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('Rescan request failed');
    } finally {
      setRescanning(false);
    }
  }

  async function handleOptimize() {
    setOptimizing(true);
    try {
      const res = await fetch('/api/library/optimize', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        toast.success('Optimization started in background. AI tagging and poster downloads will proceed automatically.');
      } else {
        toast.error('Failed to start optimization');
      }
    } catch (err) {
      toast.error('Optimization request failed');
    } finally {
      // The button can re-enable soon after starting, since it's a background process
      setTimeout(() => setOptimizing(false), 2000);
    }
  }

  const genId = () => Math.random().toString(36).slice(2);

  // ── On mount: reconnect SSE for any items still transcoding in the library ──
  // This handles the case where the user refreshes the page mid-transcode.
  useEffect(() => {
    if (loading) return;
    const stillTranscoding = library.filter(m => m.transcoding);
    if (stillTranscoding.length === 0) return;

    stillTranscoding.forEach(item => {
      // Only reconnect if we don't already have a card for this item
      setUploading(prev => {
        const alreadyTracked = prev.some(u => u.transcodeId === item.id);
        if (alreadyTracked) return prev;
        const uiId = genId();
        // Reconnect SSE after state update
        setTimeout(() => listenToTranscode(uiId, item.id), 0);
        return [...prev, {
          id: uiId,
          transcodeId: item.id,
          name: item.originalFilename || item.filename,
          uploadProgress: 100,
          phase: 'transcoding' as const,
          transcode: { progress: 0, status: 'transcoding' },
          result: item,
          showEnrichment: false,
          enrichmentDone: false,
          offlineMode: item.needsMetadata ?? false,
        }];
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Fetch CC subtitles for a media item ──
  const fetchCaptions = useCallback(async (uiId: string, mediaId: string, isOffline: boolean) => {
    if (isOffline) {
      setUploading(prev => prev.map(u =>
        u.id === uiId ? { ...u, ccStatus: 'offline' } : u
      ));
      return;
    }
    setUploading(prev => prev.map(u =>
      u.id === uiId ? { ...u, ccStatus: 'fetching' } : u
    ));
    try {
      const res = await fetch(`/api/captions/${mediaId}/fetch`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { success: boolean; langs?: Record<string, string> };
      setUploading(prev => prev.map(u =>
        u.id === uiId
          ? { ...u, ccStatus: data.success ? 'done' : 'failed', ccLangs: data.langs }
          : u
      ));
      if (data.success) {
        // Persist caption availability to the library item
        await fetch(`/api/media/${mediaId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captions: data.langs }),
        });
        refreshLibrary();
      }
    } catch { // non-fatal — caption upload failed, UI shows ccStatus:'failed'
      setUploading(prev => prev.map(u =>
        u.id === uiId ? { ...u, ccStatus: 'failed' } : u
      ));
    }
  }, [refreshLibrary]);

  // ── SSE listener for a transcode job ──
  const listenToTranscode = useCallback((uiId: string, transcodeId: string) => {
    // Close any existing SSE for this item
    sseRefs.current.get(uiId)?.close();

    const es = new EventSource(`/api/transcode/${transcodeId}`);
    sseRefs.current.set(uiId, es);

    es.onmessage = (e) => {
      try {
        const job = JSON.parse(e.data);

        if (job.status === 'done' || job.status === 'skipped') {
          setUploading(prev => prev.map(u =>
            u.id === uiId
              ? {
                  ...u,
                  phase: 'done',
                  transcode: { ...u.transcode, progress: 100, status: 'done' },
                  showEnrichment: true,   // reveal the enrichment wizard
                }
              : u
          ));
          es.close();
          sseRefs.current.delete(uiId);
          refreshLibrary();
          toast.success('Transcode complete — ready to watch!');
          // Kick off CC download in background (non-blocking)
          setUploading(prev => {
            const u = prev.find(f => f.id === uiId);
            if (u?.transcodeId) {
              fetchCaptions(uiId, u.transcodeId, u.offlineMode ?? false);
            }
            return prev;
          });
        } else if (job.status === 'error') {
          setUploading(prev => prev.map(u =>
            u.id === uiId
              ? { ...u, phase: 'error', error: job.error || 'Transcode failed' }
              : u
          ));
          es.close();
          sseRefs.current.delete(uiId);
          toast.error(`Transcode failed: ${job.error}`);
        } else if (job.status === 'transcoding') {
          setUploading(prev => prev.map(u =>
            u.id === uiId
              ? {
                  ...u,
                  phase: 'transcoding',
                  transcode: {
                    progress: job.progress ?? 0,
                    fps: job.fps,
                    speed: job.speed,
                    eta: job.eta,
                    status: 'transcoding',
                  },
                }
              : u
          ));
        }
      } catch { /* non-fatal — ignore parse errors */ }
    };

    es.onerror = () => {
      // SSE connection dropped — job may already be done, refresh library
      es.close();
      sseRefs.current.delete(uiId);
      refreshLibrary();
    };
  }, [refreshLibrary, fetchCaptions]);

  // Clean up SSE connections on unmount
  useEffect(() => {
    const refs = sseRefs.current;
    return () => {
      refs.forEach(es => es.close());
    };
  }, []);

  // ── Upload a single file ──
  const uploadFile = useCallback(async (file: File) => {
    const uiId = genId();
    setUploading(prev => [...prev, {
      id: uiId,
      name: file.name,
      uploadProgress: 0,
      phase: 'uploading',
      transcode: { progress: 0, status: 'queued' },
      showEnrichment: false,
      enrichmentDone: false,
    }]);

    const formData = new FormData();
    formData.append('video', file);

    try {
      // XHR for real upload progress
      const result = await new Promise<{ transcodeId: string } & MediaItem>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploading(prev => prev.map(u =>
              u.id === uiId ? { ...u, uploadProgress: pct } : u
            ));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error('Invalid server response')); }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || 'Upload failed'));
            } catch { // non-fatal — JSON parse failed, fall through to generic error
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });

      // Upload done — move to metadata phase briefly, then transcode
      const uploadResult = result as typeof result & { needsMetadata?: boolean; metadataAvailable?: boolean };
      setUploading(prev => prev.map(u =>
        u.id === uiId
          ? {
              ...u,
              phase: 'metadata',
              uploadProgress: 100,
              transcodeId: result.transcodeId,
              result,
              needsMetadata: uploadResult.needsMetadata ?? false,
              offlineMode: !(uploadResult.metadataAvailable ?? true),
            }
          : u
      ));

      // Start listening to transcode SSE
      listenToTranscode(uiId, result.transcodeId);

      // Refresh library so the card appears immediately (with transcoding badge)
      await refreshLibrary();

    } catch (err) {
      setUploading(prev => prev.map(u =>
        u.id === uiId ? { ...u, phase: 'error', error: String(err) } : u
      ));
      toast.error(`Failed to upload ${file.name}`);
    }
  }, [refreshLibrary, listenToTranscode]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const startEdit = (item: MediaItem) => {
    setEditState({
      id: item.id,
      title: item.title,
      year: item.year,
      genre: item.genre.join(', '),
      poster: item.poster,
      plot: item.plot,
      runtime: item.runtime || '',
      director: item.director || '',
      actors: Array.isArray(item.actors) ? item.actors.join(', ') : (item.actors || ''),
      imdbId: item.imdbId || '',
      rated: item.rated || 'NR',
      imdbRating: item.imdbRating || 'N/A',
    });
  };

  const saveEdit = async () => {
    if (!editState) return;
    await updateMedia(editState.id, {
      title: editState.title,
      year: editState.year,
      genre: editState.genre.split(',').map(g => g.trim()).filter(Boolean),
      poster: editState.poster,
      plot: editState.plot,
      runtime: editState.runtime,
      director: editState.director,
      actors: editState.actors,
      imdbId: editState.imdbId,
      rated: editState.rated,
      imdbRating: editState.imdbRating,
    });
    setEditState(null);
    toast.success('Updated successfully');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const item = library.find(m => m.id === deleteId);
    await deleteMedia(deleteId);
    setDeleteId(null);
    toast.success(`"${item?.title}" removed from library`);
  };

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        await deleteMedia(id);
        deleted++;
      } catch { /* non-fatal — individual delete failure, continue bulk loop */ }
    }
    setBulkDeleteConfirm(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    toast.success(`Removed ${deleted} item${deleted !== 1 ? 's' : ''} from library`);
  };

  const handleBulkEnrich = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    setBulkEnrichTotal(ids.length);
    setBulkEnrichCurrentIndex(0);
    setBulkEnriching(true);
    
    let enriched = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const item = library.find(m => m.id === id);
      setBulkEnrichCurrentName(item?.title || 'Unknown item');
      setBulkEnrichCurrentIndex(i + 1);
      
      try {
        const res = await fetch(`/api/enrich/${id}`, { method: 'POST', credentials: 'include' });
        if (res.ok) enriched++;
      } catch { /* non-fatal — individual enrich failure, continue bulk loop */ }
    }
    
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkEnriching(false);
    toast.success(`Enrichment complete for ${enriched} of ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
    refreshLibrary();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <title>My Library — HomeStream</title>

      {/* ── Cinematic page header ── */}
      <div className="relative pt-24 pb-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Subtle radial glow behind the heading */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/8 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-screen-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' as const }}
          >
            <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                <h1 className="text-4xl sm:text-5xl font-heading font-bold text-foreground tracking-tight">My Library</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOptimize}
                  disabled={optimizing}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 text-primary text-sm font-medium transition-all disabled:opacity-50"
                  title="Run AI enrichment on all items and download posters to local storage"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${optimizing ? 'animate-pulse' : ''}`} />
                  {optimizing ? 'Starting...' : 'Optimize & Enrich'}
                </button>
                <button
                  onClick={handleRescan}
                  disabled={rescanning}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground text-sm font-medium transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
                  {rescanning ? 'Scanning...' : 'Rescan Library'}
                </button>
              </div>
            </div>
            <p className="text-muted-foreground text-sm ml-4 pl-3 border-l border-border">
              Drop any video format — HomeStream auto-transcodes to browser-ready MP4 with zero-latency seeking.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Upload Zone — hidden in demo mode ── */}
        {isDemoMode ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' as const }}
            className="flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-5 py-3.5 mb-8"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Play className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Preview mode — demo library loaded</p>
              <p className="text-xs text-muted-foreground">Click any title to open the player. Drop real video files here to replace demo content.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp4,.mkv,.avi,.mov,.wmv,.m4v,.ts,.webm,.flv,.3gp,.ogv"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </motion.div>
        ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' as const }}
        >
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 mb-8 group ${
            dragging
              ? 'border-primary bg-primary/8 shadow-[0_0_40px_hsl(var(--primary)/0.15)]'
              : 'border-border hover:border-primary/50 hover:bg-card/60 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)]'
          }`}
        >
          {/* Animated corner accents */}
          <div className={`absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg transition-colors duration-300 ${dragging ? 'border-primary' : 'border-border group-hover:border-primary/50'}`} />
          <div className={`absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg transition-colors duration-300 ${dragging ? 'border-primary' : 'border-border group-hover:border-primary/50'}`} />
          <div className={`absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg transition-colors duration-300 ${dragging ? 'border-primary' : 'border-border group-hover:border-primary/50'}`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 rounded-br-lg transition-colors duration-300 ${dragging ? 'border-primary' : 'border-border group-hover:border-primary/50'}`} />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mkv,.avi,.mov,.wmv,.m4v,.ts,.webm,.flv,.3gp,.ogv"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <motion.div
            animate={dragging ? { scale: 1.1 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-colors duration-300 ${dragging ? 'bg-primary/20' : 'bg-muted group-hover:bg-primary/10'}`}>
              <Film className={`w-8 h-8 transition-colors duration-300 ${dragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
            </div>
          </motion.div>
          <p className="text-base font-semibold text-foreground mb-1">
            {dragging ? 'Release to upload' : 'Drop your video files here'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
          <div className="flex items-center justify-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="bg-muted/60 px-2.5 py-1 rounded-full">MP4 · MKV · AVI · MOV · WMV</span>
            <span className="bg-muted/60 px-2.5 py-1 rounded-full">M4V · TS · WebM · FLV · 3GP</span>
            <span className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
              <Zap className="w-3 h-3" /> Auto-transcoded to H.264 faststart
            </span>
          </div>
        </div>
        </motion.div>
        )}

        {/* ── Upload / Transcode Progress Cards ── */}
        <AnimatePresence>
          {uploading.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 flex flex-col gap-3"
            >
              {uploading.map(u => (
                <motion.div
                  key={u.id}
                  layout
                  className="bg-card border border-border rounded-2xl p-5 shadow-sm"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        u.phase === 'done' ? 'bg-green-500/15' :
                        u.phase === 'error' ? 'bg-destructive/15' :
                        'bg-primary/15'
                      }`}>
                        {phaseIcon(u.phase)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm text-foreground truncate font-semibold block">{u.name}</span>
                        <span className={`text-xs ${phaseColor(u.phase)}`}>{phaseLabel(u)}</span>
                      </div>
                    </div>
                    {u.phase === 'transcoding' && u.transcode.fps && (
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                        <span className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-full">
                          <Cpu className="w-3 h-3" /> {u.transcode.fps.toFixed(0)} fps
                        </span>
                        {u.transcode.speed && (
                          <span className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-full">
                            <Zap className="w-3 h-3" /> {u.transcode.speed}
                          </span>
                        )}
                        {u.transcode.eta && u.transcode.eta > 0 && (
                          <span className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-full">
                            <Clock className="w-3 h-3" /> ~{u.transcode.eta}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3-phase progress bar */}
                  {u.phase !== 'error' && (
                    <div className="space-y-2">
                      <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            u.phase === 'done' ? 'bg-green-500' : 'bg-primary'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${totalProgress(u)}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' as const }}
                        />
                      </div>
                      {/* Phase labels */}
                      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                        <span className={u.phase === 'uploading' ? 'text-primary font-semibold' : u.uploadProgress === 100 ? 'text-green-400' : ''}>
                          Upload
                        </span>
                        <span className={u.phase === 'transcoding' ? 'text-primary font-semibold' : u.phase === 'done' ? 'text-green-400' : ''}>
                          Transcode
                        </span>
                        <span className={u.phase === 'done' ? 'text-green-400 font-semibold' : ''}>
                          Ready
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {u.phase === 'error' && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1.5 bg-destructive/10 px-3 py-2 rounded-xl">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {u.error}
                    </p>
                  )}

                  {/* Done — show result card */}
                  {u.phase === 'done' && u.result && (
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                      {u.result.poster ? (
                        <img src={u.result.poster} alt={u.result.title} className="w-10 h-14 object-cover rounded-lg shadow-md" />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Film className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{u.result.title}</p>
                        <p className="text-xs text-muted-foreground">{u.result.year} · {(u.result.genre ?? []).slice(0, 2).join(', ')}</p>
                        {u.result.imdbRating !== 'N/A' && (
                          <p className="text-xs text-yellow-400 flex items-center gap-0.5 mt-0.5">
                            <Star className="w-3 h-3 fill-yellow-400" /> {u.result.imdbRating}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-xs text-green-400 flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> H.264 faststart
                        </span>
                        {u.ccStatus === 'fetching' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 animate-pulse">
                            <Captions className="w-3 h-3" /> Fetching CC…
                          </span>
                        )}
                        {u.ccStatus === 'done' && (
                          <span className="text-xs text-primary flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
                            <Captions className="w-3 h-3" />
                            CC {[
                              u.ccLangs?.en === 'downloaded' ? 'EN' : null,
                              u.ccLangs?.es === 'downloaded' ? 'ES' : null,
                            ].filter(Boolean).join(' · ') || 'saved'}
                          </span>
                        )}
                        {u.ccStatus === 'offline' && (
                          <span className="text-xs text-yellow-500 flex items-center gap-1">
                            <WifiOff className="w-3 h-3" /> CC offline
                          </span>
                        )}
                        {u.ccStatus === 'failed' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Captions className="w-3 h-3" /> No CC found
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Offline notice */}
                  {u.offlineMode && u.phase === 'done' && (
                    <OfflineMetadataNotice
                      mediaId={u.transcodeId!}
                      currentTitle={u.result?.title || u.name}
                      onSaved={(title) => {
                        setUploading(prev => prev.map(f =>
                          f.id === u.id
                            ? { ...f, offlineMode: false, result: f.result ? { ...f.result, title } : f.result }
                            : f
                        ));
                        refreshLibrary();
                        toast.success('Metadata saved!');
                      }}
                    />
                  )}

                  {/* AI Enrichment Wizard */}
                  {u.showEnrichment && u.transcodeId && u.result && !u.offlineMode && (
                    <div className="mt-3">
                      <EnrichmentWizard
                        mediaId={u.transcodeId}
                        title={u.result.title}
                        onComplete={(enrichment) => {
                          setUploading(prev => prev.map(f =>
                            f.id === u.id ? { ...f, enrichmentDone: true } : f
                          ));
                          refreshLibrary();
                          if (u.result) {
                            setRevealModal({ item: u.result, enrichment });
                          }
                        }}
                        onError={() => {
                          setUploading(prev => prev.map(f =>
                            f.id === u.id ? { ...f, enrichmentDone: true } : f
                          ));
                          toast.error(`Enrichment failed for "${u.result?.title}" — using basic genre matching`);
                        }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search + Sort bar ── */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={libSearch}
              onChange={e => setLibSearch(e.target.value)}
              placeholder="Search library..."
              className="w-full glass rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {libSearch && (
              <button onClick={() => setLibSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={libSort}
              onChange={e => setLibSort(e.target.value as typeof libSort)}
              className="glass rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
            >
              <option value="added">Date Added</option>
              <option value="title">Title A–Z</option>
              <option value="rating">Top Rated</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>

        {/* ── Library Grid header ── */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {/* All / Movies / Shows tabs */}
            <div className="flex items-center gap-1 bg-muted/60 rounded-2xl p-1.5 border border-border/40">
              {(['all', 'movie', 'series'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tab === 'all'
                    ? `All (${library.filter(m => isAllowed(m.rated)).length})`
                    : tab === 'movie'
                    ? `Movies (${library.filter(m => isAllowed(m.rated) && m.type !== 'series').length})`
                    : `Shows (${new Set(library.filter(m => isAllowed(m.rated) && m.type === 'series').map(m => m.title.trim().toLowerCase())).size})`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <span className="text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set(library.map(m => m.id)))}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={handleBulkEnrich}
                      disabled={bulkEnriching}
                      className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {bulkEnriching ? 'Enriching…' : `Enrich ${selectedIds.size}`}
                    </button>
                    <button
                      onClick={() => setBulkDeleteConfirm(true)}
                      className="flex items-center gap-1.5 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete {selectedIds.size}
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </>
            ) : (
              library.length > 0 && (
                <button
                  onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-xl transition-colors hover:bg-muted/40"
                >
                  <Check className="w-3.5 h-3.5" /> Select
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] rounded-xl" />
                <Skeleton className="h-3 mt-2 rounded w-3/4" />
                <Skeleton className="h-2.5 mt-1 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : library.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24"
          >
            <div className="w-20 h-20 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
              <Film className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <p className="text-foreground font-medium mb-1">Your library is empty</p>
            <p className="text-muted-foreground text-sm">Upload your first video file above to get started.</p>
          </motion.div>
        ) : (
          (() => {
            // Filter items by profile + active tab + search
            const filtered = library
              .filter(m =>
                isAllowed(m.rated) &&
                (activeTab === 'all' || (activeTab === 'series' ? m.type === 'series' : m.type !== 'series')) &&
                (!libSearch ||
                  m.title.toLowerCase().includes(libSearch.toLowerCase()) ||
                  ((m as any).codec && (m as any).codec.toLowerCase().includes(libSearch.toLowerCase())) ||
                  (m.genre ?? []).some(g => g.toLowerCase().includes(libSearch.toLowerCase())) ||
                  (m.director && m.director.toLowerCase().includes(libSearch.toLowerCase())) ||
                  (m.actors && (Array.isArray(m.actors) ? m.actors.join(', ') : m.actors).toLowerCase().includes(libSearch.toLowerCase()))
                )
              )
              .sort((a, b) => {
                if (libSort === 'title') return a.title.localeCompare(b.title);
                if (libSort === 'rating') return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0);
                if (libSort === 'year') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
                // 'added' (default) - sorted by date added desc (newest first)
                return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
              });

            // Group series by title — all episodes of the same show share one card
            const showGroups = new Map<string, MediaItem[]>();
            const movieItems: MediaItem[] = [];

            for (const item of filtered) {
              if (item.type === 'series') {
                const key = item.title.trim().toLowerCase();
                if (!showGroups.has(key)) showGroups.set(key, []);
                showGroups.get(key)!.push(item);
              } else {
                movieItems.push(item);
              }
            }

            // Build a flat render list: movies stay as-is, shows become one entry per group
            type RenderEntry =
              | { kind: 'movie'; item: MediaItem; idx: number }
              | { kind: 'show'; items: MediaItem[]; idx: number };

            const entries: RenderEntry[] = [];
            let idx = 0;

            // Shows first (or interleaved — keep original order by first occurrence)
            const seen = new Set<string>();
            for (const item of filtered) {
              if (item.type === 'series') {
                const key = item.title.trim().toLowerCase();
                if (!seen.has(key)) {
                  seen.add(key);
                  entries.push({ kind: 'show', items: showGroups.get(key)!, idx: idx++ });
                }
              } else {
                entries.push({ kind: 'movie', item, idx: idx++ });
              }
            }

            return (
              <VirtuosoGrid
                useWindowScroll
                data={entries}
                listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-12"
                itemContent={(index, entry) => {
                  if (entry.kind === 'show') {
                    return (
                      <ShowCard
                        key={entry.items[0].id}
                        items={entry.items}
                        selectMode={selectMode}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onDelete={setDeleteId}
                        onEdit={startEdit}
                        animDelay={0}
                      />
                    );
                  }

                  const item = entry.item as MediaItem & { transcoding?: boolean; transcodeWarning?: string; transcodeError?: string };
                  const isSelected = selectedIds.has(item.id);
                  const cardContent = (
                    <MediaContextMenu item={item} disabled={selectMode}>
                      transition={{ duration: 0.3, delay: 0, ease: 'easeOut' as const }}
                      className={`group relative ${selectMode ? 'cursor-pointer' : ''} h-full flex flex-col`}
                      onClick={selectMode ? () => toggleSelect(item.id) : undefined}
                    >
                      <div className={`aspect-[2/3] rounded-xl overflow-hidden bg-card relative transition-all duration-200 ${
                        selectMode && selectedIds.has(item.id)
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                          : 'group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] group-hover:-translate-y-0.5'
                      }`}>
                        {/* Poster */}
                        {item.poster ? (
                          <PosterImage poster={item.poster} title={item.title} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
                            <Film className="w-8 h-8 text-muted-foreground/30 flex-shrink-0" />
                            <p className="text-[10px] text-muted-foreground text-center line-clamp-3 leading-snug">{item.title}</p>
                          </div>
                        )}

                        {/* Select mode checkbox */}
                        {selectMode && (
                          <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            selectedIds.has(item.id)
                              ? 'bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]'
                              : 'bg-black/50 border-white/60'
                          }`}>
                            {selectedIds.has(item.id) && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        )}

                        {/* Transcoding overlay */}
                        {item.transcoding && (
                          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                              <Cpu className="w-5 h-5 text-primary animate-pulse" />
                            </div>
                            <span className="text-white text-[10px] font-semibold">Transcoding…</span>
                          </div>
                        )}

                        {/* Transcode error overlay */}
                        {item.transcodeError && !item.transcoding && (
                          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-3">
                            <div className="w-9 h-9 rounded-full bg-destructive/20 border border-destructive/50 flex items-center justify-center">
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            </div>
                            <p className="text-white text-[10px] font-semibold text-center leading-tight">Transcode Failed</p>
                            <p className="text-white/50 text-[9px] text-center leading-tight line-clamp-3">{item.transcodeError}</p>
                          </div>
                        )}



                        {/* Error delete button */}
                        {item.transcodeError && !item.transcoding && (
                          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setDeleteId(item.id)}
                              className="p-1.5 bg-destructive/80 hover:bg-destructive rounded-full transition-colors"
                              title="Remove and re-upload"
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        )}
                      </button>

                      <div className="mt-2 px-0.5 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold text-foreground truncate leading-snug pt-0.5">{item.title}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-0.5 hover:bg-white/10 rounded-full text-muted-foreground hover:text-foreground transition-colors outline-none" onClick={e => e.stopPropagation()}>
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-black/90 border-border/40 backdrop-blur-md">
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/player/${item.id}`); }}>
                                <Play className="w-4 h-4 mr-2" /> Play
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); startEdit(item); }}>
                                <Edit2 className="w-4 h-4 mr-2" /> Edit Metadata
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); setDeleteId(item.id); }} className="text-destructive focus:text-destructive focus:bg-destructive/20">
                                <Trash2 className="w-4 h-4 mr-2" /> Remove from Library
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-muted-foreground">{item.year}</p>
                          {item.imdbRating !== 'N/A' && !item.transcodeError && (
                            <p className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-yellow-400" /> {item.imdbRating}
                            </p>
                          )}
                          {item.transcodeError && (
                            <p className="text-[9px] text-destructive font-medium">Re-upload to fix</p>
                          )}
                        </div>
                        {/* Storage savings badge */}
                        {appSettings.showStorageBadges && !item.transcodeError && !item.transcoding && (item as MediaItem & { savedBytes?: number }).savedBytes != null && (item as MediaItem & { savedBytes?: number }).savedBytes! > 1_048_576 && (
                          <StorageSavingsBadge
                            savedBytes={(item as MediaItem & { savedBytes?: number }).savedBytes!}
                            originalSize={(item as MediaItem & { originalSize?: number }).originalSize ?? 0}
                          />
                        )}
                        {/* Enrichment tag pills */}
                        {appSettings.showEnrichmentTags && (item.enrichment?.mood?.length || item.enrichment?.tags?.length) ? (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {item.enrichment?.mood?.slice(0, 1).map((m: string) => (
                              <span key={m} className="text-[9px] px-1 py-0.5 rounded-full bg-primary/15 text-primary font-medium leading-none truncate max-w-[64px]">
                                {m}
                              </span>
                            ))}
                            {item.enrichment?.tags?.slice(0, 1).map((t: string) => (
                              <span key={t} className="text-[9px] px-1 py-0.5 rounded-full bg-muted text-muted-foreground font-medium leading-none truncate max-w-[64px]">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {/* CC manager */}
                        {!item.transcoding && !item.transcodeError && (
                          <CaptionManager
                            mediaId={item.id}
                            title={item.title}
                            captions={item.captions}
                            onUpdated={refreshLibrary}
                          />
                        )}
                        {item.transcodeWarning && !item.transcodeError && (
                          <p className="text-[9px] text-yellow-500 mt-0.5 truncate" title={item.transcodeWarning}>
                            ⚠ {item.transcodeWarning}
                          </p>
                        )}
                      </div>
                    </motion.div>
                    </MediaContextMenu>
                  );

                  return selectMode ? (
                    <div key={item.id} className="h-full flex flex-col">{cardContent}</div>
                  ) : (
                    <div key={item.id} className="h-full flex flex-col">
                      <TrailerHover item={item}>
                        {cardContent}
                      </TrailerHover>
                    </div>
                  );
                }}
              />
            );
          })()
        )}
      </div>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Remove from library?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete the file and remove it from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-foreground border-border hover:bg-secondary/70">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/80 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Confirmation ── */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} and remove them from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-foreground border-border hover:bg-secondary/70">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive hover:bg-destructive/80 text-white"
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Modal ── */}
      <AnimatePresence>
        {editState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setEditState(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-heading text-foreground">Edit Metadata</h3>
                <button onClick={() => setEditState(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-3 max-h-[65vh] overflow-y-auto pr-1">
                {/* Title */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                  <input
                    type="text"
                    value={editState.title}
                    onChange={e => setEditState(prev => prev ? { ...prev, title: e.target.value } : null)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 2-column: Year & Runtime */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Year</label>
                    <input
                      type="text"
                      value={editState.year}
                      onChange={e => setEditState(prev => prev ? { ...prev, year: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Runtime (e.g. 120 min)</label>
                    <input
                      type="text"
                      value={editState.runtime}
                      onChange={e => setEditState(prev => prev ? { ...prev, runtime: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* 2-column: Content Rating & IMDb Rating */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Content Rating</label>
                    <select
                      value={editState.rated}
                      onChange={e => setEditState(prev => prev ? { ...prev, rated: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                      {RATING_OPTIONS.map(r => (
                        <option key={r} value={r} className="bg-card text-foreground">{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">IMDb Rating</label>
                    <input
                      type="text"
                      value={editState.imdbRating}
                      onChange={e => setEditState(prev => prev ? { ...prev, imdbRating: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* 2-column: IMDb ID & Genres */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">IMDb ID</label>
                    <input
                      type="text"
                      value={editState.imdbId}
                      onChange={e => setEditState(prev => prev ? { ...prev, imdbId: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Genres (comma separated)</label>
                    <input
                      type="text"
                      value={editState.genre}
                      onChange={e => setEditState(prev => prev ? { ...prev, genre: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Director */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Director</label>
                  <input
                    type="text"
                    value={editState.director}
                    onChange={e => setEditState(prev => prev ? { ...prev, director: e.target.value } : null)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Actors */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Actors</label>
                  <input
                    type="text"
                    value={editState.actors}
                    onChange={e => setEditState(prev => prev ? { ...prev, actors: e.target.value } : null)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Poster URL */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Poster URL</label>
                  <input
                    type="text"
                    value={editState.poster}
                    onChange={e => setEditState(prev => prev ? { ...prev, poster: e.target.value } : null)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Plot */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Plot</label>
                  <textarea
                    value={editState.plot}
                    onChange={e => setEditState(prev => prev ? { ...prev, plot: e.target.value } : null)}
                    rows={3}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveEdit}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 text-white py-2 rounded-xl font-medium text-sm transition-colors"
                >
                  <Check className="w-4 h-4" /> Save Changes
                </button>
                <button
                  onClick={() => setEditState(null)}
                  className="px-4 bg-secondary hover:bg-secondary/70 text-foreground py-2 rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
 
      {/* ── Bulk Enrichment Progress Modal ── */}
      <AnimatePresence>
        {bulkEnriching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-bounce">
                <Cpu className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">AI Metadata Enrichment</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Enriching item <span className="text-foreground font-semibold">{bulkEnrichCurrentIndex}</span> of <span className="text-foreground font-semibold">{bulkEnrichTotal}</span>
              </p>
              
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(bulkEnrichCurrentIndex / bulkEnrichTotal) * 100}%` }}
                />
              </div>
              
              <p className="text-xs font-medium text-foreground truncate px-2">
                {bulkEnrichCurrentName}
              </p>
              <p className="text-[10px] text-muted-foreground mt-2 animate-pulse">
                Fetching genres, tags, and summary...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Netflix-style Enrichment Reveal Modal ── */}
      <AnimatePresence>
        {revealModal && (
          <EnrichmentRevealModal
            item={revealModal.item}
            enrichment={revealModal.enrichment}
            onClose={() => setRevealModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
