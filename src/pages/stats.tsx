/**
 * /stats — Library Stats Dashboard
 *
 * Shows codec breakdown, storage usage, resolution split, content type
 * distribution, total watch time, top watched items, recently added,
 * genre distribution, and live download/upload speed indicator.
 *
 * Polls /api/stats every 10s (download speed refreshes every 3s separately).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  HardDrive, Film, Tv2, Clock, TrendingUp, BarChart3,
  Download, Upload, Layers, RefreshCw, ChevronRight,
  Wifi, WifiOff, ArrowDown, ArrowUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Spinner from '@/components/Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CodecStat   { name: string; count: number; bytes: number }
interface ResStat     { name: string; count: number; bytes: number }
interface GenreStat   { name: string; count: number }
interface WatchedItem { id: string; title: string; type: string; poster?: string; watchedSeconds: number; totalSeconds: number; watchProgress: number }
interface RecentItem  { id: string; title: string; type: string; poster?: string; addedAt?: string; year?: string }
interface DownloadSpeed { dlspeed: number; upspeed: number; dlTotal: number; upTotal: number }

interface StatsData {
  libraryBytes: number;
  libraryCount: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  mediaDir: string | null;
  codecs: CodecStat[];
  resolutions: ResStat[];
  contentTypes: { movies: number; shows: number; other: number };
  totalWatchedSeconds: number;
  topWatched: WatchedItem[];
  recentlyAdded: RecentItem[];
  genres: GenreStat[];
  downloadSpeed: DownloadSpeed | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function fmtSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fmtDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function codecColor(name: string): string {
  const map: Record<string, string> = {
    h264: 'bg-blue-500', avc: 'bg-blue-500',
    hevc: 'bg-purple-500', h265: 'bg-purple-500',
    av1: 'bg-green-500',
    vp9: 'bg-yellow-500',
    mpeg4: 'bg-orange-500',
    mpeg2video: 'bg-red-400',
    unknown: 'bg-muted-foreground',
  };
  return map[name.toLowerCase()] ?? 'bg-primary';
}

function resColor(name: string): string {
  const map: Record<string, string> = {
    '4K': 'bg-purple-500',
    '1080p': 'bg-blue-500',
    '720p': 'bg-green-500',
    'SD': 'bg-muted-foreground',
  };
  return map[name] ?? 'bg-primary';
}

// ── Speed Indicator ───────────────────────────────────────────────────────────

function SpeedIndicator({ speed }: { speed: DownloadSpeed | null }) {
  if (!speed) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <WifiOff className="w-4 h-4" />
        <span>qBittorrent offline</span>
      </div>
    );
  }
  const isActive = speed.dlspeed > 0 || speed.upspeed > 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <ArrowDown className={`w-4 h-4 ${isActive && speed.dlspeed > 0 ? 'text-green-400' : 'text-muted-foreground'}`} />
        <span className={`text-sm font-mono font-semibold tabular-nums ${isActive && speed.dlspeed > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
          {fmtSpeed(speed.dlspeed)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <ArrowUp className={`w-4 h-4 ${isActive && speed.upspeed > 0 ? 'text-blue-400' : 'text-muted-foreground'}`} />
        <span className={`text-sm font-mono font-semibold tabular-nums ${isActive && speed.upspeed > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
          {fmtSpeed(speed.upspeed)}
        </span>
      </div>
      {isActive && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <Wifi className="w-3 h-3" />
          Active
        </span>
      )}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function BarRow({
  label, count, total, bytes, color, delay = 0,
}: {
  label: string; count: number; total: number; bytes: number; color: string; delay?: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center gap-3"
    >
      <span className="w-16 text-xs text-muted-foreground text-right font-mono shrink-0 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: delay + 0.1, ease: 'easeOut' as const }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="w-8 text-xs text-right text-foreground font-semibold tabular-nums shrink-0">{count}</span>
      <span className="w-16 text-xs text-right text-muted-foreground tabular-nums shrink-0">{fmtBytes(bytes)}</span>
    </motion.div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary', delay = 0,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="bg-card border-border">
        <CardContent className="p-5 flex items-start gap-4">
          <div className={`p-2.5 rounded-xl bg-muted ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/stats', { credentials: 'include' });
      if (res.status === 401) throw new Error('HTTP 401 — please log in first');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as StatsData;
      // Guard: ensure array fields are actually arrays before rendering
      const safe: StatsData = {
        ...json,
        codecs: Array.isArray(json.codecs) ? json.codecs : [],
        resolutions: Array.isArray(json.resolutions) ? json.resolutions : [],
        genres: Array.isArray(json.genres) ? json.genres : [],
        topWatched: Array.isArray(json.topWatched) ? json.topWatched : [],
        recentlyAdded: Array.isArray(json.recentlyAdded) ? json.recentlyAdded : [],
      };
      setData(safe);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    pollRef.current = setInterval(() => {
      if (!document.hidden) fetchStats(true);
    }, 10_000);
    const onVisible = () => { if (!document.hidden) fetchStats(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    const is401 = error?.includes('401');
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Could not load stats</h2>
        {is401 && (
          <p className="text-sm text-muted-foreground mb-4">
            You need to be logged in to view stats. Please sign in and try again.
          </p>
        )}
        <p className="text-sm text-muted-foreground mb-6">{error ?? 'Unknown error'}</p>
        <button
          onClick={() => fetchStats()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalItems = data.libraryCount;
  const diskUsedPct = data.diskTotalBytes && data.diskFreeBytes != null
    ? Math.round(((data.diskTotalBytes - data.diskFreeBytes) / data.diskTotalBytes) * 100)
    : null;
  const totalCodecItems = data.codecs.reduce((s, c) => s + c.count, 0);
  const totalResItems   = data.resolutions.reduce((s, r) => s + r.count, 0);
  const totalGenreCount = data.genres.reduce((s, g) => s + g.count, 0);

  return (
    <>
      <title>Library Stats — HomeStream</title>
      <meta name="description" content="Codec breakdown, storage usage, watch time and download speed for your HomeStream library." />

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Library Stats</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
          <button
            onClick={() => fetchStats()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Download Speed Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between flex-wrap gap-4 px-5 py-4 bg-card border border-border rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Download className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Live Transfer Speed</p>
              <SpeedIndicator speed={data.downloadSpeed} />
            </div>
          </div>
          {data.downloadSpeed && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span>↓ Total: <span className="text-foreground font-medium">{fmtBytes(data.downloadSpeed.dlTotal)}</span></span>
              <span>↑ Total: <span className="text-foreground font-medium">{fmtBytes(data.downloadSpeed.upTotal)}</span></span>
              <Link to="/downloads" className="flex items-center gap-1 text-primary hover:underline">
                Downloads <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </motion.div>

        {/* ── Top stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard icon={Layers}   label="Total Items"   value={String(totalItems)}                    color="text-primary"    delay={0}    />
          <StatCard icon={HardDrive} label="Library Size" value={fmtBytes(data.libraryBytes)}           color="text-blue-400"   delay={0.05} />
          <StatCard icon={Film}     label="Movies"        value={String(data.contentTypes.movies)}      color="text-purple-400" delay={0.1}  />
          <StatCard icon={Tv2}      label="TV Shows"      value={String(data.contentTypes.shows)}       color="text-green-400"  delay={0.15} />
          <StatCard icon={Clock}    label="Watch Time"    value={fmtDuration(data.totalWatchedSeconds)} color="text-yellow-400" delay={0.2}
            sub={`${data.topWatched.length} items watched`}
          />
        </div>

        {/* ── Storage bar ── */}
        {data.diskTotalBytes && diskUsedPct !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  Disk Usage
                  {data.mediaDir && (
                    <span className="text-xs text-muted-foreground font-normal ml-1 truncate max-w-xs">{data.mediaDir}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Used: <span className="text-foreground font-medium">{fmtBytes(data.diskTotalBytes - (data.diskFreeBytes ?? 0))}</span></span>
                  <span>Free: <span className="text-foreground font-medium">{fmtBytes(data.diskFreeBytes ?? 0)}</span></span>
                  <span>Total: <span className="text-foreground font-medium">{fmtBytes(data.diskTotalBytes)}</span></span>
                </div>
                <Progress value={diskUsedPct} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>HomeStream library: <span className="text-foreground">{fmtBytes(data.libraryBytes)}</span></span>
                  <span className={diskUsedPct > 85 ? 'text-red-400 font-semibold' : ''}>{diskUsedPct}% used</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Codec + Resolution ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Codec breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.3 }}
          >
            <Card className="bg-card border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary" />
                  Video Codecs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.codecs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No codec data yet — files need ffprobe metadata.</p>
                ) : (
                  data.codecs.map((c, i) => (
                    <BarRow
                      key={c.name}
                      label={c.name === 'h264' ? 'H.264' : c.name === 'hevc' ? 'H.265' : c.name.toUpperCase()}
                      count={c.count}
                      total={totalCodecItems}
                      bytes={c.bytes}
                      color={codecColor(c.name)}
                      delay={0.35 + i * 0.05}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Resolution breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.35 }}
          >
            <Card className="bg-card border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Resolution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.resolutions.map((r, i) => (
                  <BarRow
                    key={r.name}
                    label={r.name}
                    count={r.count}
                    total={totalResItems}
                    bytes={r.bytes}
                    color={resColor(r.name)}
                    delay={0.4 + i * 0.05}
                  />
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Top Watched + Recently Added ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top watched */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.45 }}
          >
            <Card className="bg-card border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Most Watched
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topWatched.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing watched yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.topWatched.map((item, i) => (
                      <Link
                        key={item.id}
                        to={item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="w-10 h-14 object-cover rounded shrink-0 bg-muted" />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded shrink-0 flex items-center justify-center">
                            {item.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{fmtDuration(item.watchedSeconds)} watched</p>
                          {item.totalSeconds > 0 && (
                            <Progress value={Math.min(100, item.watchProgress * 100)} className="h-1 mt-1" />
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recently added */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.5 }}
          >
            <Card className="bg-card border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  Recently Added
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentlyAdded.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.recentlyAdded.map(item => (
                      <Link
                        key={item.id}
                        to={item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`}
                        className="flex items-center gap-3 group"
                      >
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} className="w-10 h-14 object-cover rounded shrink-0 bg-muted" />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded shrink-0 flex items-center justify-center">
                            {item.type === 'series' ? <Tv2 className="w-4 h-4 text-muted-foreground" /> : <Film className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.year && <span className="text-xs text-muted-foreground">{item.year}</span>}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {item.type === 'series' ? 'TV' : 'Movie'}
                            </Badge>
                          </div>
                          {item.addedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(item.addedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Genre Distribution ── */}
        {data.genres.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.55 }}
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Genre Distribution
                  <span className="text-xs text-muted-foreground font-normal ml-1">(top 10)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
                  {data.genres.map((g, i) => {
                    const pct = totalGenreCount > 0 ? Math.round((g.count / data.genres[0].count) * 100) : 0;
                    return (
                      <motion.div
                        key={g.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.6 + i * 0.04 }}
                        className="flex items-center gap-3"
                      >
                        <span className="w-24 text-xs text-muted-foreground truncate shrink-0">{g.name}</span>
                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: 0.65 + i * 0.04, ease: 'easeOut' as const }}
                            className="h-full rounded-full bg-primary/70"
                          />
                        </div>
                        <span className="w-6 text-xs text-right text-foreground font-semibold tabular-nums shrink-0">{g.count}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Content type donut-style summary ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.6 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { label: 'Movies',   count: data.contentTypes.movies, icon: Film,   color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { label: 'TV Shows', count: data.contentTypes.shows,  icon: Tv2,    color: 'text-green-400 bg-green-500/10 border-green-500/20' },
            { label: 'Other',    count: data.contentTypes.other,  icon: Layers, color: 'text-muted-foreground bg-muted border-border' },
          ].map(({ label, count, icon: Icon, color }) => (
            <div key={label} className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border ${color}`}>
              <Icon className="w-6 h-6" />
              <span className="text-2xl font-bold tabular-nums">{count}</span>
              <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </motion.div>

        {/* ── Transfer totals footer ── */}
        {data.downloadSpeed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.65 }}
            className="flex items-center justify-between flex-wrap gap-4 px-5 py-4 bg-card border border-border rounded-xl text-sm"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Upload className="w-4 h-4" />
              <span>Session totals</span>
            </div>
            <div className="flex items-center gap-6 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ArrowDown className="w-3.5 h-3.5 text-green-400" />
                Downloaded: <span className="text-foreground font-medium ml-1">{fmtBytes(data.downloadSpeed.dlTotal)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                Uploaded: <span className="text-foreground font-medium ml-1">{fmtBytes(data.downloadSpeed.upTotal)}</span>
              </span>
            </div>
          </motion.div>
        )}

      </div>
    </>
  );
}
