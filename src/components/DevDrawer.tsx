/**
 * DevDrawer — Hidden developer control panel inside the Debug Panel.
 *
 * HOW TO OPEN:
 *   Hold Shift and click the version number in the Debug Panel for 2 seconds.
 *   A glowing border appears while you hold. Release → drawer opens.
 *
 * WHAT IT DOES:
 *   • Cut Release — bumps version (patch/minor/major), commits, tags, pushes
 *     to GitHub. GitHub Actions builds the .exe automatically.
 *   • Copy Diagnostics — fetches /api/dev/diagnostics and copies to clipboard.
 *     Paste into AI chat for instant bug context.
 *   • View Logs — fetches /api/dev/logs and shows last 100 lines inline.
 *   • Copy Logs — copies log output to clipboard for pasting into AI chat.
 *
 * SECURITY:
 *   All endpoints require admin auth (session cookie).
 *   Release endpoint additionally requires DEVELOPER_LOCK=true.
 *   The drawer is invisible to regular users — no UI element reveals it.
 */

import { useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Terminal, ClipboardCopy, ClipboardCheck,
  Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Rocket, Eye, EyeOff,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type BumpType = 'patch' | 'minor' | 'major';

interface ReleaseResult {
  success: boolean;
  version?: string;
  previousVersion?: string;
  output?: string;
  error?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  stack?: string;
}

// ── Version hold trigger ───────────────────────────────────────────────────────

interface VersionTriggerProps {
  version: string;
  onUnlock: () => void;
}

export function DevVersionTrigger({ version, onUnlock }: VersionTriggerProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_MS = 2000;

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!('shiftKey' in e) || !e.shiftKey) return;
    setHolding(true);
    holdStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(elapsed / HOLD_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(timerRef.current!);
        setHolding(false);
        setProgress(0);
        onUnlock();
      }
    }, 16);
  }, [onUnlock]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setHolding(false);
    setProgress(0);
  }, []);

  return (
    <span
      className="relative cursor-pointer select-none"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold as unknown as React.TouchEventHandler}
      onTouchEnd={cancelHold}
      title="Shift+hold to open dev tools"
    >
      {/* Progress ring while holding */}
      {holding && (
        <span
          className="absolute inset-0 rounded"
          style={{
            background: `conic-gradient(rgb(139 92 246) ${progress * 360}deg, transparent 0deg)`,
            opacity: 0.6,
            borderRadius: 3,
          }}
        />
      )}
      <span className={`relative text-xs font-mono px-1 rounded transition-colors ${
        holding ? 'text-violet-300' : 'text-muted-foreground hover:text-foreground'
      }`}>
        v{version}
      </span>
    </span>
  );
}

// ── Main DevDrawer ─────────────────────────────────────────────────────────────

interface DevDrawerProps {
  onClose: () => void;
}

