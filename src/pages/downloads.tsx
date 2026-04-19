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
} from 'lucide-react';
import { toast } from 'sonner';
import VPNPanel from '@/components/VPNPanel';

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
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
