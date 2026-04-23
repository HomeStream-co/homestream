/**
 * Downloads page — Steam-style download queue with live stats.
 *
 * Features:
 *   - Steam-style progress bar: segmented fill, shimmer on active, speed/ETA overlay
 *   - Duplicate detection: 409 response shown as "Already queued" toast
 *   - Retry / Resume button for interrupted/error jobs
 *   - Speed sparkline graph (last 30 samples)
 *   - Queue priority reordering (move up/down in qBit)
 *   - Global transfer stats bar (total DL/UL speed, session data)
 *   - Per-torrent controls: pause, resume, remove, remove + delete files
 *   - Storage breakdown with category mini-bars
 *   - Auto-download subscriptions panel
 *
 * Polls /api/stremio/downloads every 2 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Wifi, WifiOff, Trash2, Pause, Play,
  CheckCircle2, AlertCircle, Clock, Loader2,
  Film, Tv2, ArrowDown, ArrowUp, Zap, HardDrive,
  RefreshCw, X, ChevronDown, ChevronUp, Activity,
  Settings2, Save, BarChart3, Layers,
  Bell, BellOff, Calendar, RotateCcw, TrendingUp,
  ChevronsUp, ChevronsDown, Link2, Send, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import VPNPanel from '@/components/VPNPanel';
import { useDownloadSocket } from '@/hooks/useDownloadSocket';

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
  interrupted?: boolean;
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

interface ScheduledJob {
  id: string;
  title: string;
  imdbId: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  poster?: string;
  year?: string;
  scheduledFor: string;
  status: 'pending' | 'fired' | 'error';
  createdAt: string;
  firedAt?: string;
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

// ─── Speed Sparkline ──────────────────────────────────────────────────────────

const SPARK_SAMPLES = 30;

function useSpeedHistory(speed: number, active: boolean) {
  const histRef = useRef<number[]>(Array(SPARK_SAMPLES).fill(0));
  useEffect(() => {
    if (!active) return;
    histRef.current = [...histRef.current.slice(1), speed];
  }, [speed, active]);
  return histRef.current;
}

function SpeedSparkline({ speed, active }: { speed: number; active: boolean }) {
  const history = useSpeedHistory(speed, active);
  const max = Math.max(...history, 1);
  const W = 60, H = 20;
  const step = W / (SPARK_SAMPLES - 1);

  const points = history
    .map((v, i) => `${i * step},${H - (v / max) * H}`)
    .join(' ');

  if (!active || max <= 1) return null;

  return (
    <svg width={W} height={H} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-blue-400"
      />
    </svg>
  );
}

// ─── Steam-style Progress Bar ─────────────────────────────────────────────────

function SteamProgressBar({
  progress,
  status,
  dlspeed,
  size,
  eta,
}: {
  progress: number;
  status: string;
  dlspeed?: number;
  size?: number;
  eta?: number;
}) {
  const pct = Math.min(100, Math.max(0, progress));
  const isActive = status === 'downloading' || status === 'transcoding';
  const isDone = status === 'done' || status === 'seeding';
  const isError = status === 'error';
  const isPaused = status === 'paused';
  const isStalled = status === 'stalled';

  // Steam uses a segmented look: completed portion + active shimmer
  const barColor = isError ? '#ef4444'
    : isDone ? '#22c55e'
    : isPaused ? '#6b7280'
    : isStalled ? '#f97316'
    : '#3b82f6';

  const downloaded = size ? size * pct / 100 : null;

  return (
    <div className="w-full">
      {/* Bar container — Steam uses a dark trough with a bright fill */}
      <div
        className="relative w-full rounded-sm overflow-hidden"
        style={{ height: 14, background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}
      >
        {/* Filled portion */}
        <motion.div
          className="absolute top-0 left-0 h-full rounded-sm"
          style={{ background: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />

        {/* Shimmer overlay on active downloads */}
        {isActive && (
          <motion.div
            className="absolute top-0 h-full w-16 rounded-sm"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
              left: `${pct - 8}%`,
            }}
            animate={{ left: [`${Math.max(0, pct - 20)}%`, `${pct}%`] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Segment tick marks every 25% — Steam style */}
        {[25, 50, 75].map(tick => (
          <div
            key={tick}
            className="absolute top-0 h-full w-px"
            style={{ left: `${tick}%`, background: 'rgba(0,0,0,0.25)' }}
          />
        ))}

        {/* Percentage text inside bar */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-[9px] font-bold tracking-wider select-none"
            style={{ color: pct > 45 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Stats row below bar — Steam shows: downloaded/total · speed · ETA */}
      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {downloaded !== null && size ? (
            <span>{fmtBytes(downloaded)} / {fmtBytes(size)}</span>
          ) : null}
          {isActive && dlspeed && dlspeed > 0 && (
            <span className="flex items-center gap-0.5 text-blue-400 font-semibold">
              <ArrowDown className="w-2.5 h-2.5" />
              {fmtSpeed(dlspeed)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isActive && eta && eta > 0 && (
            <span className="text-muted-foreground">
              {fmtEta(eta)} remaining
            </span>
          )}
          {isDone && <span className="text-green-400 font-semibold">Complete</span>}
          {isError && <span className="text-red-400 font-semibold">Failed</span>}
          {isPaused && <span className="text-muted-foreground">Paused</span>}
          {isStalled && <span className="text-orange-400">Stalled — searching for peers</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

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

// ─── qBittorrent torrent row ──────────────────────────────────────────────────

function QbitRow({ torrent, onDelete, onPause, onResume, onMoveUp, onMoveDown, isFirst, isLast }: {
  torrent: QbitTorrent;
  onDelete: (hash: string, deleteFiles: boolean) => void;
  onPause: (hash: string) => void;
  onResume: (hash: string) => void;
  onMoveUp: (hash: string) => void;
  onMoveDown: (hash: string) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | 'up' | 'down' | null>(null);

  const isActive = torrent.status === 'downloading' || torrent.status === 'queued' || torrent.status === 'stalled';
  const isDone = torrent.status === 'done' || torrent.status === 'seeding';
  const isPaused = torrent.status === 'paused';
  const canPause = isActive;
  const canResume = isPaused;

  const act = async (key: typeof actionLoading, fn: () => void | Promise<void>) => {
    setActionLoading(key);
    await fn();
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
      <div className="flex items-start gap-3 p-3">
        {/* Poster */}
        <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted mt-0.5">
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
          {/* Title + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <p className="text-sm font-semibold text-foreground truncate max-w-[260px]">{torrent.title}</p>
            <StatusBadge status={torrent.status} />
            {torrent.quality && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{torrent.quality}</span>
            )}
          </div>

          {/* Steam progress bar */}
          <SteamProgressBar
            progress={torrent.progress}
            status={torrent.status}
            dlspeed={torrent.dlspeed}
            size={torrent.size}
            eta={torrent.eta}
          />

          {/* Extra stats row */}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
            {isActive && (
              <>
                <span className="flex items-center gap-0.5 text-green-400">
                  <ArrowUp className="w-2.5 h-2.5" />{fmtSpeed(torrent.upspeed)}
                </span>
                <span className="flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" />
                  {torrent.seeds} seeds · {torrent.peers} peers
                </span>
                <SpeedSparkline speed={torrent.dlspeed} active={isActive} />
              </>
            )}
            {isDone && torrent.completionOn > 0 && (
              <span className="text-green-400">Completed {fmtDate(torrent.completionOn)}</span>
            )}
            {torrent.ratio > 0 && (
              <span>Ratio: {torrent.ratio.toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1">
            {/* Priority reorder — only for active/queued */}
            {isActive && (
              <>
                <button
                  onClick={() => act('up', () => onMoveUp(torrent.hash))}
                  disabled={isFirst || actionLoading === 'up'}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move up in queue"
                >
                  {actionLoading === 'up' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronsUp className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => act('down', () => onMoveDown(torrent.hash))}
                  disabled={isLast || actionLoading === 'down'}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move down in queue"
                >
                  {actionLoading === 'down' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronsDown className="w-3 h-3" />}
                </button>
              </>
            )}

            {/* Pause / Resume */}
            {canPause && (
              <button
                onClick={() => act('pause', () => onPause(torrent.hash))}
                disabled={actionLoading === 'pause'}
                className="p-1.5 rounded-lg hover:bg-yellow-500/10 transition-colors text-muted-foreground hover:text-yellow-400 disabled:opacity-50"
                title="Pause download"
              >
                {actionLoading === 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
            )}
            {canResume && (
              <button
                onClick={() => act('resume', () => onResume(torrent.hash))}
                disabled={actionLoading === 'resume'}
                className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors text-muted-foreground hover:text-green-400 disabled:opacity-50"
                title="Resume download"
              >
                {actionLoading === 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
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
            <div className="px-3 pb-3 pt-0 border-t border-border/40">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                {[
                  { label: 'Hash', value: torrent.hash.slice(0, 12) + '…' },
                  { label: 'State', value: torrent.state },
                  { label: 'Ratio', value: torrent.ratio?.toFixed(2) ?? '—' },
                  { label: 'Save path', value: torrent.savePath ?? '—' },
                  { label: 'Added', value: fmtDate(torrent.addedOn) },
                  { label: 'Seeds', value: String(torrent.seeds) },
                  { label: 'Peers', value: String(torrent.peers) },
                  { label: 'Upload speed', value: fmtSpeed(torrent.upspeed) },
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

function WtRow({ job, onRetry }: { job: WtJob; onRetry: (jobId: string) => Promise<void> }) {
  const isActive = job.status === 'downloading' || job.status === 'queued' || job.status === 'transcoding';
  const isError = job.status === 'error';
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetry(job.jobId);
    setRetrying(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-card border border-border rounded-xl p-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted mt-0.5">
          {job.poster ? (
            <img src={job.poster} alt={job.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {job.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <p className="text-sm font-semibold text-foreground truncate max-w-[260px]">{job.title}</p>
            <StatusBadge status={job.status as keyof typeof STATUS_CONFIG} />
            {job.quality && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{job.quality}</span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-semibold">WebTorrent</span>
          </div>

          <SteamProgressBar
            progress={job.progress}
            status={job.status}
            dlspeed={job.downloadSpeed}
            eta={job.eta}
          />

          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
            {isActive && (
              <>
                <span className="flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" />
                  {job.peers} peers
                </span>
                <SpeedSparkline speed={job.downloadSpeed} active={isActive} />
              </>
            )}
            {job.status === 'done' && job.completedAt && (
              <span className="text-green-400">Completed {new Date(job.completedAt).toLocaleString()}</span>
            )}
            {job.error && <span className="text-red-400 truncate max-w-[200px]">{job.error}</span>}
          </div>
        </div>

        {/* Retry button for error/interrupted jobs */}
        {isError && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
            title={job.interrupted ? 'Resume interrupted download' : 'Retry failed download'}
          >
            {retrying
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />
            }
            {job.interrupted ? 'Resume' : 'Retry'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Global speed bar (Steam-style session stats) ─────────────────────────────

function GlobalSpeedBar({ tf }: { tf: TransferInfo }) {
  const dlMBps = tf.dl_info_speed / 1024 / 1024;
  const ulMBps = tf.up_info_speed / 1024 / 1024;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* Steam-style dark header bar */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)' }}
      >
        <div className="flex items-center gap-4">
          {/* Download speed */}
          <div className="flex items-center gap-2">
            <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Download</p>
              <p className="text-sm font-bold text-blue-400 leading-none">{fmtSpeed(tf.dl_info_speed)}</p>
            </div>
          </div>

          <div className="w-px h-8 bg-border" />

          {/* Upload speed */}
          <div className="flex items-center gap-2">
            <ArrowUp className="w-3.5 h-3.5 text-green-400" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Upload</p>
              <p className="text-sm font-bold text-green-400 leading-none">{fmtSpeed(tf.up_info_speed)}</p>
            </div>
          </div>

          <div className="w-px h-8 bg-border" />

          {/* Session totals */}
          <div className="hidden sm:flex items-center gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Downloaded</p>
              <p className="text-xs font-semibold text-foreground">{fmtBytes(tf.dl_info_data)}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Uploaded</p>
              <p className="text-xs font-semibold text-foreground">{fmtBytes(tf.up_info_data)}</p>
            </div>
          </div>
        </div>

        {/* Connection status */}
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full ${
          tf.connection_status === 'connected' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${tf.connection_status === 'connected' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`} />
          {tf.connection_status === 'connected' ? 'Connected' : tf.connection_status}
        </div>
      </div>

      {/* Dual speed bars — Steam shows DL and UL as stacked bars */}
      <div className="px-4 pb-3 pt-1 flex flex-col gap-1">
        {/* DL bar */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-blue-400 w-4 text-right font-mono">DL</span>
          <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)' }}
              animate={{ width: `${Math.min(100, dlMBps * 10)}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground w-16 text-right font-mono">{fmtBytes(tf.dl_info_data)}</span>
        </div>
        {/* UL bar */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-green-400 w-4 text-right font-mono">UL</span>
          <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: 'linear-gradient(90deg, #15803d, #22c55e)' }}
              animate={{ width: `${Math.min(100, ulMBps * 10)}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground w-16 text-right font-mono">{fmtBytes(tf.up_info_data)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Manual Magnet Input ──────────────────────────────────────────────────────

function MagnetInput({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [magnet, setMagnet] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isValid = magnet.trim().startsWith('magnet:');

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/stremio/magnet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnet.trim() }),
      });
      const json = await res.json() as { ok: boolean; hash?: string; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Failed to add magnet');
      } else {
        toast.success('Magnet added to qBittorrent');
        setMagnet('');
        setOpen(false);
        onAdded();
      }
    } catch (err) {
      toast.error(`Network error: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.trim().startsWith('magnet:')) {
      // Auto-submit on paste of a valid magnet
      setTimeout(() => {
        setMagnet(text.trim());
      }, 0);
    }
  };

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-border bg-card/40 hover:bg-card hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground group"
        >
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <Link2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Paste a magnet link</p>
            <p className="text-xs text-muted-foreground">Add any torrent directly to qBittorrent</p>
          </div>
          <Send className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Paste Magnet Link</span>
            </div>
            <button
              onClick={() => { setOpen(false); setMagnet(''); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <textarea
            ref={inputRef}
            value={magnet}
            onChange={e => setMagnet(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="magnet:?xt=urn:btih:..."
            rows={3}
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isValid
                ? <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Valid magnet link</span>
                : magnet.length > 0
                  ? <span className="text-yellow-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Must start with magnet:</span>
                  : 'Paste a magnet link above — press Enter or click Add'}
            </p>
            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? 'Adding…' : 'Add to Queue'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DownloadsPage() {
  // ── Download state via WebSocket push (replaces 2s poll) ──────────────────
  const socketState = useDownloadSocket();
  const data: DownloadsResponse | null = socketState.qbitTorrents !== undefined || socketState.jobs !== undefined
    ? {
        jobs: socketState.jobs as unknown as DownloadsResponse['jobs'],
        qbitTorrents: socketState.qbitTorrents as unknown as DownloadsResponse['qbitTorrents'],
        transferInfo: socketState.transferInfo as DownloadsResponse['transferInfo'],
        backend: socketState.backend,
        qbitOnline: socketState.qbitOnline,
      }
    : null;
  const loading = data === null;
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Update lastUpdated timestamp whenever socket pushes new data
  useEffect(() => {
    if (data !== null) setLastUpdated(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketState]);

  // Manual refresh used after mutations (delete, pause, resume, etc.)
  // The WebSocket will push the updated state within 2s anyway, but this
  // gives immediate feedback after user actions.
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/stremio/downloads', { credentials: 'include' });
      if (!res.ok) return;
      // No-op — the WebSocket push will update state automatically
    } catch { /* ignore */ }
  }, []);
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'error'>('all');

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
      const res = await fetch('/api/subscriptions', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json() as { subscriptions: Subscription[] };
      setSubscriptions(json.subscriptions ?? []);
    } catch { /* silent */ }
  }, []);

  const handleUnsubscribe = async (imdbId: string) => {
    await fetch('/api/subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbId, action: 'unsubscribe' }),
    });
    setSubscriptions(s => s.filter(x => x.imdbId !== imdbId));
    toast.success('Unsubscribed');
  };

  const handleToggle = async (imdbId: string) => {
    await fetch('/api/subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imdbId, action: 'toggle' }),
    });
    fetchSubscriptions();
  };

  const handleCheckNow = async (imdbId: string, title: string) => {
    setCheckingId(imdbId);
    try {
      await fetch(`/api/subscriptions/${imdbId}/check`, { method: 'POST', credentials: 'include' });
      toast.success(`Checked "${title}" — see downloads for new episodes`);
      fetchSubscriptions();
    } catch {
      toast.error('Check failed');
    } finally {
      setCheckingId(null);
    }
  };

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  // Scheduled downloads state
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [cancellingScheduleId, setCancellingScheduleId] = useState<string | null>(null);

  const fetchScheduled = useCallback(async () => {
    try {
      const res = await fetch('/api/stremio/schedule', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json() as ScheduledJob[];
      setScheduledJobs(json);
    } catch { /* silent */ }
  }, []);

  const handleCancelScheduled = async (id: string, title: string) => {
    setCancellingScheduleId(id);
    try {
      const res = await fetch(`/api/stremio/schedule/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setScheduledJobs(j => j.filter(x => x.id !== id));
        toast.success(`Cancelled scheduled download for "${title}"`);
      } else {
        toast.error(data.error ?? 'Failed to cancel');
      }
    } catch {
      toast.error('Failed to cancel scheduled download');
    } finally {
      setCancellingScheduleId(null);
    }
  };

  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [moviesPct, setMoviesPct] = useState(60);
  const [tvPct, setTvPct] = useState(30);
  const [savingAlloc, setSavingAlloc] = useState(false);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch('/api/library/storage', { credentials: 'include' });
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
        credentials: 'include',
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

  useEffect(() => {
    fetchStorage();
    const storageInterval = setInterval(() => {
      if (!document.hidden) fetchStorage();
    }, 15000);
    const onVisible = () => { if (!document.hidden) fetchStorage(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(storageInterval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStorage]);

  const handleDelete = useCallback(async (hash: string, deleteFiles: boolean) => {
    try {
      const res = await fetch(`/api/stremio/downloads/${hash}?deleteFiles=${deleteFiles}`, { method: 'DELETE', credentials: 'include' });
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Download paused');
      setTimeout(fetchData, 600);
    } catch (err) {
      toast.error(`Failed to pause: ${String(err)}`);
    }
  }, [fetchData]);

  const handleResume = useCallback(async (hash: string) => {
    try {
      const res = await fetch('/api/stremio/downloads/resume', {
        method: 'POST',
        credentials: 'include',
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

  const handleMoveUp = useCallback(async (hash: string) => {
    try {
      await fetch('/api/stremio/downloads/priority', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, direction: 'up' }),
      });
      setTimeout(fetchData, 400);
    } catch { /* silent */ }
  }, [fetchData]);

  const handleMoveDown = useCallback(async (hash: string) => {
    try {
      await fetch('/api/stremio/downloads/priority', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, direction: 'down' }),
      });
      setTimeout(fetchData, 400);
    } catch { /* silent */ }
  }, [fetchData]);

  const handleRetry = useCallback(async (jobId: string) => {
    try {
      const res = await fetch('/api/stremio/downloads/retry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        toast.error(json.message ?? json.error ?? 'Retry failed');
        return;
      }
      toast.success(json.message ?? 'Download restarted');
      setTimeout(fetchData, 800);
    } catch (err) {
      toast.error(`Retry failed: ${String(err)}`);
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

  const activeQbit = qbitAll.filter(t => t.status === 'downloading' || t.status === 'queued' || t.status === 'stalled');
  const totalActive = activeQbit.length + wtAll.filter(j => j.status === 'downloading').length;
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

      <div className="min-h-screen bg-background pb-12">
        {/* ── Cinematic page header ── */}
        <div className="relative pt-24 pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-primary/6 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' as const }}
              className="flex items-start justify-between gap-4 flex-wrap"
            >
              <div>
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-1 h-8 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                  <h1 className="text-4xl sm:text-5xl font-heading font-bold text-foreground tracking-tight">Downloads</h1>
                </div>
                <p className="text-muted-foreground text-sm ml-4 pl-3 border-l border-border">
                  {totalActive > 0
                    ? `${totalActive} active download${totalActive !== 1 ? 's' : ''} in progress`
                    : totalAll === 0 ? 'No downloads yet — use Discover to start downloading'
                    : `${totalAll} total download${totalAll !== 1 ? 's' : ''}`}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
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
                <button
                  onClick={fetchData}
                  className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground border border-border"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* ── VPN Panel ── */}
          <div className="mb-6">
            <VPNPanel />
          </div>

          {/* ── Manual Magnet Paste ── */}
          <MagnetInput onAdded={fetchData} />

          {/* ── Disk Usage Bar ── */}
          {storage && storage.diskTotalBytes && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-card border border-border rounded-2xl p-4"
            >
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

              {(() => {
                const total = storage.diskTotalBytes!;
                const free  = storage.diskFreeBytes ?? 0;
                const used  = total - free;
                const usedPct = Math.min(100, (used / total) * 100);
                const freePct = 100 - usedPct;
                const barColor = usedPct >= 90 ? 'bg-red-500' : usedPct >= 75 ? 'bg-orange-500' : usedPct >= 60 ? 'bg-yellow-500' : 'bg-green-500';
                const textColor = usedPct >= 90 ? 'text-red-400' : usedPct >= 75 ? 'text-orange-400' : usedPct >= 60 ? 'text-yellow-400' : 'text-green-400';
                const label = usedPct >= 90 ? '⚠ Critical — disk nearly full' : usedPct >= 75 ? 'Running low on space' : usedPct >= 60 ? 'Moderate usage' : 'Plenty of space available';

                return (
                  <div>
                    <div className="relative w-full h-5 bg-muted/50 rounded-full overflow-hidden mb-2">
                      <motion.div className={`h-full rounded-full ${barColor} transition-colors duration-700`} initial={{ width: 0 }} animate={{ width: `${usedPct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                      <motion.div className="absolute top-0 left-0 h-full bg-primary/40 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(usedPct, (storage.libraryBytes / total) * 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90 mix-blend-plus-lighter">{usedPct.toFixed(1)}% used</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground"><span className="font-semibold text-foreground">{fmtBytes(used)}</span> used</span>
                        <span className="text-muted-foreground">·</span>
                        <span className={`font-semibold ${textColor}`}>{fmtBytes(free)} free</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{fmtBytes(total)} total</span>
                      </div>
                      <span className={`text-[10px] font-medium ${textColor}`}>{label}</span>
                    </div>
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
                              <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }} />
                            </div>
                            <p className="text-[11px] font-bold text-foreground">{fmtBytes(bytes)}</p>
                            <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}% of disk</p>
                          </div>
                        );
                      })}
                    </div>
                    {freePct < 10 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Less than 10% disk space remaining. Consider removing completed downloads or expanding storage.</span>
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              <AnimatePresence>
                {showStorageSettings && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Storage Organisation</p>
                        <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">Set target % of disk per category</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">These targets are informational — HomeStream uses them to warn you when a category is approaching its limit. Files are not automatically moved or deleted.</p>
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5"><Film className="w-3.5 h-3.5 text-blue-400" /><span className="text-xs font-semibold text-foreground">Movies</span></div>
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={100} value={moviesPct} onChange={e => setMoviesPct(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-14 text-center text-xs font-bold bg-muted border border-border rounded-lg px-2 py-1 text-foreground" />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          <input type="range" min={0} max={100} value={moviesPct} onChange={e => setMoviesPct(Number(e.target.value))} className="w-full accent-blue-500 h-2 rounded-full" />
                          {storage?.diskTotalBytes && <p className="text-[10px] text-muted-foreground mt-0.5">Target: {fmtBytes((storage.diskTotalBytes * moviesPct) / 100)} · Currently using {fmtBytes(storage.categoryBytes.movies)}</p>}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5"><Tv2 className="w-3.5 h-3.5 text-purple-400" /><span className="text-xs font-semibold text-foreground">TV Shows</span></div>
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={100} value={tvPct} onChange={e => setTvPct(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-14 text-center text-xs font-bold bg-muted border border-border rounded-lg px-2 py-1 text-foreground" />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          <input type="range" min={0} max={100} value={tvPct} onChange={e => setTvPct(Number(e.target.value))} className="w-full accent-purple-500 h-2 rounded-full" />
                          {storage?.diskTotalBytes && <p className="text-[10px] text-muted-foreground mt-0.5">Target: {fmtBytes((storage.diskTotalBytes * tvPct) / 100)} · Currently using {fmtBytes(storage.categoryBytes.tv)}</p>}
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl">
                          <div className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Other / Unallocated</span></div>
                          <span className={`text-xs font-bold ${moviesPct + tvPct > 100 ? 'text-red-400' : 'text-foreground'}`}>{Math.max(0, 100 - moviesPct - tvPct)}%</span>
                        </div>
                        {moviesPct + tvPct > 100 && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Total exceeds 100% — reduce Movies or TV allocation</p>}
                        <button onClick={saveAllocation} disabled={savingAlloc || moviesPct + tvPct > 100} className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
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

          {/* ── Steam-style Global Speed Bar ── */}
          <AnimatePresence>
            {tf && data?.qbitOnline && <GlobalSpeedBar tf={tf} />}
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
                  Head to the Discover page to search for movies and TV shows, then hit Download to start.
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
                    {filteredQbit.map((t, i) => (
                      <QbitRow
                        key={t.hash}
                        torrent={t}
                        onDelete={handleDelete}
                        onPause={handlePause}
                        onResume={handleResume}
                        onMoveUp={handleMoveUp}
                        onMoveDown={handleMoveDown}
                        isFirst={i === 0}
                        isLast={i === filteredQbit.length - 1}
                      />
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
                      <WtRow key={j.jobId} job={j} onRetry={handleRetry} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* ── Scheduled Queue ── */}
          {scheduledJobs.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Scheduled Downloads</h2>
                  <span className="text-xs text-muted-foreground">
                    ({scheduledJobs.filter(j => j.status === 'pending').length} pending)
                  </span>
                </div>
                <button
                  onClick={fetchScheduled}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {scheduledJobs.map(job => {
                    const isPending = job.status === 'pending';
                    const isFired = job.status === 'fired';
                    const isError = job.status === 'error';
                    const fireDate = new Date(job.scheduledFor);
                    const isOverdue = isPending && fireDate.getTime() < Date.now();

                    return (
                      <motion.div
                        key={job.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                          isFired
                            ? 'bg-green-500/5 border-green-500/20'
                            : isError
                            ? 'bg-destructive/5 border-destructive/20'
                            : isOverdue
                            ? 'bg-amber-500/5 border-amber-500/20'
                            : 'bg-card border-border'
                        }`}
                      >
                        {/* Poster */}
                        {job.poster ? (
                          <img
                            src={job.poster}
                            alt={job.title}
                            className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-10 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            {job.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{job.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {job.type === 'series' && job.season != null && (
                              <span className="text-[10px] text-muted-foreground">
                                S{String(job.season).padStart(2, '0')}{job.episode != null ? `E${String(job.episode).padStart(2, '0')}` : ''}
                              </span>
                            )}
                            {/* Status badge */}
                            {isPending && !isOverdue && (
                              <span className="flex items-center gap-1 text-[10px] text-primary">
                                <Clock className="w-3 h-3" />
                                {fireDate.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </span>
                            )}
                            {isPending && isOverdue && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Firing soon…
                              </span>
                            )}
                            {isFired && (
                              <span className="flex items-center gap-1 text-[10px] text-green-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Fired {job.firedAt ? new Date(job.firedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                              </span>
                            )}
                            {isError && (
                              <span className="flex items-center gap-1 text-[10px] text-destructive" title={job.error}>
                                <AlertCircle className="w-3 h-3" />
                                Failed — {job.error?.slice(0, 60)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cancel button (pending only) */}
                        {isPending && (
                          <button
                            onClick={() => handleCancelScheduled(job.id, job.title)}
                            disabled={cancellingScheduleId === job.id}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 flex-shrink-0"
                            title="Cancel scheduled download"
                          >
                            {cancellingScheduleId === job.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <X className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Schedule a download from the <strong>Stremio</strong> panel — click the <CalendarClock className="w-3 h-3 inline" /> icon next to any stream.
              </p>
            </div>
          )}

          {/* ── Subscriptions ── */}
          {subscriptions.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Auto-Download Subscriptions</h2>
                <span className="text-xs text-muted-foreground">({subscriptions.length})</span>
              </div>
              <div className="space-y-2">
                {subscriptions.map(sub => (
                  <motion.div key={sub.imdbId} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                    {sub.poster && (
                      <img src={sub.poster} alt={sub.title} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{sub.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {sub.schedule === 'daily' ? 'Daily' : sub.schedule === 'every3days' ? 'Every 3 days' : sub.schedule === 'weekly' ? 'Weekly' : 'Every 2 weeks'}
                        </span>
                        {sub.nextCheckAt && sub.enabled && <span className="text-xs text-muted-foreground">Next: {new Date(sub.nextCheckAt).toLocaleDateString()}</span>}
                        {!sub.enabled && <span className="text-xs text-muted-foreground italic">Paused</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleCheckNow(sub.imdbId, sub.title)} disabled={checkingId === sub.imdbId} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50" title="Check for new episodes now">
                        <RefreshCw className={`w-3.5 h-3.5 ${checkingId === sub.imdbId ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={() => handleToggle(sub.imdbId)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={sub.enabled ? 'Pause subscription' : 'Resume subscription'}>
                        {sub.enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleUnsubscribe(sub.imdbId)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remove subscription">
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
