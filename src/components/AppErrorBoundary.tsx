/**
 * AppErrorBoundary — catches unhandled React render errors anywhere in the
 * component tree and:
 *  1. Sends the error to POST /api/crash-log so it appears in the Debug Panel
 *  2. Shows a friendly recovery screen with a "Copy crash report" button so
 *     the user can paste it directly into the support chat
 *
 * Usage: wrap the root <App /> in main.tsx with <AppErrorBoundary>
 */

import React from 'react';
import { ClipboardCopy, ClipboardCheck, RefreshCw, Bug } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

<<<<<<< HEAD
    // If this is a stale chunk error (Vite hash mismatch after auto-update),
    // attempt a single auto-reload with the same loop guard used in main.tsx.
=======
    // If this is a stale chunk error after an auto-update, attempt one auto-reload.
    // Uses the same sessionStorage guard as main.tsx to prevent infinite loops.
>>>>>>> 20260425045933-9h9yrecco0
    const msg = error.message ?? '';
    const isChunkError = (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Unable to preload CSS for') ||
      msg.includes('error loading dynamically imported module')
    );
    if (isChunkError) {
      const CHUNK_RELOAD_KEY = 'hs_chunk_reload_at';
      const CHUNK_RELOAD_COOLDOWN_MS = 10_000;
      const now = Date.now();
      const lastReload = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0', 10);
      if (now - lastReload >= CHUNK_RELOAD_COOLDOWN_MS) {
        console.warn('[HomeStream] AppErrorBoundary: stale chunk — reloading…');
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
        window.location.replace(window.location.href);
<<<<<<< HEAD
        return; // don't log crash or show error screen — we're reloading
=======
        return; // reloading — don't log crash or show error screen
>>>>>>> 20260425045933-9h9yrecco0
      }
      console.error('[HomeStream] AppErrorBoundary: chunk error persists after reload — showing crash screen.');
    }

<<<<<<< HEAD
    // Post to the crash log API so it persists and shows in the Debug Panel
=======
    // Log to crash API so it appears in the Debug Panel
>>>>>>> 20260425045933-9h9yrecco0
    fetch('/api/crash-log', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reactError',
        message: error.message,
        stack: error.stack,
        context: `React component tree\n${errorInfo.componentStack ?? ''}`,
      }),
    }).catch(() => { /* non-fatal */ });
  }

  buildReport(): string {
    const { error, errorInfo } = this.state;
    return [
      `HomeStream Frontend Crash — ${new Date().toISOString()}`,
      '─'.repeat(60),
      `Message: ${error?.message ?? 'Unknown error'}`,
      '',
      'Stack:',
      error?.stack ?? '(no stack)',
      '',
      'Component tree:',
      errorInfo?.componentStack ?? '(not available)',
      '─'.repeat(60),
      `User agent: ${navigator.userAgent}`,
      `URL: ${window.location.href}`,
    ].join('\n');
  }

  async copyReport() {
    try {
      await navigator.clipboard.writeText(this.buildReport());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch { /* clipboard blocked */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, copied } = this.state;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <Bug className="w-8 h-8 text-destructive" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            HomeStream ran into a problem
          </h1>
          <p className="text-muted-foreground text-center text-sm mb-6">
            Something in the interface crashed. Your media library and settings are safe.
          </p>

          {/* Error summary */}
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 mb-4">
            <p className="text-xs font-semibold text-destructive mb-1 uppercase tracking-wide">Error</p>
            <p className="text-sm font-mono text-foreground break-all">{error?.message ?? 'Unknown error'}</p>
          </div>

          {/* Support callout */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 mb-6">
            <p className="text-xs font-semibold text-foreground mb-1">Need help?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Click <strong className="text-foreground">Copy crash report</strong> below, then paste it into the support chat. The report includes the full stack trace and component tree so the issue can be diagnosed quickly.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => this.copyReport()}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {copied
                ? <><ClipboardCheck className="w-4 h-4" /> Copied to clipboard!</>
                : <><ClipboardCopy className="w-4 h-4" /> Copy crash report</>
              }
            </button>

            <button
              onClick={() => {
                sessionStorage.removeItem('hs_chunk_reload_at');
                window.location.replace(window.location.href);
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-sm hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload HomeStream
            </button>

            <button
              onClick={() => { window.location.href = '/'; }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
            >
              Go to home page
            </button>
          </div>

          {/* Stack trace (collapsed) */}
          <details className="mt-6">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
              Show full stack trace
            </summary>
            <pre className="mt-2 p-3 rounded-xl bg-black/40 border border-border text-[9px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto">
              {error?.stack ?? '(no stack available)'}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
