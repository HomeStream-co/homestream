/**
 * UpdateBanner
 *
 * Displays the current auto-updater state as an inline banner.
 * Hidden entirely when not running inside Electron or when state is idle.
 *
 * Usage:
 *   <UpdateBanner />          — self-contained, manages its own state
 *   <UpdateBanner compact />  — smaller pill style for tight spaces
 */

import { useAppUpdater } from '@/hooks/useAppUpdater';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, Loader2, X, ArrowDownToLine, ExternalLink } from 'lucide-react';

interface UpdateBannerProps {
  /** Compact pill style — for use inside settings panels */
  compact?: boolean;
}

export default function UpdateBanner({ compact = false }: UpdateBannerProps) {
  const {
    isElectron,
    status,
    autoUpdateSupported,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismiss,
  } = useAppUpdater();

  // Not in Electron — hide completely
  if (!isElectron) return null;

  // Idle — show a subtle "Check for Updates" button only in non-compact mode
  if (status.state === 'idle') {
    if (compact) return null;
    return (
      <button
        onClick={checkForUpdate}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Check for updates
      </button>
    );
  }

  // ── Checking ──────────────────────────────────────────────────────────────
  if (status.state === 'checking') {
    return (
      <Banner compact={compact} color="neutral">
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        <span className="flex-1 text-sm">
          Checking for updates{status.currentVersion ? ` — current: v${status.currentVersion}` : ''}…
        </span>
      </Banner>
    );
  }

  // ── Not available ─────────────────────────────────────────────────────────
  if (status.state === 'not-available') {
    return (
      <Banner compact={compact} color="green" onDismiss={dismiss}>
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-400" />
        <span className="flex-1 text-sm">
          HomeStream is up to date{status.currentVersion ? ` — v${status.currentVersion}` : ''}
        </span>
      </Banner>
    );
  }

  // ── Update available ──────────────────────────────────────────────────────
  if (status.state === 'available') {
    // deb/pacman on Linux: auto-download not supported — link to releases page
    if (!autoUpdateSupported) {
      const fmt = status.linuxPackageFormat ?? 'package';
      return (
        <Banner compact={compact} color="blue" onDismiss={dismiss}>
          <ArrowDownToLine className="w-4 h-4 flex-shrink-0 text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">
              Update available{status.version ? ` — v${status.version}` : ''}
            </p>
            {!compact && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-update is not supported for the {fmt} install.
                Download the new {fmt} from GitHub Releases and install it manually.
              </p>
            )}
          </div>
          <a
            href="https://github.com/HomeStream-co/homestream/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Releases
          </a>
        </Banner>
      );
    }

    return (
      <Banner compact={compact} color="blue" onDismiss={dismiss}>
        <ArrowDownToLine className="w-4 h-4 flex-shrink-0 text-blue-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-300">
            Update available{status.version ? ` — v${status.version}` : ''}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">
              A delta update is ready. Download is small — no reinstall needed.
            </p>
          )}
        </div>
        <button
          onClick={downloadUpdate}
          className="flex-shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </Banner>
    );
  }

  // ── Downloading ───────────────────────────────────────────────────────────
  if (status.state === 'downloading') {
    const pct = status.percent ?? 0;
    const mbps = status.bytesPerSecond
      ? `${(status.bytesPerSecond / 1_048_576).toFixed(1)} MB/s`
      : null;

    return (
      <Banner compact={compact} color="blue">
        <Download className="w-4 h-4 flex-shrink-0 text-blue-400 animate-bounce" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-blue-300">
              Downloading update — {pct}%
            </p>
            {mbps && <span className="text-xs text-muted-foreground">{mbps}</span>}
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Banner>
    );
  }

  // ── Ready to install ──────────────────────────────────────────────────────
  if (status.state === 'ready') {
    return (
      <Banner compact={compact} color="green" onDismiss={dismiss}>
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-300">
            {status.version ? `v${status.version}` : 'Update'} ready to install
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">
              HomeStream will restart and apply the update. No reinstall needed.
            </p>
          )}
        </div>
        <button
          onClick={installUpdate}
          className="flex-shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Restart &amp; Update
        </button>
      </Banner>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status.state === 'error') {
    return (
      <Banner compact={compact} color="amber" onDismiss={dismiss}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300">Update check failed</p>
          {!compact && status.error && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{status.error}</p>
          )}
        </div>
        <button
          onClick={checkForUpdate}
          className="flex-shrink-0 text-xs text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
        >
          Retry
        </button>
      </Banner>
    );
  }

  return null;
}

// ── Internal Banner wrapper ────────────────────────────────────────────────

interface BannerProps {
  compact: boolean;
  color: 'neutral' | 'blue' | 'green' | 'amber';
  onDismiss?: () => void;
  children: React.ReactNode;
}

const colorMap = {
  neutral: 'border-border bg-muted/30',
  blue:    'border-blue-500/30 bg-blue-500/10',
  green:   'border-green-500/30 bg-green-500/10',
  amber:   'border-amber-500/30 bg-amber-500/10',
};

function Banner({ compact, color, onDismiss, children }: BannerProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${compact ? 'py-2' : 'py-3'} ${colorMap[color]}`}>
      {children}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
