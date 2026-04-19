import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Film, Trash2, Edit2, Check, X, Star, AlertCircle,
  Upload, Clapperboard, Cpu, CheckCircle2, Clock, Zap, WifiOff, PenLine, Captions,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useTheme } from '@/context/ThemeContext';
import type { MediaItem } from '@/types/media';
import { Skeleton } from '@/components/ui/skeleton';
import EnrichmentWizard from '@/components/EnrichmentWizard';
import EnrichmentRevealModal from '@/components/EnrichmentRevealModal';
import CaptionManager from '@/components/CaptionManager';
import type { MediaEnrichment } from '@/types/media';
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
      const res = await fetch(`/api/media/${mediaId}/fetch-metadata`, { method: 'POST' });
      const data = await res.json() as { success: boolean; item?: { title: string }; message?: string };
      if (data.success && data.item) {
        onSaved(data.item.title);
        toast.success(`Metadata fetched for "${data.item.title}"`);
      } else {
        toast.error(data.message || 'Still offline — try again when connected');
      }
    } catch {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, needsMetadata: false }),
      });
      onSaved((body.title as string));
      setEditing(false);
    } catch {
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
  const { library, loading, refreshLibrary, deleteMedia, updateMedia } = useMedia();
  const { settings: appSettings } = useTheme();
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
      const res = await fetch(`/api/captions/${mediaId}/fetch`, { method: 'POST' });
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captions: data.langs }),
        });
        refreshLibrary();
      }
    } catch {
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
      } catch { /* ignore parse errors */ }
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
    return () => {
      sseRefs.current.forEach(es => es.close());
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
            } catch {
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
    });
  };

  const saveEdit = async () => {
    if (!editState) return;
    await updateMedia(editState.id, {
      title: editState.title,
      year: editState.year,
      genre: editState.genre.split(',').map(g => g.trim()),
      poster: editState.poster,
      plot: editState.plot,
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

  return (
    <div className="min-h-screen bg-background pt-20 pb-16">
      <title>My Library — HomeStream</title>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        <h1 className="text-4xl font-heading text-foreground mb-1">My Library</h1>
        <p className="text-muted-foreground mb-8">
          Drop any video format — HomeStream auto-transcodes to browser-ready MP4 with zero-latency seeking.
        </p>

        {/* ── Upload Zone ── */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-8 ${
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50 hover:bg-card/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mkv,.avi,.mov,.wmv,.m4v,.ts,.webm,.flv,.3gp,.ogv"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <Film className={`w-12 h-12 mx-auto mb-4 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          <p className="text-lg font-medium text-foreground mb-1">Drop your video files here</p>
          <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>MP4 · MKV · AVI · MOV · WMV · M4V · TS · WebM · FLV · 3GP</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-primary" /> Auto-transcoded to H.264 faststart</span>
          </div>
        </div>

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
                  className="bg-card border border-border rounded-xl p-4"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Film className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground truncate font-medium">{u.name}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs flex-shrink-0 ml-2 ${phaseColor(u.phase)}`}>
                      {phaseIcon(u.phase)}
                      <span>{phaseLabel(u)}</span>
                    </div>
                  </div>

                  {/* 3-phase progress bar */}
                  {u.phase !== 'error' && (
                    <div className="space-y-1.5">
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
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
                        <span className={u.phase === 'uploading' ? 'text-primary' : u.uploadProgress === 100 ? 'text-green-400' : ''}>
                          Upload
                        </span>
                        <span className={u.phase === 'transcoding' ? 'text-primary' : u.phase === 'done' ? 'text-green-400' : ''}>
                          Transcode
                        </span>
                        <span className={u.phase === 'done' ? 'text-green-400' : ''}>
                          Ready
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Transcode stats row */}
                  {u.phase === 'transcoding' && u.transcode.fps && (
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> {u.transcode.fps.toFixed(0)} fps
                      </span>
                      {u.transcode.speed && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" /> {u.transcode.speed}
                        </span>
                      )}
                      {u.transcode.eta && u.transcode.eta > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> ~{u.transcode.eta}s remaining
                        </span>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {u.phase === 'error' && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {u.error}
                    </p>
                  )}

                  {/* Done — show result card */}
                  {u.phase === 'done' && u.result && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                      {u.result.poster ? (
                        <img src={u.result.poster} alt={u.result.title} className="w-10 h-14 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                          <Film className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.result.title}</p>
                        <p className="text-xs text-muted-foreground">{u.result.year} · {u.result.genre.slice(0, 2).join(', ')}</p>
                        {u.result.imdbRating !== 'N/A' && (
                          <p className="text-xs text-accent flex items-center gap-0.5 mt-0.5">
                            <Star className="w-3 h-3 fill-accent" /> {u.result.imdbRating}
                          </p>
                        )}
                      </div>
                      <div className="ml-auto flex flex-col items-end gap-1.5">
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> H.264 faststart
                        </span>
                        {/* CC download status */}
                        {u.ccStatus === 'fetching' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 animate-pulse">
                            <Captions className="w-3.5 h-3.5" /> Fetching CC…
                          </span>
                        )}
                        {u.ccStatus === 'done' && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Captions className="w-3.5 h-3.5" />
                            CC {[
                              u.ccLangs?.en === 'downloaded' ? 'EN' : null,
                              u.ccLangs?.es === 'downloaded' ? 'ES' : null,
                            ].filter(Boolean).join(' · ') || 'saved'}
                          </span>
                        )}
                        {u.ccStatus === 'offline' && (
                          <span className="text-xs text-yellow-500 flex items-center gap-1">
                            <WifiOff className="w-3 h-3" /> CC offline — retry later
                          </span>
                        )}
                        {u.ccStatus === 'failed' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Captions className="w-3.5 h-3.5" /> No CC found
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Offline notice — shown when OMDB was unreachable */}
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

                  {/* AI Enrichment Wizard — appears after transcode completes (skipped in offline mode) */}
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
                          // Pop the Netflix-style reveal modal
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

        {/* ── Library Grid ── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading text-foreground">
            {library.length} Title{library.length !== 1 ? 's' : ''}
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] rounded-lg" />
                <Skeleton className="h-3 mt-2 rounded" />
              </div>
            ))}
          </div>
        ) : library.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No media yet. Upload your first file above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {library.map((item: MediaItem & { transcoding?: boolean; transcodeWarning?: string; transcodeError?: string }) => (
              <div key={item.id} className="group relative">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card relative">
                  {/* Poster — with proper icon fallback (no external placeholder URLs) */}
                  {item.poster ? (
                    <PosterImage poster={item.poster} title={item.title} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-card p-2">
                      <Film className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-[10px] text-muted-foreground text-center line-clamp-3">{item.title}</p>
                    </div>
                  )}

                  {/* Transcoding overlay */}
                  {item.transcoding && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                      <Cpu className="w-6 h-6 text-primary animate-pulse" />
                      <span className="text-white text-[10px] font-medium">Transcoding…</span>
                    </div>
                  )}

                  {/* Transcode error overlay — Option B: stays in grid, red badge, still playable */}
                  {item.transcodeError && !item.transcoding && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 p-3">
                      <div className="w-8 h-8 rounded-full bg-destructive/20 border border-destructive/50 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      </div>
                      <p className="text-white text-[10px] font-semibold text-center leading-tight">Transcode Failed</p>
                      <p className="text-white/50 text-[9px] text-center leading-tight line-clamp-3">{item.transcodeError}</p>
                    </div>
                  )}

                  {/* Actions overlay — shown when not transcoding/errored */}
                  {!item.transcoding && !item.transcodeError && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-2 bg-destructive/80 hover:bg-destructive rounded-full transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}

                  {/* Error state — show delete button so user can remove and re-upload */}
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
                </div>

                <div className="mt-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">{item.year}</p>
                    {item.imdbRating !== 'N/A' && !item.transcodeError && (
                      <p className="text-[10px] text-accent flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-accent" /> {item.imdbRating}
                      </p>
                    )}
                    {item.transcodeError && (
                      <p className="text-[9px] text-destructive font-medium">Re-upload to fix</p>
                    )}
                  </div>
                  {/* Storage savings badge — shown when encode saved meaningful space */}
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
                        <span key={m} className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-medium leading-none truncate max-w-[64px]">
                          {m}
                        </span>
                      ))}
                      {item.enrichment?.tags?.slice(0, 2).map((t: string) => (
                        <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none truncate max-w-[64px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {/* CC manager — re-fetch + upload UI */}
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
              </div>
            ))}
          </div>
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
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-heading text-foreground">Edit Metadata</h3>
                <button onClick={() => setEditState(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Title', key: 'title' as const },
                  { label: 'Year', key: 'year' as const },
                  { label: 'Genre (comma separated)', key: 'genre' as const },
                  { label: 'Poster URL', key: 'poster' as const },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                    <input
                      type="text"
                      value={editState[field.key]}
                      onChange={e => setEditState(prev => prev ? { ...prev, [field.key]: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Plot</label>
                  <textarea
                    value={editState.plot}
                    onChange={e => setEditState(prev => prev ? { ...prev, plot: e.target.value } : null)}
                    rows={3}
                    className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveEdit}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 text-white py-2 rounded font-medium text-sm transition-colors"
                >
                  <Check className="w-4 h-4" /> Save Changes
                </button>
                <button
                  onClick={() => setEditState(null)}
                  className="px-4 bg-secondary hover:bg-secondary/70 text-foreground py-2 rounded text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
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
