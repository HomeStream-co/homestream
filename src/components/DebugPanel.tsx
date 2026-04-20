/**
 * DebugPanel — floating debug/health overlay
 *
 * Accessible from the header (wrench icon). Four tabs:
 *
 *  1. Health    — live subsystem checks with smart "Fix It" suggestions
 *  2. Repair    — one-click fix actions for common stuck states
 *  3. System    — live runtime stats (memory, CPU, uptime, Node version)
 *  4. Logs      — crash log viewer with copy-for-support
 *
 * Design goals:
 *  - Any user should be able to get themselves unstuck without reading docs
 *  - Problems surface automatically with a direct "Fix It" button
 *  - Network connectivity test built-in
 *  - All actions show clear before/after feedback
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, Wrench, Loader2, ChevronRight, Trash2,
  Database, Wifi, Download, Cpu, Film, Server,
  ClipboardCopy, ClipboardCheck, Bug,
  Activity, Zap, MemoryStick, Clock, Terminal,
  Network, RotateCcw, ShieldAlert, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubsystemStatus = 'ok' | 'warn' | 'error' | 'unknown';
type Tab = 'health' | 'repair' | 'system' | 'logs';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, className = 'w-4 h-4' }: { status: SubsystemStatus; className?: string }) {
  if (status === 'ok')      return <CheckCircle2 className={`${className} text-green-400`} />;
  if (status === 'warn')    return <AlertTriangle className={`${className} text-yellow-400`} />;
  if (status === 'error')   return <XCircle className={`${className} text-destructive`} />;
  return <HelpCircle className={`${className} text-muted-foreground`} />;
}

function statusColor(status: SubsystemStatus) {
  if (status === 'ok')    return 'text-green-400';
  if (status === 'warn')  return 'text-yellow-400';
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
  if (name.includes('FFmpeg'))   return <Terminal className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Server className="w-3.5 h-3.5 text-muted-foreground" />;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function MemBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 85 ? 'bg-destructive' : pct > 65 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono">{used} / {total} MB <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Smart fix suggestions ─────────────────────────────────────────────────────
// Maps health check problems to the repair action that fixes them

function getSuggestedFix(check: SubsystemCheck): { action: string; label: string } | null {
  if (check.status === 'ok') return null;
  const n = check.name;
  const m = check.message.toLowerCase();
  if (n.includes('Library') && m.includes('stuck')) return { action: 'clear_stuck_transcodes', label: 'Clear Stuck Transcodes' };
  if (n.includes('Download') && m.includes('error')) return { action: 'clear_errored_downloads', label: 'Clear Errored Downloads' };
  if (n.includes('Download') && m.includes('stuck')) return { action: 'clear_stuck_queued', label: 'Clear Stuck Queue' };
  if (n.includes('TMDB') && (m.includes('fail') || m.includes('error'))) return { action: 'test_network', label: 'Test Network' };
  if (n.includes('Config') && m.includes('setup')) return null; // handled by setup wizard link
  if (n.includes('FFmpeg') && m.includes('not found')) return null; // install guide
  return null;
}

// ── Repair actions definition ─────────────────────────────────────────────────

interface RepairAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  variant?: 'default' | 'destructive' | 'warning';
  confirmLabel?: string; // if set, requires a confirm step
}

const REPAIR_ACTIONS: RepairAction[] = [
  {
    id: 'clear_stuck_transcodes',
    label: 'Clear Stuck Transcodes',
    description: 'Resets library items stuck with a "transcoding" flag — fixes videos that won\'t play.',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_errored_downloads',
    label: 'Clear Errored Downloads',
    description: 'Removes failed download jobs from the queue so you can retry them.',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'warning',
  },
  {
    id: 'clear_stuck_queued',
    label: 'Clear Stuck Queue',
    description: 'Removes queued download jobs that have been waiting more than 30 minutes.',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    variant: 'warning',
  },
  {
    id: 'reset_hls_sessions',
    label: 'Reset HLS Sessions',
    description: 'Kills all active video transcode sessions. Fixes buffering or "video won\'t start" issues.',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_tmdb_cache',
    label: 'Refresh Metadata Cache',
    description: 'Forces all movie/show artwork and info to re-fetch from TMDB on next view.',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  {
    id: 'test_network',
    label: 'Test Network Connectivity',
    description: 'Pings TMDB, Torrentio, and OpenSubtitles to check if external services are reachable.',
    icon: <Network className="w-3.5 h-3.5" />,
  },
  {
    id: 'reindex_library',
    label: 'Re-index Library',
    description: 'Opens the Setup Wizard to re-scan your media folder and add new files.',
    icon: <Database className="w-3.5 h-3.5" />,
  },
  {
    id: 'clear_watch_progress',
    label: 'Reset All Watch Progress',
    description: 'Wipes server-side watch progress for every title. Cannot be undone.',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    variant: 'destructive',
    confirmLabel: 'Yes, reset all progress',
  },
];

// ── Repair Tab ────────────────────────────────────────────────────────────────

function RepairTab({ onRefreshHealth }: { onRefreshHealth: () => void }) {
  const [results, setResults] = useState<Record<string, { msg: string; ok: boolean }>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const runAction = async (id: string) => {
    setRunning(id);
    setConfirming(null);
    try {
      const res = await fetch('/api/debug/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: id }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setResults(r => ({ ...r, [id]: { msg: data.message, ok: data.ok } }));
      if (data.ok) onRefreshHealth();
    } catch (err) {
      setResults(r => ({ ...r, [id]: { msg: String(err), ok: false } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-2.5">
      <p className="text-[10px] text-muted-foreground leading-relaxed mb-1">
        These actions fix the most common stuck states. All are safe to run — they only clear flags or queued jobs, never delete your media files.
      </p>

      {REPAIR_ACTIONS.map(action => {
        const result = results[action.id];
        const isRunning = running === action.id;
        const isConfirming = confirming === action.id;

        const btnClass = action.variant === 'destructive'
          ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive'
          : action.variant === 'warning'
          ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400'
          : 'bg-primary/20 hover:bg-primary/30 text-primary';

        return (
          <div key={action.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="flex items-start gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{action.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
                {result?.msg && (
                  <p className={`text-[10px] mt-1.5 font-medium ${result.ok ? 'text-green-400' : 'text-destructive'}`}>
                    {result.ok ? '✓ ' : '✗ '}{result.msg}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {isConfirming ? (
                  <>
                    <button
                      onClick={() => runAction(action.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive/30 hover:bg-destructive/50 text-destructive text-[10px] font-semibold transition-colors"
                    >
                      {action.confirmLabel ?? 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="text-[10px] text-muted-foreground hover:text-foreground text-center transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => action.confirmLabel ? setConfirming(action.id) : runAction(action.id)}
                    disabled={isRunning || running !== null}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-40 ${btnClass}`}
                  >
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : action.icon}
                    Run
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────────────────────────

function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/debug/system-info');
      const data = await res.json() as SystemInfo;
      setInfo(data);
      setLastFetched(new Date());
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const t = setInterval(fetch_, 10_000);
    return () => clearInterval(t);
  }, [fetch_]);

  const platformLabel = (p: string) => ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[p] ?? p);

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Runtime Statistics</p>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[9px] text-muted-foreground">
              Updated {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetch_}
            disabled={loading}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !info && (
        <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {info && (
        <>
          {/* Identity row */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: <Server className="w-3.5 h-3.5" />, label: 'Platform', value: `${platformLabel(info.platform)} ${info.arch}` },
              { icon: <Terminal className="w-3.5 h-3.5" />, label: 'Node.js', value: info.node },
              { icon: <Clock className="w-3.5 h-3.5" />, label: 'Uptime', value: formatUptime(info.uptime) },
              { icon: <Activity className="w-3.5 h-3.5" />, label: 'PID', value: String(info.pid) },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/20 border border-border">
                <span className="text-muted-foreground">{icon}</span>
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-xs font-mono text-foreground truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Memory */}
          <div className="rounded-xl border border-border bg-muted/10 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Memory</p>
            </div>
            <MemBar used={info.memory.heapUsedMb} total={info.memory.heapTotalMb} label="JS Heap" />
            <MemBar used={info.memory.rssMb} total={info.memory.totalMb} label="Process RSS / System" />
            <div className="flex justify-between text-[10px] pt-0.5">
              <span className="text-muted-foreground">System free</span>
              <span className="text-foreground font-mono">{info.memory.freeMb} MB</span>
            </div>
          </div>

          {/* CPU */}
          <div className="rounded-xl border border-border bg-muted/10 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CPU</p>
            </div>
            <p className="text-[10px] text-foreground font-mono truncate">{info.cpu.model}</p>
            <div className="flex gap-4 text-[10px]">
              <div>
                <span className="text-muted-foreground">Cores </span>
                <span className="text-foreground font-mono">{info.cpu.cores}</span>
              </div>
              {info.cpu.loadAvg[0] > 0 && (
                <>
                  <div>
                    <span className="text-muted-foreground">Load 1m </span>
                    <span className="text-foreground font-mono">{info.cpu.loadAvg[0].toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">5m </span>
                    <span className="text-foreground font-mono">{info.cpu.loadAvg[1].toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Environment */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/10 border border-border text-[10px]">
            <span className="text-muted-foreground">Environment</span>
            <span className={`font-mono font-semibold ${info.env === 'production' ? 'text-green-400' : 'text-yellow-400'}`}>
              {info.env}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Crash Log Tab ─────────────────────────────────────────────────────────────

function LogsTab() {
  const [entries, setEntries] = useState<CrashEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crash-log');
      const data = await res.json() as { entries: CrashEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

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
      await fetch('/api/debug/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_crash_log' }),
      });
      setEntries([]);
    } finally {
      setClearing(false);
    }
  };

  const typeColor = (type: string) => {
    if (type === 'uncaughtException')  return 'text-destructive bg-destructive/10 border-destructive/20';
    if (type === 'unhandledRejection') return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (type === 'expressError')       return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    return 'text-muted-foreground bg-muted/20 border-border';
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={fetchLog}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[10px] font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={copyAll}
          disabled={!entries?.length}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-semibold transition-colors disabled:opacity-40"
        >
          {copied
            ? <><ClipboardCheck className="w-3 h-3" /> Copied!</>
            : <><ClipboardCopy className="w-3 h-3" /> Copy All for Support</>
          }
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

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        If HomeStream crashes or behaves unexpectedly, click <strong className="text-foreground/70">Copy All for Support</strong> and paste the result into a GitHub issue or support chat. Includes full stack traces, platform info, and timing.
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading crash log…
        </div>
      )}

      {!loading && entries !== null && entries.length === 0 && (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> No crashes recorded
        </div>
      )}

      {!loading && entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
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

// ── Health Tab ────────────────────────────────────────────────────────────────

function HealthTab({
  health,
  loading,
  onRefresh,
  onRunFix,
  fixResults,
  runningFix,
}: {
  health: HealthReport | null;
  loading: boolean;
  onRefresh: () => void;
  onRunFix: (action: string) => void;
  fixResults: Record<string, { msg: string; ok: boolean }>;
  runningFix: string | null;
}) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  return (
    <div className="p-4 flex flex-col gap-3">
      {loading && !health && (
        <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Running checks…
        </div>
      )}

      {!loading && !health && (
        <div className="flex flex-col items-center gap-3 py-6">
          <XCircle className="w-8 h-8 text-destructive" />
          <p className="text-xs text-muted-foreground text-center">Failed to load health data.<br />Is the server running?</p>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {health && (
        <>
          {/* Overall status banner */}
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${
            health.overall === 'ok'
              ? 'bg-green-500/10 border-green-500/20'
              : health.overall === 'warn'
              ? 'bg-yellow-500/10 border-yellow-500/20'
              : 'bg-destructive/10 border-destructive/20'
          }`}>
            <StatusIcon status={health.overall} className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${statusColor(health.overall)}`}>
                {health.overall === 'ok'
                  ? 'All systems operational'
                  : health.overall === 'warn'
                  ? 'Some systems need attention'
                  : 'Critical issues detected'}
              </p>
              <p className="text-[9px] text-muted-foreground">
                {health.checks.filter(c => c.status !== 'ok').length} issue{health.checks.filter(c => c.status !== 'ok').length !== 1 ? 's' : ''} found · checked {new Date(health.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Individual checks */}
          <div className="flex flex-col gap-1">
            {health.checks.map(check => {
              const fix = getSuggestedFix(check);
              const fixResult = fix ? fixResults[fix.action] : null;
              return (
                <div key={check.name}>
                  <button
                    onClick={() => setExpandedCheck(expandedCheck === check.name ? null : check.name)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <StatusIcon status={check.status} className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {subsystemIcon(check.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{check.name}</p>
                      <p className={`text-[10px] ${statusColor(check.status)} truncate`}>{check.message}</p>
                    </div>
                    {(check.detail || fix) && (
                      <ChevronRight className={`w-3 h-3 text-muted-foreground flex-shrink-0 transition-transform ${expandedCheck === check.name ? 'rotate-90' : ''}`} />
                    )}
                  </button>

                  {expandedCheck === check.name && (
                    <div className="mx-3 mb-1 px-3 py-2.5 rounded-lg bg-muted/30 border border-border flex flex-col gap-2">
                      {check.detail && (
                        <p className="text-[10px] text-muted-foreground font-mono break-all">{check.detail}</p>
                      )}
                      {fix && (
                        <div className="flex items-center gap-2">
                          <Zap className="w-3 h-3 text-primary flex-shrink-0" />
                          <p className="text-[10px] text-primary flex-1">Suggested fix: {fix.label}</p>
                          <button
                            onClick={() => onRunFix(fix.action)}
                            disabled={runningFix === fix.action}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-semibold transition-colors disabled:opacity-50"
                          >
                            {runningFix === fix.action
                              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              : <Zap className="w-2.5 h-2.5" />
                            }
                            Fix It
                          </button>
                        </div>
                      )}
                      {fixResult?.msg && (
                        <p className={`text-[10px] font-medium ${fixResult.ok ? 'text-green-400' : 'text-destructive'}`}>
                          {fixResult.ok ? '✓ ' : '✗ '}{fixResult.msg}
                        </p>
                      )}
                      {check.name.includes('Config') && check.message.toLowerCase().includes('setup') && (
                        <a href="/setup" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                          <ChevronRight className="w-2.5 h-2.5" /> Open Setup Wizard
                        </a>
                      )}
                      {check.name.includes('FFmpeg') && check.status === 'error' && (
                        <p className="text-[10px] text-muted-foreground">
                          Install FFmpeg from <span className="font-mono text-foreground/70">ffmpeg.org</span> or set the <span className="font-mono text-foreground/70">FFMPEG_PATH</span> environment variable.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'health', label: 'Health',  icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'repair', label: 'Repair',  icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: 'system', label: 'System',  icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: 'logs',   label: 'Logs',    icon: <Bug className="w-3.5 h-3.5" /> },
];

export default function DebugPanel({ open, onClose }: DebugPanelProps) {
  const [tab, setTab] = useState<Tab>('health');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixResults, setFixResults] = useState<Record<string, { msg: string; ok: boolean }>>({});
  const [runningFix, setRunningFix] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState<number | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health/full');
      const data = await res.json() as HealthReport;
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch crash count for badge on Logs tab
  const fetchCrashCount = useCallback(async () => {
    try {
      const res = await fetch('/api/crash-log');
      const data = await res.json() as { count: number };
      setCrashCount(data.count ?? 0);
    } catch { /* ignore */ }
  }, []);

  // Auto-fetch when panel first opens
  const [fetched, setFetched] = useState(false);
  if (open && !fetched) {
    setFetched(true);
    fetchHealth();
    fetchCrashCount();
  }
  if (!open && fetched) setFetched(false);

  const runFix = async (action: string) => {
    setRunningFix(action);
    try {
      const res = await fetch('/api/debug/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setFixResults(r => ({ ...r, [action]: { msg: data.message, ok: data.ok } }));
      if (data.ok) fetchHealth();
    } catch (err) {
      setFixResults(r => ({ ...r, [action]: { msg: String(err), ok: false } }));
    } finally {
      setRunningFix(null);
    }
  };

  // Issue count badge on Health tab
  const issueCount = health ? health.checks.filter(c => c.status !== 'ok').length : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          {/* Panel */}
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
                <span className="text-sm font-semibold text-foreground">Diagnostics</span>
                {health && issueCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    health.overall === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {issueCount} issue{issueCount !== 1 ? 's' : ''}
                  </span>
                )}
                {health && issueCount === 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                    All OK
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={fetchHealth}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Refresh health checks"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative ${
                    tab === t.id
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {/* Badges */}
                  {t.id === 'health' && issueCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  )}
                  {t.id === 'logs' && crashCount != null && crashCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-destructive" />
                  )}
                  {tab === t.id && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {tab === 'health' && (
                <HealthTab
                  health={health}
                  loading={loading}
                  onRefresh={fetchHealth}
                  onRunFix={runFix}
                  fixResults={fixResults}
                  runningFix={runningFix}
                />
              )}
              {tab === 'repair' && (
                <RepairTab onRefreshHealth={fetchHealth} />
              )}
              {tab === 'system' && <SystemTab />}
              {tab === 'logs' && <LogsTab />}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2.5 border-t border-border flex-shrink-0 flex items-center gap-1.5">
              <Info className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Health checks run in parallel with 5s timeouts. Repair actions are safe and reversible unless marked destructive.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
