/**
 * FeedbackButton
 *
 * In-app feedback form that posts a GitHub Issue directly to the HomeStream
 * repo via POST /api/feedback. Auto-fills version, current page, and OS.
 *
 * Used by testers to report bugs without leaving the app.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquarePlus, X, Send, Check, Loader2,
  Bug, Sparkles, Tv2, Zap, MessageCircle, ChevronDown,
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

// ── Component ─────────────────────────────────────────────────────────────────

interface FeedbackButtonProps {
  /** Extra className for the trigger button */
  className?: string;
  /** Compact mode — icon only, no label */
  compact?: boolean;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function FeedbackButton({ className = '', compact = false }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [issueUrl, setIssueUrl] = useState('');
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedType = TYPES.find(t => t.id === type) ?? TYPES[0];
  const version = getAppVersion();
  const channel = getChannel();

  const handleOpen = () => {
    setOpen(true);
    setSubmitState('idle');
    setDescription('');
    setErrorMsg('');
    setIssueUrl('');
    setIssueNumber(null);
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

      setIssueUrl(data.issueUrl ?? '');
      setIssueNumber(data.issueNumber ?? null);
      setSubmitState('success');
    } catch (err) {
      setErrorMsg(String(err).replace('Error: ', ''));
      setSubmitState('error');
    }
  };

  return (
    <div className="relative">
      {/* ── Trigger button ── */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
        title="Send feedback"
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
              className="absolute bottom-full right-0 mb-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Send Feedback</span>
                  {channel === 'beta' && (
                    <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full">BETA</span>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {submitState === 'success' ? (
                /* ── Success state ── */
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Thanks for the feedback!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {issueNumber
                        ? `Issue #${issueNumber} created on GitHub.`
                        : 'Your report has been submitted.'}
                    </p>
                  </div>
                  {issueUrl && (
                    <a
                      href={issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View issue on GitHub →
                    </a>
                  )}
                  <button
                    onClick={handleClose}
                    className="mt-1 px-4 py-1.5 rounded-lg bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                /* ── Form ── */
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
                    <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      {errorMsg}
                    </p>
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
                      disabled={!description.trim() || submitState === 'submitting'}
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
