/**
 * InlineErrorBoundary — a scoped error boundary that catches render crashes
 * in a subtree and shows a small inline fallback instead of nuking the whole page.
 *
 * Unlike AppErrorBoundary (which takes over the full screen), this renders a
 * compact error pill in-place so the rest of the UI stays functional.
 *
 * Usage:
 *   <InlineErrorBoundary label="StremioPanel">
 *     <StremioPanel />
 *   </InlineErrorBoundary>
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Short label shown in the fallback UI, e.g. "StremioPanel" */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class InlineErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Post to crash log so it shows in the Debug Panel
    fetch('/api/crash-log', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reactError',
        message: error.message,
        stack: error.stack,
        context: `InlineErrorBoundary[${this.props.label ?? 'unknown'}]\n${info.componentStack ?? ''}`,
      }),
    }).catch(() => { /* non-fatal */ });
  }

  reset() {
    this.setState({ hasError: false, message: '' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <button
        onClick={() => this.reset()}
        title={`${this.props.label ?? 'Component'} crashed: ${this.state.message} — click to retry`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:inline">{this.props.label ?? 'Error'}</span>
        <RefreshCw className="w-3 h-3 flex-shrink-0" />
      </button>
    );
  }
}
