/**
 * RouteErrorBoundary — lightweight per-route error boundary.
 *
 * Catches render errors in a single route so one broken page doesn't
 * crash the entire app. Shows a minimal recovery UI with a reload button.
 *
 * The global AppErrorBoundary still wraps the root for catastrophic failures.
 */

import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional route name for the error message */
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report to crash log — best effort, don't throw if it fails
    fetch('/api/crash-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'route-render-error',
        route: this.props.routeName ?? 'unknown',
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {this.props.routeName ? `${this.props.routeName} failed to load` : 'Something went wrong'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            This page crashed unexpectedly. The rest of the app is still running.
          </p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
              {this.state.error.message}
            </p>
          )}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }
}
