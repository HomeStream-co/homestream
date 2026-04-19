/**
 * DebugPanel — floating debug/health overlay
 *
 * Accessible from the header (wrench icon). Shows:
 *  - Live subsystem health checks (library, config, qBit, TMDB, Ollama, Torrentio, downloads)
 *  - Quick-fix actions (clear stuck transcodes, reset TMDB cache, clear errored jobs)
 *  - App size info
 *
 * Opens as a slide-in panel from the right.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, Wrench, Loader2, ChevronRight, Trash2,
  Database, Wifi, Download, Cpu, Film, Server,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubsystemStatus = 'ok' | 'warn' | 'error' | 'unknown';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, className = 'w-4 h-4' }: { status: SubsystemStatus; className?: string }) {
  if (status === 'ok') return <CheckCircle2 className={`${className} text-green-400`} />;
  if (status === 'warn') return <AlertTriangle className={`${className} text-yellow-400`} />;
  if (status === 'error') return <XCircle className={`${className} text-destructive`} />;
  return <HelpCircle className={`${className} text-muted-foreground`} />;
}

function statusColor(status: SubsystemStatus) {
  if (status === 'ok') return 'text-green-400';
  if (status === 'warn') return 'text-yellow-400';
  if (status === 'error') return 'text-destructive';
  return 'text-muted-foreground';
}

function subsystemIcon(name: string) {
  if (name.includes('Library')) return <Film className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Config')) return <Server className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('qBit')) return <Download className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('TMDB')) return <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Ollama')) return <Cpu className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Torrentio')) return <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.includes('Download')) return <Database className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Server className="w-3.5 h-3.5 text-muted-foreground" />;
}

// ── Quick-fix actions ─────────────────────────────────────────────────────────

interface QuickFix {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => Promise<string>;
  variant?: 'default' | 'destructive';
}

function useQuickFixes(onRefresh: () => void): QuickFix[] {
  return [
    {
      id: 'clear_stuck',
      label: 'Clear Stuck Transcodes',
      description: 'Resets library items stuck with transcoding:true',
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      action: async () => {
        const res = await fetch('/api/media', { method: 'GET' });
        const data = await res.json() as { items?: { id: string; transcoding?: boolean }[] };
        const stuck = (data.items ?? []).filter(m => m.transcoding);
        await Promise.all(stuck.map(m =>
          fetch(`/api/media/${m.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcoding: false }),
          })
        ));
        onRefresh();
        return stuck.length > 0 ? `Cleared ${stuck.length} stuck item(s)` : 'No stuck items found';
      },
    },
    {
      id: 'refresh_tmdb',
      label: 'Force Refresh TMDB Cache',
      description: 'Clears the 30-day TMDB cache and re-fetches now',
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      action: async () => {
        const res = await fetch('/api/tmdb?force=true');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return 'TMDB cache refreshed';
      },
    },
    {
      id: 'clear_errored',
      label: 'Clear Errored Downloads',
      description: 'Removes failed download jobs from the queue',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      variant: 'destructive',
      action: async () => {
        const res = await fetch('/api/stremio/downloads');
        const data = await res.json() as { jobs?: { jobId: string; status: string }[] };
        const errored = (data.jobs ?? []).filter(j => j.status === 'error');
        await Promise.all(errored.map(j =>
          fetch(`/api/stremio/downloads/${j.jobId}`, { method: 'DELETE' })
        ));
        onRefresh();
        return errored.length > 0 ? `Removed ${errored.length} errored job(s)` : 'No errored jobs found';
      },
    },
    {
      id: 'restart_watcher',
      label: 'Re-run Startup Cleanup',
      description: 'Re-runs the startup cleanup routine (fixes orphaned state)',
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      action: async () => {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return 'Cleanup triggered — check logs';
      },
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function DebugPanel({ open, onClose }: DebugPanelProps) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixResults, setFixResults] = useState<Record<string, { msg: string; ok: boolean }>>({});
  const [runningFix, setRunningFix] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

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

  // Auto-fetch when panel first opens
  const [fetched, setFetched] = useState(false);
  if (open && !fetched) { setFetched(true); fetchHealth(); }

  const quickFixes = useQuickFixes(fetchHealth);

  const runFix = async (fix: QuickFix) => {
    setRunningFix(fix.id);
    setFixResults(r => ({ ...r, [fix.id]: { msg: '', ok: true } }));
    try {
      const msg = await fix.action();
      setFixResults(r => ({ ...r, [fix.id]: { msg, ok: true } }));
    } catch (err) {
      setFixResults(r => ({ ...r, [fix.id]: { msg: String(err), ok: false } }));
    } finally {
      setRunningFix(null);
    }
  };

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
                <span className="text-sm font-semibold text-foreground">Debug Panel</span>
                {health && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    health.overall === 'ok' ? 'bg-green-500/20 text-green-400' :
                    health.overall === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-destructive/20 text-destructive'
                  }`}>
                    {health.overall.toUpperCase()}
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

            <div className="flex-1 overflow-y-auto">

              {/* ── Health Checks ── */}
              <div className="p-4 border-b border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Health</p>

                {loading && !health && (
                  <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running checks…
                  </div>
                )}

                {!loading && !health && (
                  <p className="text-xs text-muted-foreground text-center py-4">Failed to load health data</p>
                )}

                {health && (
                  <div className="flex flex-col gap-1.5">
                    {health.checks.map(check => (
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
                )}

                {health && (
                  <p className="text-[9px] text-muted-foreground mt-3 text-right">
                    Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>

              {/* ── Quick Fixes ── */}
              <div className="p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Fixes</p>

                <div className="flex flex-col gap-2">
                  {quickFixes.map(fix => (
                    <div key={fix.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                      <div className="flex items-start gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{fix.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fix.description}</p>
                          {fixResults[fix.id]?.msg && (
                            <p className={`text-[10px] mt-1.5 font-medium ${fixResults[fix.id].ok ? 'text-green-400' : 'text-destructive'}`}>
                              {fixResults[fix.id].ok ? '✓ ' : '✗ '}{fixResults[fix.id].msg}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => runFix(fix)}
                          disabled={runningFix === fix.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors flex-shrink-0 disabled:opacity-50 ${
                            fix.variant === 'destructive'
                              ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive'
                              : 'bg-primary/20 hover:bg-primary/30 text-primary'
                          }`}
                        >
                          {runningFix === fix.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : fix.icon
                          }
                          Run
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── App Info ── */}
              <div className="p-4 border-t border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">App Info</p>
                <div className="flex flex-col gap-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source code</span>
                    <span className="text-foreground font-mono">~21k lines</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Docker image (approx)</span>
                    <span className="text-foreground font-mono">~180 MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Node modules</span>
                    <span className="text-foreground font-mono">~410 MB (dev only)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Built bundle</span>
                    <span className="text-foreground font-mono">~2–4 MB</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-2 leading-relaxed">
                    node_modules are dev-only and not included in the Docker image. The production build bundles everything into a single ~2–4 MB server file + frontend assets.
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
