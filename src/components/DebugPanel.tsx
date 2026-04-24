/**
 * DebugPanel — slide-in diagnostics panel (cogwheel → Debug & Diagnostics)
 *
 * Tabs:
 *  1. Health     — live subsystem checks with auto-refresh
 *  2. Quick Fixes — one-click repair actions via /api/debug/repair
 *  3. System     — RAM, CPU, uptime, Node version, platform
 *  4. Network    — ping TMDB / Torrentio / OpenSubtitles with latency
 *  5. Crash Log  — full crash log with copy-for-support
 *
 * Always visible (not DEV-only). Designed to get any user unstuck.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, Wrench, Loader2, ChevronRight, Trash2,
  Database, Wifi, Download, Cpu, Film, Server,
  ClipboardCopy, ClipboardCheck, Bug,
  Activity, Zap, Globe, MemoryStick, Clock, Terminal,
  RotateCcw, ShieldOff, Play,
} from 'lucide-react';
import { DevVersionTrigger } from './DevDrawer';
// DevDrawer is lazy-loaded so Vite can tree-shake it from production bundles
// when DEVELOPER_LOCK is not set. The runtime devLocked gate ensures it is
// never rendered on family installs regardless.
const DevDrawer = React.lazy(() =>
  import('./DevDrawer').then(m => ({ default: m.DevDrawer }))
);

// ── Types ─────────────────────────────────────────────────────────────────────

type SubsystemStatus = 'ok' | 'warn' | 'error' | 'unknown';
type Tab = 'health' | 'fixes' | 'system' | 'network' | 'crashes';

interface SubsystemCheck {
  name: string;
  status: SubsystemStatus;
  message: string;
  detail?: string;
}

interface HealthReport {
  overall: SubsystemStatus;
  checks: SubsystemCheck[];
  timestamp: string;
}

interface CrashEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  stack?: string;
  context?: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
}

interface SystemInfo {
  node: string;
  platform: string;
  arch: string;
  uptime: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
    freeMb: number;
    totalMb: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadAvg: number[];
  };
  env: string;
  pid: number;
}

interface NetworkResult {
  name: string;
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, className = 'w-4 h-4' }: { status: SubsystemStatus; className?: string }) {
  if (status === 'ok')   return <CheckCircle2 className={`${className} text-green-400`} />;
  if (status === 'warn') return <AlertTriangle className={`${className} text-yellow-400`} />;
  if (status === 'error') return <XCircle className={`${className} text-destructive`} />;
  return <HelpCircle className={`${className} text-muted-foreground`} />;
}

function statusColor(status: SubsystemStatus) {
  if (status === 'ok')   return 'text-green-400';
  if (status === 'warn') return 'text-yellow-400';
  if (status === 'error') return 'text-destructive';
  return 'text-muted-foreground';
}

function subsystemIcon(name: string) {
  if (name.includes('Library'))  return <Film className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Config'))   return <Server className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('qBit'))     return <Download className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('TMDB'))     return <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Ollama'))   return <Cpu className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Torrentio')) return <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Download')) return <Database className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('FFmpeg'))   return <Play className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Server className="w-3.5 h-3.5 text-muted-foreground" />;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon: Icon, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: 'warn' | 'error';
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-semibold transition-colors flex-1 ${
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge && (
        <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${badge === 'error' ? 'bg-destructive' : 'bg-yellow-400'}`} />
      )}
    </button>
  );
}

// ── Health Tab ────────────────────────────────────────────────────────────────

function HealthTab({ health, loading, onRefresh }: {
  health: HealthReport | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Subsystem Health</p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !health && (
        <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Running checks…
        </div>
      )}

      {!loading && !health && (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-xs">
          <XCircle className="w-6 h-6 text-destructive" />
          <p>Failed to load health data</p>
          <button onClick={onRefresh} className="text-primary text-[11px] hover:underline">Try again</button>
        </div>
      )}

      {health && (
        <>
          {/* Overall banner */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
            health.overall === 'ok'    ? 'bg-green-500/10 border-green-500/20 text-green-400' :
            health.overall === 'warn'  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                         'bg-destructive/10 border-destructive/20 text-destructive'
          }`}>
            <StatusIcon status={health.overall} className="w-4 h-4" />
            {health.overall === 'ok'   ? 'All systems operational' :
             health.overall === 'warn' ? 'Some warnings — see details below' :
                                         'Issues detected — action required'}
          </div>

          <div className="flex flex-col gap-1">
            {health.checks.map(check => (
              <div key={check.name}>
                <button
                  onClick={() => setExpandedCheck(expandedCheck === check.name ? null : check.name)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <StatusIcon status={check.status} className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="flex items-center gap-1.5 flex-shrink-0">{subsystemIcon(check.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{check.name}</p>
                    <p className={`text-[10px] ${statusColor(check.status)} truncate`}>{check.message}</p>
                  </div>
                  {check.detail && (
                    <ChevronRight className={`w-3 h-3 text-muted-foreground flex-shrink-0 transition-transform ${expandedCheck === check.name ? 'rotate-90' : ''}`} />
                  )}
                </button>
                {expandedCheck === check.name && check.detail && (
                  <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-muted/30 border border-border">
                    <p className="text-[10px] text-muted-foreground font-mono break-all">{check.detail}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[9px] text-muted-foreground text-right">
            Last checked: {new Date(health.timestamp).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}

// ── Quick Fixes Tab ───────────────────────────────────────────────────────────

interface QuickFix {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  variant?: 'default' | 'destructive' | 'warning';
  confirmMsg?: string;
}

const QUICK_FIXES: QuickFix[] = [
  {
    id: 'clear_stuck_transcodes',
    label: 'Clear Stuck Transcodes',
    description: 'Resets library items stuck with transcoding:true — fixes "spinning forever" on media cards',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_errored_downloads',
    label: 'Clear Errored Downloads',
    description: 'Removes failed download jobs from the queue so new downloads can start',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'destructive',
  },
  {
    id: 'clear_stuck_queued',
    label: 'Clear Stuck Queued Jobs',
    description: 'Removes download jobs stuck in "queued" state for more than 30 minutes',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'destructive',
  },
  {
    id: 'reset_hls_sessions',
    label: 'Reset HLS Sessions',
    description: 'Kills all active HLS transcode sessions — fixes video that won\'t load or is buffering forever',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_tmdb_cache',
    label: 'Clear TMDB Cache',
    description: 'Forces all metadata to re-fetch from TMDB on next view — fixes stale or missing posters/info',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  {
    id: 'test_network',
    label: 'Test External Connectivity',
    description: 'Pings TMDB, Torrentio, and OpenSubtitles to check if your server can reach the internet',
    icon: <Globe className="w-3.5 h-3.5" />,
  },
  {
    id: 'reindex_library',
    label: 'Re-enrich Library Metadata',
    description: 'Triggers a background re-fetch of AI enrichment tags and metadata for all library items',
    icon: <Zap className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_watch_progress',
    label: 'Reset All Watch Progress',
    description: 'Wipes server-side watch progress for every title. Per-profile progress (stored locally) is unaffected.',
    icon: <ShieldOff className="w-3.5 h-3.5" />,
    variant: 'warning',
    confirmMsg: 'This will reset watch progress for all titles on the server. Continue?',
  },
  {
    id: 'clear_crash_log',
    label: 'Clear Crash Log',
    description: 'Wipes the crash log after you\'ve reviewed or copied it',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'destructive',
  },
  {
    id: 'purge_orphaned_uploads',
    label: 'Purge Orphaned Upload Files',
    description: 'Deletes video files in the uploads folder that have no library entry — reclaims disk space from failed or partial uploads',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'warning',
    confirmMsg: 'This will permanently delete video files not tracked in the library. Make sure your library is up to date first. Continue?',
  },
  {
    id: 'prune_tmdb_cache',
    label: 'Prune Stale TMDB Cache',
    description: 'Removes TMDB metadata cache files older than 90 days — safe to run any time, frees up space from deleted library items',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
];

function QuickFixesTab() {
  const [results, setResults] = useState<Record<string, { msg: string; ok: boolean }>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  const runFix = async (id: string) => {
    setRunning(id);
    setResults(r => ({ ...r, [id]: { msg: '', ok: true } }));
    try {
      const res = await fetch('/api/debug/repair', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: id }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setResults(r => ({ ...r, [id]: { msg: data.message, ok: data.ok } }));
    } catch (err) {
      setResults(r => ({ ...r, [id]: { msg: String(err), ok: false } }));
    } finally {
      setRunning(null);
    }
  };

  const handleRun = (fix: QuickFix) => {
    if (fix.confirmMsg) {
      setPendingConfirm(fix.id);
    } else {
      void runFix(fix.id);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">One-click Repairs</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
        These actions are safe to run at any time. Use them to unstick common problems without restarting HomeStream.
      </p>

      {QUICK_FIXES.map(fix => (
        <div key={fix.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
          {/* Confirm prompt */}
          {pendingConfirm === fix.id && (
            <div className="px-3 pt-3 pb-2 bg-yellow-500/8 border-b border-yellow-500/20">
              <p className="text-[11px] text-yellow-400 font-medium mb-2">{fix.confirmMsg}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPendingConfirm(null); void runFix(fix.id); }}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 transition-colors"
                >
                  Yes, proceed
                </button>
                <button
                  onClick={() => setPendingConfirm(null)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{fix.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{fix.description}</p>
              {results[fix.id]?.msg && (
                <p className={`text-[10px] mt-1.5 font-medium ${results[fix.id].ok ? 'text-green-400' : 'text-destructive'}`}>
                  {results[fix.id].ok ? '✓ ' : '✗ '}{results[fix.id].msg}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRun(fix)}
              disabled={running === fix.id || pendingConfirm === fix.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors flex-shrink-0 disabled:opacity-50 ${
                fix.variant === 'destructive' ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive' :
                fix.variant === 'warning'     ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400' :
                                                'bg-primary/20 hover:bg-primary/30 text-primary'
              }`}
            >
              {running === fix.id ? <Loader2 className="w-3 h-3 animate-spin" /> : fix.icon}
              Run
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── System Info Tab ───────────────────────────────────────────────────────────