export function DevDrawer({ onClose }: DevDrawerProps) {
  const [bump, setBump] = useState<BumpType>('patch');
  const [releasing, setReleasing] = useState(false);
  const [releaseResult, setReleaseResult] = useState<ReleaseResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const [loadingDiag, setLoadingDiag] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);

  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);

  // ── Release ────────────────────────────────────────────────────────────────

  const cutRelease = async () => {
    if (releasing) return;
    setReleasing(true);
    setReleaseResult(null);
    try {
      const res = await fetch('/api/dev/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bump }),
      });
      const data = await res.json() as ReleaseResult;
      setReleaseResult(data);
      setShowOutput(true);
    } catch (err) {
      setReleaseResult({ success: false, error: String(err) });
    } finally {
      setReleasing(false);
    }
  };

  // ── Diagnostics ────────────────────────────────────────────────────────────

  const copyDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const res = await fetch('/api/dev/diagnostics', { credentials: 'include' });
      const data = await res.json() as unknown;
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setDiagCopied(true);
      setTimeout(() => setDiagCopied(false), 3000);
    } catch (err) {
      alert(`Failed to copy diagnostics: ${err}`);
    } finally {
      setLoadingDiag(false);
    }
  };

  // ── Logs ───────────────────────────────────────────────────────────────────

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/dev/logs?lines=100', { credentials: 'include' });
      const data = await res.json() as { logs: LogEntry[] };
      setLogs(data.logs);
      setShowLogs(true);
    } catch (err) {
      alert(`Failed to fetch logs: ${err}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  const copyLogs = async () => {
    if (!logs) return;
    const text = logs.map(l =>
      `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.stack ? '\n' + l.stack : ''}`
    ).join('\n');
    await navigator.clipboard.writeText(text);
    setLogsCopied(true);
    setTimeout(() => setLogsCopied(false), 3000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="border border-violet-500/40 rounded-lg bg-violet-950/30 p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs font-semibold text-violet-300 uppercase tracking-widest">
            Dev Tools
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          close
        </button>
      </div>

      {/* ── Cut Release ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Cut Release</p>
        <div className="flex gap-2 items-center">
          {/* Bump selector */}
          <div className="flex rounded-md overflow-hidden border border-border text-xs">
            {(['patch', 'minor', 'major'] as BumpType[]).map(b => (
              <button
                key={b}
                onClick={() => setBump(b)}
                className={`px-2.5 py-1 transition-colors ${
                  bump === b
                    ? 'bg-violet-600 text-white'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <button
            onClick={cutRelease}
            disabled={releasing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {releasing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Rocket className="w-3.5 h-3.5" />
            }
            {releasing ? 'Releasing…' : 'Cut Release'}
          </button>
        </div>

        {/* Release result */}
        {releaseResult && (
          <div className={`rounded-md p-2 text-xs space-y-1 ${
            releaseResult.success
              ? 'bg-green-950/40 border border-green-500/30'
              : 'bg-red-950/40 border border-red-500/30'
          }`}>
            <div className="flex items-center gap-1.5">
              {releaseResult.success
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <XCircle className="w-3.5 h-3.5 text-red-400" />
              }
              <span className={releaseResult.success ? 'text-green-300' : 'text-red-300'}>
                {releaseResult.success
                  ? `Released ${releaseResult.version} (was ${releaseResult.previousVersion})`
                  : releaseResult.error
                }
              </span>
            </div>
            {releaseResult.output && (
              <button
                onClick={() => setShowOutput(v => !v)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {showOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showOutput ? 'Hide' : 'Show'} output
              </button>
            )}
            {showOutput && releaseResult.output && (
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-black/30 rounded p-2 max-h-40 overflow-y-auto">
                {releaseResult.output}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/50" />

      {/* ── Diagnostics ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">AI Diagnostics</p>
        <p className="text-[10px] text-muted-foreground">
          Copy a full system snapshot → paste into AI chat for instant bug context.
        </p>
        <button
          onClick={copyDiagnostics}
          disabled={loadingDiag}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border hover:border-violet-500/50 text-xs text-foreground transition-colors disabled:opacity-50"
        >
          {loadingDiag
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : diagCopied
              ? <ClipboardCheck className="w-3.5 h-3.5 text-green-400" />
              : <ClipboardCopy className="w-3.5 h-3.5" />
          }
          {diagCopied ? 'Copied!' : 'Copy Diagnostics'}
        </button>
      </div>

      <div className="border-t border-border/50" />

      {/* ── Logs ─────────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Server Logs</p>
        <div className="flex gap-2">
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border hover:border-violet-500/50 text-xs text-foreground transition-colors disabled:opacity-50"
          >
            {loadingLogs
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : showLogs
                ? <EyeOff className="w-3.5 h-3.5" />
                : <Eye className="w-3.5 h-3.5" />
            }
            {showLogs ? 'Refresh Logs' : 'View Logs'}
          </button>

          {logs && (
            <button
              onClick={copyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border hover:border-violet-500/50 text-xs text-foreground transition-colors"
            >
              {logsCopied
                ? <ClipboardCheck className="w-3.5 h-3.5 text-green-400" />
                : <ClipboardCopy className="w-3.5 h-3.5" />
              }
              {logsCopied ? 'Copied!' : 'Copy Logs'}
            </button>
          )}
        </div>

        {showLogs && logs && (
          <div className="rounded-md bg-black/40 border border-border/50 p-2 max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No logs captured yet.</p>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="flex gap-2 text-[10px] font-mono leading-relaxed">
                  <span className="text-muted-foreground shrink-0">
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 w-10 ${
                    l.level === 'error' ? 'text-red-400' :
                    l.level === 'warn'  ? 'text-yellow-400' :
                    'text-muted-foreground'
                  }`}>
                    {l.level.toUpperCase()}
                  </span>
                  <span className="text-foreground/80 break-all">{l.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-muted-foreground/50 text-center">
        <Terminal className="w-3 h-3 inline mr-1" />
        Dev tools — not visible to regular users
      </p>
    </motion.div>
  );
}
