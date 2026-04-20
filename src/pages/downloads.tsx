/**
 * Downloads page — live view of all active and completed torrent downloads.
 *
 * Shows:
 *   - qBittorrent queue (preferred backend) with live speed, progress, ETA, seeds
 *   - WebTorrent fallback jobs
 *   - Global transfer stats bar (total DL/UL speed, session totals)
 *   - Per-torrent controls: pause, resume, remove, remove + delete files
 *   - Backend status badge (qBit online/offline)
 *
 * Polls /api/stremio/downloads every 2 seconds.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Wifi, WifiOff, Trash2, Pause, Play,
  CheckCircle2, AlertCircle, Clock, Loader2,
  Film, Tv2, ArrowDown, ArrowUp, Zap, HardDrive,
  RefreshCw, X, ChevronDown, ChevronUp, Activity,
  Settings2, Save, BarChart3, Layers,
  Bell, BellOff, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import VPNPanel from '@/components/VPNPanel';
import { Link } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QbitTorrent {
  hash: string;
  name: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  poster: string;
  imdbId: string;
  size: number;
  progress: number;       // 0–100
  dlspeed: number;        // bytes/s
  upspeed: number;        // bytes/s
  seeds: number;
  peers: number;
  eta: number;            // seconds
  state: string;
  savePath: string;
  status: 'queued' | 'downloading' | 'done' | 'paused' | 'error' | 'seeding' | 'stalled';
  addedOn: number;
  completionOn: number;
  ratio: number;
  backend: 'qbittorrent';
}

interface WtJob {
  jobId: string;
  mediaId: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: 'queued' | 'downloading' | 'transcoding' | 'done' | 'error';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  eta: number;
  error?: string;
  addedAt: string;
  completedAt?: string;
  infoHash: string;
  imdbId: string;
  poster?: string;
}

interface TransferInfo {
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
  connection_status: string;
}

interface DownloadsResponse {
  jobs: WtJob[];
  qbitTorrents: QbitTorrent[];
  transferInfo: TransferInfo | null;
  backend: 'qbittorrent' | 'webtorrent';
  qbitOnline: boolean;
  error?: string;
}

interface StorageStats {
  libraryBytes: number;
  libraryCount: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  mediaDir: string | null;
  categoryBytes: { movies: number; tv: number; other: number };
  storageAllocation: { moviesPct: number; tvPct: number; otherPct: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

function fmtEta(seconds: number): string {
  if (!seconds || seconds <= 0 || seconds === 8640000) return '∞';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtDate(ts: number): string {
  if (!ts || ts <= 0) return '';
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG = {
  queued:      { color: 'text-yellow-400',  bg: 'bg-yellow-400/10', label: 'Queued',      icon: Clock },
  downloading: { color: 'text-blue-400',    bg: 'bg-blue-400/10',   label: 'Downloading', icon: Download },
  transcoding: { color: 'text-purple-400',  bg: 'bg-purple-400/10', label: 'Processing',  icon: Zap },
  done:        { color: 'text-green-400',   bg: 'bg-green-400/10',  label: 'Complete',    icon: CheckCircle2 },
  seeding:     { color: 'text-cyan-400',    bg: 'bg-cyan-400/10',   label: 'Seeding',     icon: ArrowUp },
  paused:      { color: 'text-muted-foreground', bg: 'bg-muted/30', label: 'Paused',      icon: Pause },
  stalled:     { color: 'text-orange-400',  bg: 'bg-orange-400/10', label: 'Stalled',     icon: AlertCircle },
  error:       { color: 'text-red-400',     bg: 'bg-red-400/10',    label: 'Error',       icon: AlertCircle },
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const color =
    status === 'error' ? 'bg-red-500' :
    status === 'done' || status === 'seeding' ? 'bg-green-500' :
    status === 'paused' ? 'bg-muted-foreground' :
    status === 'stalled' ? 'bg-orange-500' :
    'bg-primary';

  return (
    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

// ─── qBittorrent torrent row ──────────────────────────────────────────────────

function QbitRow({ torrent, onDelete, onPause, onResume }: {
  torrent: QbitTorrent;
  onDelete: (hash: string, deleteFiles: boolean) => void;
  onPause: (hash: string) => void;
  onResume: (hash: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | null>(null);

  const isActive = torrent.status === 'downloading' || torrent.status === 'queued' || torrent.status === 'stalled';
  const isDone = torrent.status === 'done' || torrent.status === 'seeding';
  const isPaused = torrent.status === 'paused';
  const canPause = isActive;
  const canResume = isPaused;

  const handlePause = async () => {
    setActionLoading('pause');
    await onPause(torrent.hash);
    setActionLoading(null);
  };

  const handleResume = async () => {
    setActionLoading('resume');
    await onResume(torrent.hash);
    setActionLoading(null);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        {/* Poster */}
        <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted">
          {torrent.poster ? (
            <img src={torrent.poster} alt={torrent.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {torrent.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate max-w-[280px]">{torrent.title}</p>
            <StatusBadge status={torrent.status} />
            {torrent.quality && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{torrent.quality}</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 mb-1">
            <ProgressBar progress={torrent.progress} status={torrent.status} />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">{torrent.progress}%</span>
            <span>{fmtBytes(torrent.size * torrent.progress / 100)} / {fmtBytes(torrent.size)}</span>
            {isActive && (
              <>
                <span className="flex items-center gap-0.5 text-blue-400">
                  <ArrowDown className="w-2.5 h-2.5" />{fmtSpeed(torrent.dlspeed)}
                </span>
                <span className="flex items-center gap-0.5 text-green-400">
                  <ArrowUp className="w-2.5 h-2.5" />{fmtSpeed(torrent.upspeed)}
                </span>
                <span>👥 {torrent.seeds} seeds</span>
                <span>⏱ {fmtEta(torrent.eta)}</span>
              </>
            )}
            {isDone && torrent.completionOn > 0 && (
              <span className="text-green-400">Completed {fmtDate(torrent.completionOn)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Pause / Resume */}
          {canPause && (
            <button
              onClick={handlePause}
              disabled={actionLoading === 'pause'}
              className="p-1.5 rounded-lg hover:bg-yellow-500/10 transition-colors text-muted-foreground hover:text-yellow-400 disabled:opacity-50"
              title="Pause download"
            >
              {actionLoading === 'pause'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Pause className="w-3.5 h-3.5" />
              }
            </button>
          )}
          {canResume && (
            <button
              onClick={handleResume}
              disabled={actionLoading === 'resume'}
              className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors text-muted-foreground hover:text-green-400 disabled:opacity-50"
              title="Resume download"
            >
              {actionLoading === 'resume'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />
              }
            </button>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Details"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">
              <span className="text-[10px] text-red-400 font-semibold">Delete files?</span>
              <button onClick={() => onDelete(torrent.hash, false)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground">Keep</button>
              <button onClick={() => onDelete(torrent.hash, true)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-border/40 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                {[
                  { label: 'Hash', value: torrent.hash.slice(0, 12) + '…' },
                  { label: 'State', value: torrent.state },
                  { label: 'Ratio', value: torrent.ratio?.toFixed(2) ?? '—' },
                  { label: 'Save path', value: torrent.savePath ?? '—' },
                  { label: 'Added', value: fmtDate(torrent.addedOn) },
                  { label: 'Seeds', value: String(torrent.seeds) },
                  { label: 'Peers', value: String(torrent.peers) },
                  { label: 'Upload', value: fmtSpeed(torrent.upspeed) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-wide">{label}</p>
                    <p className="text-foreground font-mono truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── WebTorrent job row ───────────────────────────────────────────────────────

function WtRow({ job }: { job: WtJob }) {
  const isActive = job.status === 'downloading' || job.status === 'queued' || job.status === 'transcoding';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-card border border-border rounded-xl p-3"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted">
          {job.poster ? (
            <img src={job.poster} alt={job.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {job.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate max-w-[280px]">{job.title}</p>
            <StatusBadge status={job.status as keyof typeof STATUS_CONFIG} />
            {job.quality && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{job.quality}</span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-semibold">WebTorrent</span>
          </div>

          <div className="mt-1.5 mb-1">
            <ProgressBar progress={job.progress} status={job.status} />
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">{job.progress}%</span>
            {isActive && (
              <>
                <span className="flex items-center gap-0.5 text-blue-400">
                  <ArrowDown className="w-2.5 h-2.5" />{fmtSpeed(job.downloadSpeed)}
                </span>
                <span>👥 {job.peers} peers</span>
                <span>⏱ {fmtEta(job.eta)}</span>
              </>
            )}
            {job.status === 'done' && job.completedAt && (
              <span className="text-green-400">Completed {new Date(job.completedAt).toLocaleString()}</span>
            )}
            {job.error && <span className="text-red-400">{job.error}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DownloadsPage() {
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'error'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Subscriptions state
  interface Subscription {
    imdbId: string;
    title: string;
    poster?: string;
    schedule: string;
    enabled: boolean;
    lastCheckedAt?: string;
    nextCheckAt?: string;
  }
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (!res.ok) return;
      const json = await res.json() as { subscriptions: Subscription[] };
      setSubscriptions(json.subscriptions ?? []);
    } catch { /* silent */ }
  }, []);

  const handleUnsubscribe = async (imdbId: string) => {
    await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbId, action: 'unsubscribe' }),
    });
    setSubscriptions(s => s.filter(x => x.imdbId !== imdbId));
    toast.success('Unsubscribed');
  };

  const handleToggle = async (imdbId: string) => {
    await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbId, action: 'toggle' }),
    });
    fetchSubscriptions();
  };

  const handleCheckNow = async (imdbId: string, title: string) => {
    setCheckingId(imdbId);
    try {
      await fetch(`/api/subscriptions/${imdbId}/check`, { method: 'POST' });
      toast.success(`Checked "${title}" — see downloads for new episodes`);
      fetchSubscriptions();
    } catch {
      toast.error('Check failed');
    } finally {
      setCheckingId(null);
    }
  };

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  // Storage state
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [moviesPct, setMoviesPct] = useState(60);
  const [tvPct, setTvPct] = useState(30);
  const [savingAlloc, setSavingAlloc] = useState(false);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch('/api/library/storage');
      if (!res.ok) return;
      const json = await res.json() as StorageStats;
      setStorage(json);
      setMoviesPct(json.storageAllocation.moviesPct);
      setTvPct(json.storageAllocation.tvPct);
    } catch { /* silent */ }
  }, []);

  const saveAllocation = async () => {
    if (moviesPct + tvPct > 100) {
      toast.error('Movies % + TV % cannot exceed 100%');
      return;
    }
    setSavingAlloc(true);
    try {
      const res = await fetch('/api/library/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moviesPct, tvPct }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Storage allocation saved');
      await fetchStorage();
      setShowStorageSettings(false);
    } catch (err) {
      toast.error(`Failed to save: ${String(err)}`);
    } finally {
      setSavingAlloc(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/stremio/downloads');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as DownloadsResponse;
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[downloads] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchStorage();
    const interval = setInterval(fetchData, 2000);
    const storageInterval = setInterval(fetchStorage, 15000);
    return () => { clearInterval(interval); clearInterval(storageInterval); };
  }, [fetchData, fetchStorage]);

  const handleDelete = useCallback(async (hash: string, deleteFiles: boolean) => {
    try {
      const res = await fetch(`/api/stremio/downloads/${hash}?deleteFiles=${deleteFiles}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(deleteFiles ? 'Torrent and files removed' : 'Torrent removed from queue');
      fetchData();
    } catch (err) {
      toast.error(`Failed to remove torrent: ${String(err)}`);
    }
  }, [fetchData]);

  const handlePause = useCallback(async (hash: string) => {
    try {
      const res = await fetch('/api/stremio/downloads/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Download paused');
      // Optimistic: refresh immediately so the UI reflects the new state
      setTimeout(fetchData, 600);
    } catch (err) {
      toast.error(`Failed to pause: ${String(err)}`);
    }
  }, [fetchData]);

  const handleResume = useCallback(async (hash: string) => {
    try {
      const res = await fetch('/api/stremio/downloads/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Download resumed');
      setTimeout(fetchData, 600);
    } catch (err) {
      toast.error(`Failed to resume: ${String(err)}`);
    }
  }, [fetchData]);

  // ── Filter logic ──
  const qbitAll = data?.qbitTorrents ?? [];
  const wtAll = data?.jobs ?? [];

  const filteredQbit = qbitAll.filter(t => {
    if (filter === 'active') return t.status === 'downloading' || t.status === 'queued' || t.status === 'stalled';
    if (filter === 'done') return t.status === 'done' || t.status === 'seeding';
    if (filter === 'error') return t.status === 'error' || t.status === 'paused';
    return true;
  });

  const filteredWt = wtAll.filter(j => {
    if (filter === 'active') return j.status === 'downloading' || j.status === 'queued' || j.status === 'transcoding';
    if (filter === 'done') return j.status === 'done';
    if (filter === 'error') return j.status === 'error';
    return true;
  });

  const totalActive = qbitAll.filter(t => t.status === 'downloading').length
    + wtAll.filter(j => j.status === 'downloading').length;
  const totalDone = qbitAll.filter(t => t.status === 'done' || t.status === 'seeding').length
    + wtAll.filter(j => j.status === 'done').length;
  const totalError = qbitAll.filter(t => t.status === 'error').length
    + wtAll.filter(j => j.status === 'error').length;
  const totalAll = qbitAll.length + wtAll.length;

  const tf = data?.transferInfo;

  return (
    <>
      <title>Downloads — HomeStream</title>
      <meta name="description" content="Live torrent download queue — track progress, speed, and manage all active downloads." />

      <div className="min-h-screen bg-background pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
                <Download className="w-6 h-6 text-primary" />
                Downloads
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {totalActive > 0
                  ? `${totalActive} active download${totalActive !== 1 ? 's' : ''}`
                  : totalAll === 0 ? 'No downloads yet — use Stremio to start downloading'
                  : `${totalAll} total download${totalAll !== 1 ? 's' : ''}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Backend badge */}
              {data && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  data.qbitOnline
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-muted border-border text-muted-foreground'
                }`}>
                  {data.qbitOnline
                    ? <><Wifi className="w-3 h-3" />qBittorrent</>
                    : <><WifiOff className="w-3 h-3" />WebTorrent</>
                  }
                </div>
              )}

              {/* Refresh indicator */}
              <button
                onClick={fetchData}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── VPN Panel ── */}
          <div className="mb-6">
            <VPNPanel />
          </div>

          {/* ── Disk Usage Bar ── */}
          {storage && storage.diskTotalBytes && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-card border border-border rounded-2xl p-4"
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Storage</span>
                  {storage.mediaDir && (
                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full font-mono truncate max-w-[180px]">
                      {storage.mediaDir}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowStorageSettings(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Organise
                  {showStorageSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Main disk bar */}
              {(() => {
                const total = storage.diskTotalBytes!;
                const free  = storage.diskFreeBytes ?? 0;
                const used  = total - free;
                const usedPct = Math.min(100, (used / total) * 100);
                const freePct = 100 - usedPct;

                // Color thresholds
                const barColor =
                  usedPct >= 90 ? 'bg-red-500' :
                  usedPct >= 75 ? 'bg-orange-500' :
                  usedPct >= 60 ? 'bg-yellow-500' :
                  'bg-green-500';

                const textColor =
                  usedPct >= 90 ? 'text-red-400' :
                  usedPct >= 75 ? 'text-orange-400' :
                  usedPct >= 60 ? 'text-yellow-400' :
                  'text-green-400';

                const label =
                  usedPct >= 90 ? '⚠ Critical — disk nearly full' :
                  usedPct >= 75 ? 'Running low on space' :
                  usedPct >= 60 ? 'Moderate usage' :
                  'Plenty of space available';

                return (
                  <div>
                    {/* Bar */}
                    <div className="relative w-full h-5 bg-muted/50 rounded-full overflow-hidden mb-2">
                      <motion.div
                        className={`h-full rounded-full ${barColor} transition-colors duration-700`}
                        initial={{ width: 0 }}
                        animate={{ width: `${usedPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                      {/* Library portion overlay */}
                      <motion.div
                        className="absolute top-0 left-0 h-full bg-primary/40 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(usedPct, (storage.libraryBytes / total) * 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                      />
                      {/* Percentage label inside bar */}
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90 mix-blend-plus-lighter">
                        {usedPct.toFixed(1)}% used
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{fmtBytes(used)}</span> used
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className={`font-semibold ${textColor}`}>{fmtBytes(free)} free</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{fmtBytes(total)} total</span>
                      </div>
                      <span className={`text-[10px] font-medium ${textColor}`}>{label}</span>
                    </div>

                    {/* Library breakdown mini-bars */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Movies', bytes: storage.categoryBytes.movies, color: 'bg-blue-500', icon: Film },
                        { label: 'TV Shows', bytes: storage.categoryBytes.tv, color: 'bg-purple-500', icon: Tv2 },
                        { label: 'Other', bytes: storage.categoryBytes.other, color: 'bg-muted-foreground', icon: Layers },
                      ].map(({ label: lbl, bytes, color, icon: Icon }) => {
                        const pct = total > 0 ? Math.min(100, (bytes / total) * 100) : 0;
                        return (
                          <div key={lbl} className="bg-muted/30 rounded-xl p-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Icon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{lbl}</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden mb-1">
                              <motion.div
                                className={`h-full rounded-full ${color}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                              />
                            </div>
                            <p className="text-[11px] font-bold text-foreground">{fmtBytes(bytes)}</p>
                            <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}% of disk</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Allocation warning */}
                    {freePct < 10 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400"
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Less than 10% disk space remaining. Consider removing completed downloads or expanding storage.</span>
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              {/* ── Storage Allocation Settings (collapsible) ── */}
              <AnimatePresence>
                {showStorageSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Storage Organisation</p>
                        <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                          Set target % of disk per category
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                        These targets are informational — HomeStream uses them to warn you when a category is approaching its limit. Files are not automatically moved or deleted.
                      </p>

                      <div className="flex flex-col gap-4">
                        {/* Movies slider */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Film className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-xs font-semibold text-foreground">Movies</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0} max={100}
                                value={moviesPct}
                                onChange={e => setMoviesPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                                className="w-14 text-center text-xs font-bold bg-muted border border-border rounded-lg px-2 py-1 text-foreground"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          <input
                            type="range" min={0} max={100} value={moviesPct}
                            onChange={e => setMoviesPct(Number(e.target.value))}
                            className="w-full accent-blue-500 h-2 rounded-full"
                          />
                          {storage?.diskTotalBytes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Target: {fmtBytes((storage.diskTotalBytes * moviesPct) / 100)} · Currently using {fmtBytes(storage.categoryBytes.movies)}
                            </p>
                          )}
                        </div>

                        {/* TV slider */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Tv2 className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-xs font-semibold text-foreground">TV Shows</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0} max={100}
                                value={tvPct}
                                onChange={e => setTvPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                                className="w-14 text-center text-xs font-bold bg-muted border border-border rounded-lg px-2 py-1 text-foreground"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          <input
                            type="range" min={0} max={100} value={tvPct}
                            onChange={e => setTvPct(Number(e.target.value))}
                            className="w-full accent-purple-500 h-2 rounded-full"
                          />
                          {storage?.diskTotalBytes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Target: {fmtBytes((storage.diskTotalBytes * tvPct) / 100)} · Currently using {fmtBytes(storage.categoryBytes.tv)}
                            </p>
                          )}
                        </div>

                        {/* Other (implied) */}
                        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl">
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Other / Unallocated</span>
                          </div>
                          <span className={`text-xs font-bold ${moviesPct + tvPct > 100 ? 'text-red-400' : 'text-foreground'}`}>
                            {Math.max(0, 100 - moviesPct - tvPct)}%
                          </span>
                        </div>

                        {moviesPct + tvPct > 100 && (
                          <p className="text-xs text-red-400 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Total exceeds 100% — reduce Movies or TV allocation
                          </p>
                        )}

                        <button
                          onClick={saveAllocation}
                          disabled={savingAlloc || moviesPct + tvPct > 100}
                          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {savingAlloc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Allocation
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── Global transfer stats bar ── */}
          <AnimatePresence>
            {tf && data?.qbitOnline && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
              >
                {[
                  { label: 'Download Speed', value: fmtSpeed(tf.dl_info_speed), icon: ArrowDown, color: 'text-blue-400' },
                  { label: 'Upload Speed',   value: fmtSpeed(tf.up_info_speed), icon: ArrowUp,   color: 'text-green-400' },
                  { label: 'Downloaded',     value: fmtBytes(tf.dl_info_data),  icon: HardDrive,  color: 'text-primary' },
                  { label: 'Uploaded',       value: fmtBytes(tf.up_info_data),  icon: Activity,   color: 'text-cyan-400' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className={`text-sm font-bold ${color}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Download Stats Summary ── */}
          {totalAll > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Downloads', value: String(totalAll),    icon: Download,    color: 'text-primary',    bg: 'bg-primary/10' },
                { label: 'Active',          value: String(totalActive), icon: Activity,    color: 'text-blue-400',   bg: 'bg-blue-400/10' },
                { label: 'Completed',       value: String(totalDone),   icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10' },
                { label: 'Issues',          value: String(totalError),  icon: AlertCircle,
                  color: totalError > 0 ? 'text-red-400' : 'text-muted-foreground',
                  bg:    totalError > 0 ? 'bg-red-400/10' : 'bg-muted/30' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <motion.div key={label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Filter tabs ── */}
          <div className="flex items-center gap-1 mb-4 bg-muted/30 rounded-xl p-1 w-fit">
            {([
              { key: 'all',    label: `All (${totalAll})` },
              { key: 'active', label: `Active (${totalActive})` },
              { key: 'done',   label: `Done (${totalDone})` },
              { key: 'error',  label: `Issues (${totalError})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Connecting to download queue…</p>
            </div>
          ) : totalAll === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 gap-4 text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Download className="w-10 h-10 text-primary/60" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">No downloads yet</h2>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  Click the purple Stremio button in the top-right corner to search for movies and TV shows, then hit Download to start.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-4 py-2.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Downloads route automatically through qBittorrent when available, with WebTorrent as fallback.
              </div>
            </motion.div>
          ) : filteredQbit.length === 0 && filteredWt.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No downloads match this filter.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* qBittorrent section */}
              {filteredQbit.length > 0 && (
                <div>
                  {data?.qbitOnline && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Wifi className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">qBittorrent Queue</span>
                      <span className="text-xs text-muted-foreground">({filteredQbit.length})</span>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {filteredQbit.map(t => (
                      <QbitRow key={t.hash} torrent={t} onDelete={handleDelete} onPause={handlePause} onResume={handleResume} />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* WebTorrent section */}
              {filteredWt.length > 0 && (
                <div className={filteredQbit.length > 0 ? 'mt-2' : ''}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WebTorrent Queue</span>
                    <span className="text-xs text-muted-foreground">({filteredWt.length})</span>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {filteredWt.map(j => (
                      <WtRow key={j.jobId} job={j} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* ── Subscriptions ── */}
          {subscriptions.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Auto-Download Subscriptions
                </h2>
                <span className="text-xs text-muted-foreground">({subscriptions.length})</span>
              </div>
              <div className="space-y-2">
                {subscriptions.map(sub => (
                  <motion.div
                    key={sub.imdbId}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
                  >
                    {sub.poster && (
                      <img
                        src={sub.poster}
                        alt={sub.title}
                        className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{sub.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {sub.schedule === 'daily' ? 'Daily'
                            : sub.schedule === 'every3days' ? 'Every 3 days'
                            : sub.schedule === 'weekly' ? 'Weekly'
                            : 'Every 2 weeks'}
                        </span>
                        {sub.nextCheckAt && sub.enabled && (
                          <span className="text-xs text-muted-foreground">
                            Next: {new Date(sub.nextCheckAt).toLocaleDateString()}
                          </span>
                        )}
                        {!sub.enabled && (
                          <span className="text-xs text-muted-foreground italic">Paused</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Check now */}
                      <button
                        onClick={() => handleCheckNow(sub.imdbId, sub.title)}
                        disabled={checkingId === sub.imdbId}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        title="Check for new episodes now"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${checkingId === sub.imdbId ? 'animate-spin' : ''}`} />
                      </button>
                      {/* Pause / resume */}
                      <button
                        onClick={() => handleToggle(sub.imdbId)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={sub.enabled ? 'Pause subscription' : 'Resume subscription'}
                      >
                        {sub.enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                      </button>
                      {/* Unsubscribe */}
                      <button
                        onClick={() => handleUnsubscribe(sub.imdbId)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove subscription"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                To subscribe to a show, open its detail page and click <strong>Auto-Download</strong>.
              </p>
            </div>
          )}

          {/* ── Last updated ── */}
          {lastUpdated && (
            <p className="text-center text-[10px] text-muted-foreground mt-6">
              Updated {lastUpdated.toLocaleTimeString()} · auto-refreshes every 2s
            </p>
          )}
        </div>
      </div>
    </>
  );
}