function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  // Timestamp of when system info was fetched — used to compute live uptime
  // without a setInterval (avoids a constant 1-second re-render cycle).
  const fetchedAtRef = useRef<number>(0);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/debug/system-info', { credentials: 'include' });
      const data = await res.json() as SystemInfo;
      fetchedAtRef.current = Date.now();
      setInfo(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchInfo(); }, [fetchInfo]);

  // Compute live uptime at render time — no interval needed.
  const liveUptime = info
    ? info.uptime + Math.floor((Date.now() - fetchedAtRef.current) / 1000)
    : 0;

  const Row = ({ label, value, mono = false, color }: { label: string; value: string; mono?: boolean; color?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-medium ${color ?? 'text-foreground'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );

  if (loading && !info) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground text-xs p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading system info…
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-xs p-4">
        <XCircle className="w-6 h-6 text-destructive" />
        <p>Failed to load system info</p>
        <button onClick={fetchInfo} className="text-primary text-[11px] hover:underline">Retry</button>
      </div>
    );
  }

  const heapPct = Math.round((info.memory.heapUsedMb / info.memory.heapTotalMb) * 100);
  const ramPct  = Math.round(((info.memory.totalMb - info.memory.freeMb) / info.memory.totalMb) * 100);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Runtime</p>
        <button onClick={fetchInfo} disabled={loading} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Uptime hero */}
      <div className="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 flex items-center gap-3">
        <Clock className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Server Uptime</p>
          <p className="text-lg font-bold text-foreground font-mono">{fmtUptime(liveUptime)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-muted-foreground">PID</p>
          <p className="text-sm font-mono text-foreground">{info.pid}</p>
        </div>
      </div>

      {/* Memory */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MemoryStick className="w-3 h-3" /> Memory
        </p>
        <div className="space-y-2">
          {/* Heap bar */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">JS Heap</span>
              <span className="text-foreground font-mono">{info.memory.heapUsedMb} / {info.memory.heapTotalMb} MB ({heapPct}%)</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${heapPct > 80 ? 'bg-destructive' : heapPct > 60 ? 'bg-yellow-400' : 'bg-primary'}`} style={{ width: `${heapPct}%` }} />
            </div>
          </div>
          {/* System RAM bar */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">System RAM</span>
              <span className="text-foreground font-mono">{info.memory.totalMb - info.memory.freeMb} / {info.memory.totalMb} MB ({ramPct}%)</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${ramPct > 90 ? 'bg-destructive' : ramPct > 75 ? 'bg-yellow-400' : 'bg-green-500'}`} style={{ width: `${ramPct}%` }} />
            </div>
          </div>
          <Row label="RSS (total process)" value={`${info.memory.rssMb} MB`} mono />
        </div>
      </div>

      {/* CPU */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Cpu className="w-3 h-3" /> CPU
        </p>
        <Row label="Model" value={info.cpu.model.length > 30 ? info.cpu.model.slice(0, 30) + '…' : info.cpu.model} />
        <Row label="Cores" value={String(info.cpu.cores)} mono />
        {info.cpu.loadAvg.some(v => v > 0) && (
          <Row
            label="Load avg (1/5/15m)"
            value={info.cpu.loadAvg.map(v => v.toFixed(2)).join(' / ')}
            mono
            color={info.cpu.loadAvg[0] > info.cpu.cores ? 'text-destructive' : info.cpu.loadAvg[0] > info.cpu.cores * 0.7 ? 'text-yellow-400' : 'text-green-400'}
          />
        )}
      </div>

      {/* Platform */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Terminal className="w-3 h-3" /> Platform
        </p>
        <Row label="Node.js" value={info.node} mono />
        <Row label="OS" value={`${info.platform} / ${info.arch}`} mono />
        <Row label="Environment" value={info.env} mono color={info.env === 'production' ? 'text-green-400' : 'text-yellow-400'} />
      </div>
    </div>
  );
}

// ── Network Tab ───────────────────────────────────────────────────────────────

function NetworkTab() {
  const [results, setResults] = useState<NetworkResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const runTest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/debug/repair', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_network' }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      // Parse the "Name: ✓ 123ms · Name: ✗ error" format
      const parsed: NetworkResult[] = data.message.split(' · ').map(part => {
        const match = part.match(/^(.+?):\s*(✓|✗)\s*(.+)$/);
        if (!match) return { name: part, ok: false, ms: 0, error: 'parse error' };
        const ok = match[2] === '✓';
        const rest = match[3];
        const msMatch = rest.match(/^(\d+)ms$/);
        return {
          name: match[1],
          ok,
          ms: msMatch ? parseInt(msMatch[1]) : 0,
          error: ok ? undefined : rest,
        };
      });
      setResults(parsed);
    } catch (err) {
      setResults([{ name: 'Error', ok: false, ms: 0, error: String(err) }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const latencyColor = (ms: number) => {
    if (ms < 200) return 'text-green-400';
    if (ms < 600) return 'text-yellow-400';
    return 'text-destructive';
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">External Connectivity</p>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Tests whether your HomeStream server can reach the external services it depends on. Run this if downloads, metadata, or subtitles aren't working.
      </p>

      <button
        onClick={runTest}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
        {loading ? 'Testing connectivity…' : 'Run Connectivity Test'}
      </button>

      {results && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
              r.ok ? 'bg-green-500/5 border-green-500/20' : 'bg-destructive/5 border-destructive/20'
            }`}>
              {r.ok
                ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{r.name}</p>
                {r.error && <p className="text-[10px] text-destructive">{r.error}</p>}
              </div>
              {r.ok && r.ms > 0 && (
                <span className={`text-[11px] font-mono font-semibold ${latencyColor(r.ms)}`}>{r.ms}ms</span>
              )}
            </div>
          ))}

          {results.some(r => !r.ok) && (
            <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/20 p-3">
              <p className="text-[11px] text-yellow-400 font-semibold mb-1">Connectivity issues detected</p>
              <ul className="text-[10px] text-muted-foreground space-y-1 leading-relaxed">
                <li>• Check your server's internet connection</li>
                <li>• If using a VPN, try disconnecting it temporarily</li>
                <li>• Check if your firewall is blocking outbound HTTPS</li>
                <li>• The service itself may be temporarily down</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Crash Log Tab ─────────────────────────────────────────────────────────────

function CrashLogTab() {
  const [entries, setEntries] = useState<CrashEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crash-log', { credentials: 'include' });
      const data = await res.json() as { entries: CrashEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLog(); }, [fetchLog]);

  const copyAll = async () => {
    if (!entries?.length) return;
    const text = [
      `HomeStream Crash Log — ${new Date().toISOString()}`,
      `Total entries: ${entries.length}`,
      '─'.repeat(60),
      ...entries.map(e => [
        `[${e.timestamp}] ${e.type.toUpperCase()}`,
        `Message: ${e.message}`,
        e.context ? `Context: ${e.context}` : null,
        `Platform: ${e.platform}`,
        `Node: ${e.nodeVersion}  Uptime: ${e.uptime}s`,
        e.stack ? `Stack:\n${e.stack}` : null,
        '─'.repeat(40),
      ].filter(Boolean).join('\n')),
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const clearLog = async () => {
    setClearing(true);
    try {
      await fetch('/api/crash-log?clear=1');
      setEntries([]);
    } finally {
      setClearing(false);
    }
  };

  const typeColor = (type: string) => {
    if (type === 'uncaughtException')   return 'text-destructive bg-destructive/10 border-destructive/20';
    if (type === 'unhandledRejection')  return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (type === 'expressError')        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    return 'text-muted-foreground bg-muted/20 border-border';
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Crash Log
          {entries !== null && entries.length > 0 && (
            <span className="ml-2 text-[9px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full font-bold">{entries.length}</span>
          )}
        </p>
        <button onClick={fetchLog} disabled={loading} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        If HomeStream crashes or behaves unexpectedly, click <strong className="text-foreground/70">Copy All for Support</strong> and paste the result into a GitHub issue or support chat.
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={copyAll}
          disabled={!entries?.length}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-semibold transition-colors disabled:opacity-40"
        >
          {copied ? <><ClipboardCheck className="w-3 h-3" /> Copied!</> : <><ClipboardCopy className="w-3 h-3" /> Copy All for Support</>}
        </button>
        {entries !== null && entries.length > 0 && (
          <button
            onClick={clearLog}
            disabled={clearing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] font-medium transition-colors ml-auto"
          >
            {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Clear
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && entries !== null && entries.length === 0 && (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> No crashes recorded
        </div>
      )}

      {!loading && entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {entries.map(entry => (
            <div key={entry.id} className={`rounded-xl border text-[10px] overflow-hidden ${typeColor(entry.type)}`}>
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full flex items-start gap-2 p-2.5 text-left hover:opacity-80 transition-opacity"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="font-bold uppercase text-[9px] tracking-wide">{entry.type}</span>
                    <span className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="font-mono truncate">{entry.message}</p>
                  {entry.context && <p className="text-muted-foreground truncate">in {entry.context}</p>}
                </div>
                <ChevronRight className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${expanded === entry.id ? 'rotate-90' : ''}`} />
              </button>
              {expanded === entry.id && (
                <div className="px-2.5 pb-2.5 border-t border-current/10">
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex gap-2 text-muted-foreground">
                      <span>Node: {entry.nodeVersion}</span>
                      <span>·</span>
                      <span>Uptime: {entry.uptime}s</span>
                    </div>
                    <p className="text-muted-foreground">{entry.platform}</p>
                    {entry.stack && (
                      <pre className="mt-1.5 p-2 bg-black/30 rounded-lg text-[9px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                        {entry.stack}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Copy Full Diagnostic Report ───────────────────────────────────────────────

function CopyDiagnosticButton({ health, sysInfo }: { health: HealthReport | null; sysInfo: SystemInfo | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const lines: string[] = [
      '═══════════════════════════════════════════════════',
      'HomeStream Diagnostic Report',
      `Generated: ${new Date().toISOString()}`,
      '═══════════════════════════════════════════════════',
      '',
    ];

    if (sysInfo) {
      lines.push('── System ──────────────────────────────────────────');
      lines.push(`Node.js:    ${sysInfo.node}`);
      lines.push(`Platform:   ${sysInfo.platform} / ${sysInfo.arch}`);
      lines.push(`Uptime:     ${fmtUptime(sysInfo.uptime)}`);
      lines.push(`PID:        ${sysInfo.pid}`);
      lines.push(`Heap:       ${sysInfo.memory.heapUsedMb} / ${sysInfo.memory.heapTotalMb} MB`);
      lines.push(`RSS:        ${sysInfo.memory.rssMb} MB`);
      lines.push(`System RAM: ${sysInfo.memory.totalMb - sysInfo.memory.freeMb} / ${sysInfo.memory.totalMb} MB free`);
      lines.push(`CPU:        ${sysInfo.cpu.model} (${sysInfo.cpu.cores} cores)`);
      lines.push(`Load avg:   ${sysInfo.cpu.loadAvg.map(v => v.toFixed(2)).join(' / ')}`);
      lines.push('');
    }

    if (health) {
      lines.push('── Health Checks ───────────────────────────────────');
      lines.push(`Overall: ${(health.overall ?? 'unknown').toUpperCase()}`);
      for (const c of health.checks) {
        lines.push(`  [${(c.status ?? 'unknown').toUpperCase().padEnd(5)}] ${c.name}: ${c.message}`);
        if (c.detail) lines.push(`           ${c.detail}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════');
    lines.push('Paste this into a GitHub issue or support chat.');

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground text-[10px] font-semibold transition-colors"
      title="Copy full diagnostic report to clipboard"
    >
      {copied ? <ClipboardCheck className="w-3 h-3 text-green-400" /> : <ClipboardCopy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy Report'}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function DebugPanel({ open, onClose }: DebugPanelProps) {
  const [tab, setTab] = useState<Tab>('health');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [fetched, setFetched] = useState(false);
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);

  // ── DEVELOPER_LOCK gate ────────────────────────────────────────────────────
  // Dev drawer is only available when DEVELOPER_LOCK=true on the server.
  // On a public/family install (no lock), the drawer is completely absent —
  // no trigger, no gesture, nothing in the DOM.
  const [devLocked, setDevLocked] = useState(false);

  useEffect(() => {
    // Check once on mount — result is stable for the lifetime of the session
    fetch('/api/admin/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { developerLock?: boolean } | null) => {
        if (data?.developerLock) setDevLocked(true);
      })
      .catch(() => {});
  }, []);

  // ── Electron IPC: Ctrl+Shift+Alt+D shortcut ───────────────────────────────
  // When running inside the packaged Electron app, the main process registers
  // a global keyboard shortcut and sends 'toggle-dev-drawer' via IPC.
  // This lets you open the drawer from anywhere on your home server — even
  // when the browser window is not focused.
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { onToggleDevDrawer?: (cb: () => void) => void } }).electronAPI;
    if (!api?.onToggleDevDrawer) return;
    api.onToggleDevDrawer(() => {
      if (devLocked) setDevDrawerOpen(v => !v);
    });
  }, [devLocked]);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health/full', { credentials: 'include' });
      const data = await res.json() as HealthReport;
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fetchSysInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/debug/system-info', { credentials: 'include' });
      const data = await res.json() as SystemInfo;
      setSysInfo(data);
    } catch { /* ignore */ }
  }, []);

  // Auto-fetch when panel first opens
  if (open && !fetched) {
    setFetched(true);
    void fetchHealth();
    void fetchSysInfo();
  }

  // Reset fetched flag when closed so it re-fetches on next open
  useEffect(() => {
    if (!open) setFetched(false);
  }, [open]);

  const healthBadge = health?.overall === 'error' ? 'error' : health?.overall === 'warn' ? 'warn' : undefined;
  const crashBadge  = undefined; // loaded lazily in CrashLogTab

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Debug &amp; Diagnostics</span>
                {health && health.overall && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    health.overall === 'ok'    ? 'bg-green-500/20 text-green-400' :
                    health.overall === 'warn'  ? 'bg-yellow-500/20 text-yellow-400' :
                                                 'bg-destructive/20 text-destructive'
                  }`}>
                    {health.overall.toUpperCase()}
                  </span>
                )}
                {/* Secret dev trigger — only rendered when DEVELOPER_LOCK=true.
                    Shift+hold the version number for 2s to open the dev drawer.
                    On a public/family install this element is completely absent. */}
                {devLocked && (
                  <DevVersionTrigger
                    version="1.1.0"
                    onUnlock={() => setDevDrawerOpen(v => !v)}
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <CopyDiagnosticButton health={health} sysInfo={sysInfo} />
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-shrink-0 bg-background/50">
              <TabBtn active={tab === 'health'}  onClick={() => setTab('health')}  icon={Activity}  label="Health"  badge={healthBadge} />
              <TabBtn active={tab === 'fixes'}   onClick={() => setTab('fixes')}   icon={Wrench}    label="Fixes" />
              <TabBtn active={tab === 'system'}  onClick={() => setTab('system')}  icon={Cpu}       label="System" />
              <TabBtn active={tab === 'network'} onClick={() => setTab('network')} icon={Globe}     label="Network" />
              <TabBtn active={tab === 'crashes'} onClick={() => setTab('crashes')} icon={Bug}       label="Crashes" badge={crashBadge} />
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {/* Hidden dev drawer — only available when DEVELOPER_LOCK=true.
                  Opened by: Shift+hold version number (browser) or
                  Ctrl+Shift+Alt+D global shortcut (Electron on home server). */}
              <AnimatePresence>
                {devLocked && devDrawerOpen && (
                  <div className="p-3 border-b border-violet-500/20">
                    <React.Suspense fallback={null}>
                      <DevDrawer onClose={() => setDevDrawerOpen(false)} />
                    </React.Suspense>
                  </div>
                )}
              </AnimatePresence>

              {tab === 'health'  && <HealthTab health={health} loading={healthLoading} onRefresh={fetchHealth} />}
              {tab === 'fixes'   && <QuickFixesTab />}
              {tab === 'system'  && <SystemTab />}
              {tab === 'network' && <NetworkTab />}
              {tab === 'crashes' && <CrashLogTab />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
