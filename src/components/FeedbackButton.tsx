/**
 * FeedbackButton
 *
 * In-app feedback form with two modes:
 *
 * 1. SUBMIT — Posts a GitHub Issue directly to the HomeStream repo via
 *    POST /api/feedback. Auto-fills version, current page, and OS.
 *
 * 2. COPY DIAGNOSTIC REPORT — Generates a structured plain-text snapshot
 *    (version, OS, page, recent console errors, localStorage state, network
 *    status) that the user can paste into a chat with Airo or a GitHub issue.
 *    Designed for testers who can't submit issues directly (no GH_TOKEN).
 *
 * Used by testers to report bugs without leaving the app.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquarePlus, X, Send, Check, Loader2,
  Bug, Sparkles, Tv2, Zap, MessageCircle, ChevronDown,
  ClipboardCopy, ClipboardCheck, Terminal, Wifi, WifiOff,
  AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackType = 'bug' | 'feature' | 'casting' | 'performance' | 'other';

interface FeedbackTypeOption {
  id: FeedbackType;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}

const TYPES: FeedbackTypeOption[] = [
  {
    id: 'bug',
    label: 'Bug Report',
    icon: <Bug className="w-4 h-4" />,
    placeholder: 'What happened? What did you expect to happen? Steps to reproduce…',
  },
  {
    id: 'casting',
    label: 'Casting Issue',
    icon: <Tv2 className="w-4 h-4" />,
    placeholder: 'Which TV / device? What happened when you tried to cast? Any error messages?',
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: <Zap className="w-4 h-4" />,
    placeholder: 'What was slow or stuttering? Which file / codec? Approx file size?',
  },
  {
    id: 'feature',
    label: 'Feature Request',
    icon: <Sparkles className="w-4 h-4" />,
    placeholder: 'Describe the feature and why it would be useful…',
  },
  {
    id: 'other',
    label: 'Other',
    icon: <MessageCircle className="w-4 h-4" />,
    placeholder: 'Anything else on your mind…',
  },
];

// ── Console error capture (module-level singleton) ────────────────────────────
// Intercepts console.error calls so we can include the last N errors in the
// diagnostic report. Installed once when the module first loads.

interface CapturedError {
  ts: string;
  msg: string;
}

const MAX_CAPTURED = 30;
const capturedErrors: CapturedError[] = [];

(function installErrorCapture() {
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    capturedErrors.push({
      ts: new Date().toISOString(),
      msg: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ').slice(0, 300),
    });
    if (capturedErrors.length > MAX_CAPTURED) capturedErrors.shift();
    origError(...args);
  };

  // Also capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    capturedErrors.push({
      ts: new Date().toISOString(),
      msg: `[unhandledrejection] ${String(e.reason)}`.slice(0, 300),
    });
    if (capturedErrors.length > MAX_CAPTURED) capturedErrors.shift();
  });
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAppVersion(): string {
  return __APP_VERSION__;
}

function getChannel(): 'beta' | 'stable' {
  const v = getAppVersion();
  return v.includes('beta') || v.includes('alpha') || v.includes('rc') ? 'beta' : 'stable';
}

function getOsString(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows NT 10')) return 'Windows 10/11';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return ua.slice(0, 60);
}

/** Collect a structured diagnostic snapshot for copy-paste bug reports */
async function buildDiagnosticReport(description: string): Promise<string> {
  const version = getAppVersion();
  const os = getOsString();
  const page = window.location.pathname;
  const online = navigator.onLine;
  const ts = new Date().toISOString();

  // Relevant localStorage keys (no values — just presence/absence)
  const lsKeys = Object.keys(localStorage).filter(k => k.startsWith('homestream'));

  // Fetch server health
  let healthStr = 'unavailable';
  try {
    const r = await fetch('/api/health', { credentials: 'include', signal: AbortSignal.timeout(3000) });
    const d = await r.json() as Record<string, unknown>;
    healthStr = JSON.stringify(d);
  } catch { /* ignore */ }

  // Fetch system info if available
  let sysInfo = '';
  try {
    const r = await fetch('/api/debug/system-info', { credentials: 'include', signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      sysInfo = JSON.stringify(d, null, 2);
    }
  } catch { /* ignore */ }

  const errors = capturedErrors.slice(-20);

  const lines: string[] = [
    '═══════════════════════════════════════════',
    '  HomeStream Diagnostic Report',
    '═══════════════════════════════════════════',
    `Generated : ${ts}`,
    `Version   : v${version} (${getChannel()})`,
    `OS        : ${os}`,
    `Page      : ${page}`,
    `Network   : ${online ? 'online' : 'OFFLINE'}`,
    '',
    '── User Description ──────────────────────',
    description.trim() || '(no description provided)',
    '',
    '── Server Health ─────────────────────────',
    healthStr,
    '',
    '── localStorage Keys ─────────────────────',
    lsKeys.length > 0 ? lsKeys.join(', ') : '(none)',
    '',
  ];

  if (sysInfo) {
    lines.push('── System Info ───────────────────────────');
    lines.push(sysInfo);
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('── Recent Console Errors ─────────────────');
    errors.forEach(e => lines.push(`[${e.ts}] ${e.msg}`));
    lines.push('');
  } else {
    lines.push('── Recent Console Errors ─────────────────');
    lines.push('(none captured)');
    lines.push('');
  }

  lines.push('── How to use this report ────────────────');
  lines.push('Paste this entire block into a chat with Airo or a GitHub issue.');
  lines.push('═══════════════════════════════════════════');

  return lines.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FeedbackButtonProps {
  /** Extra className for the trigger button */
  className?: string;
  /** Compact mode — icon only, no label */
  compact?: boolean;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type PanelMode = 'form' | 'diagnostic';

export default function FeedbackButton({ className = '', compact = false }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>('form');
  const [type, setType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [diagReport, setDiagReport] = useState('');
  const [diagBuilding, setDiagBuilding] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedType = TYPES.find(t => t.id === type) ?? TYPES[0];
  const version = getAppVersion();
  const channel = getChannel();

  // Track online status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setMode('form');
    setSubmitState('idle');
    setDescription('');
    setErrorMsg('');
    setIssueNumber(null);
    setDiagReport('');
    setDiagCopied(false);
    setTimeout(() => textareaRef.current?.focus(), 150);
  };

  const handleClose = () => {
    setOpen(false);
    setShowTypeMenu(false);
  };

  const handleSubmit = async () => {
    if (!description.trim() || submitState === 'submitting') return;

    setSubmitState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          description: description.trim(),
          version,
          channel,
          os: getOsString(),
          page: window.location.pathname,
          // Include recent errors in the submission too
          recentErrors: capturedErrors.slice(-10).map(e => `[${e.ts}] ${e.msg}`).join('\n'),
        }),
      });

      const data = await res.json() as {
        ok: boolean;
        issueUrl?: string;
        issueNumber?: number;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Submission failed');
      }

      setIssueNumber(data.issueNumber ?? null);
      setSubmitState('success');
    } catch (err) {
      setErrorMsg(String(err).replace('Error: ', ''));
      setSubmitState('error');
    }
  };

  const handleBuildDiagnostic = useCallback(async () => {
    setDiagBuilding(true);
    setDiagCopied(false);
    try {
      const report = await buildDiagnosticReport(description);
      setDiagReport(report);
    } finally {
      setDiagBuilding(false);
    }
  }, [description]);

  // Auto-build report when switching to diagnostic mode
  useEffect(() => {
    if (mode === 'diagnostic' && !diagReport && !diagBuilding) {
      handleBuildDiagnostic();
    }
  }, [mode, diagReport, diagBuilding, handleBuildDiagnostic]);

  const handleCopyDiag = async () => {
    if (!diagReport) return;
    try {
      await navigator.clipboard.writeText(diagReport);
      setDiagCopied(true);
      setTimeout(() => setDiagCopied(false), 3000);
    } catch {
      // Fallback: select the textarea
      const el = document.getElementById('hs-diag-textarea') as HTMLTextAreaElement | null;
      el?.select();
    }
  };

  return (
    <div className="relative">
      {/* ── Trigger button ── */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
        title="Send feedback / copy bug report"
      >
        <MessageSquarePlus className="w-4 h-4 flex-shrink-0" />
        {!compact && <span>Send Feedback</span>}
      </button>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={handleClose}
            />

            {/* Panel */}
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full right-0 mb-2 w-96 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Feedback & Bug Reports</span>
                  {channel === 'beta' && (
                    <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full">BETA</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Online indicator */}
                  {isOnline
                    ? <span title="Online"><Wifi className="w-3.5 h-3.5 text-green-400" /></span>
                    : <span title="Offline"><WifiOff className="w-3.5 h-3.5 text-destructive" /></span>
                  }
                  <button
                    onClick={handleClose}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Mode tabs */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setMode('form')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    mode === 'form'
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Send className="w-3 h-3" />
                  Submit Issue
                </button>
                <button
                  onClick={() => setMode('diagnostic')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    mode === 'diagnostic'
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Terminal className="w-3 h-3" />
                  Copy Bug Report
                </button>
              </div>

              {/* ── SUBMIT mode ── */}
              {mode === 'form' && (
                <>
                  {submitState === 'success' ? (
                    <div className="p-6 flex flex-col items-center gap-3 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                        <Check className="w-6 h-6 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Thanks for the feedback!</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {issueNumber
                            ? `Logged as report #${issueNumber}.`
                            : 'Your report has been submitted.'}
                        </p>
                      </div>
                      {issueNumber && (
                        <p className="text-xs text-muted-foreground/60">
                          We&apos;ll review it and ship a fix in the next update.
                        </p>
                      )}
                      <button
                        onClick={handleClose}
                        className="mt-1 px-4 py-1.5 rounded-lg bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col gap-3">
                      {/* Type selector */}
                      <div className="relative">
                        <button
                          onClick={() => setShowTypeMenu(s => !s)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <span className="flex items-center gap-2">
                            {selectedType.icon}
                            {selectedType.label}
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showTypeMenu ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showTypeMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.1 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-10 overflow-hidden"
                            >
                              {TYPES.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => { setType(t.id); setShowTypeMenu(false); setTimeout(() => textareaRef.current?.focus(), 50); }}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                                    ${type === t.id
                                      ? 'bg-primary/10 text-primary'
                                      : 'text-foreground hover:bg-muted'
                                    }`}
                                >
                                  {t.icon}
                                  {t.label}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Description */}
                      <textarea
                        ref={textareaRef}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder={selectedType.placeholder}
                        rows={5}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                        }}
                      />

                      {/* Error */}
                      {submitState === 'error' && errorMsg && (
                        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{errorMsg}</span>
                        </div>
                      )}

                      {/* Offline hint */}
                      {!isOnline && (
                        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                          <WifiOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>You&apos;re offline. Use the <strong>Copy Bug Report</strong> tab instead — paste it to Airo when you&apos;re back online.</span>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground">
                            v{version} · {channel} · {getOsString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            Posts as a GitHub Issue · Cmd+Enter to submit
                          </span>
                        </div>
                        <button
                          onClick={handleSubmit}
                          disabled={!description.trim() || submitState === 'submitting' || !isOnline}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {submitState === 'submitting' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          {submitState === 'submitting' ? 'Sending…' : 'Submit'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── DIAGNOSTIC mode ── */}
              {mode === 'diagnostic' && (
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <Terminal className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-[11px] text-muted-foreground leading-relaxed">
                      <p className="font-semibold text-foreground mb-0.5">How to use this</p>
                      Copy this report and paste it into a chat with <strong className="text-primary">Airo</strong> or into a GitHub issue.
                      It includes your version, OS, recent errors, and server health — everything needed to diagnose the bug.
                    </div>
                  </div>

                  {/* Optional description */}
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what went wrong (optional — will be included in the report)…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  />

                  {/* Regenerate button */}
                  <button
                    onClick={handleBuildDiagnostic}
                    disabled={diagBuilding}
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {diagBuilding
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Building report…</>
                      : <><Terminal className="w-3 h-3" />Regenerate report</>
                    }
                  </button>

                  {/* Report preview */}
                  {diagReport && (
                    <div className="relative">
                      <textarea
                        id="hs-diag-textarea"
                        readOnly
                        value={diagReport}
                        rows={10}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background/60 text-[10px] font-mono text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  {/* Copy button */}
                  <button
                    onClick={handleCopyDiag}
                    disabled={!diagReport || diagBuilding}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      diagCopied
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {diagCopied ? (
                      <><ClipboardCheck className="w-4 h-4" />Copied to clipboard!</>
                    ) : (
                      <><ClipboardCopy className="w-4 h-4" />Copy full report</>
                    )}
                  </button>

                  <p className="text-[10px] text-muted-foreground/60 text-center">
                    Paste this into a chat with Airo or a GitHub issue to get help fast.
                  </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
