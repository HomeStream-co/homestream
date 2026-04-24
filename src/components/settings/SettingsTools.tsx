import { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Tv2, Wand2, Wrench, FlaskConical, MessageSquarePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FeedbackButton from '@/components/FeedbackButton';

interface SettingsToolsProps {
  onClose: () => void;
  onOpenSecurity?: () => void;
  onOpenDebug?: () => void;
  onClearHealth: () => void;
  healthStatus: 'ok' | 'warn' | 'error' | null;
}

// ── Beta channel toggle ───────────────────────────────────────────────────────
// Reads/writes via the Electron IPC bridge (window.electronAPI).
// In the browser (non-Electron) context, the toggle is hidden.

type ElectronAPI = {
  getBetaChannel?: () => Promise<boolean>;
  setBetaChannel?: (enabled: boolean) => void;
};

function getElectronAPI(): ElectronAPI | null {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

function BetaChannelToggle() {
  const api = getElectronAPI();
  const [betaEnabled, setBetaEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!api?.getBetaChannel) return;
    api.getBetaChannel().then(v => { setBetaEnabled(v); setLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!api?.setBetaChannel || !loaded) return null;

  const toggle = () => {
    const next = !betaEnabled;
    setBetaEnabled(next);
    api.setBetaChannel?.(next);
  };

  return (
    <button
      onClick={toggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left group
        ${betaEnabled
          ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-border hover:border-amber-500/30 hover:bg-amber-500/5'
        }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
        ${betaEnabled ? 'bg-amber-500/20' : 'bg-amber-500/10 group-hover:bg-amber-500/20'}`}
      >
        <FlaskConical className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground leading-tight">Beta Channel</p>
          {betaEnabled && (
            <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              ON
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {betaEnabled
            ? 'Receiving pre-release builds — restart to check for beta updates'
            : 'Enable to receive beta builds before stable release'}
        </p>
      </div>
      {/* Toggle pill */}
      <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${betaEnabled ? 'bg-amber-500' : 'bg-muted'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${betaEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsTools({
  onClose, onOpenSecurity, onOpenDebug, onClearHealth, healthStatus,
}: SettingsToolsProps) {
  const navigate = useNavigate();

  const healthBadgeColor =
    healthStatus === 'ok'    ? 'bg-green-500' :
    healthStatus === 'warn'  ? 'bg-yellow-400' :
    healthStatus === 'error' ? 'bg-destructive' :
    'bg-muted-foreground';

  return (
    <div className="border-t border-border/50 px-4 py-3 flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">
        Tools
      </p>

      {/* Security Center */}
      <button
        onClick={() => { onClose(); onOpenSecurity?.(); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
      >
        <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
          <ShieldCheck className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">Security Center</p>
          <p className="text-[11px] text-muted-foreground">Quarantine, scan &amp; threat log</p>
        </div>
      </button>

      {/* HTTPS Setup */}
      <button
        onClick={() => { onClose(); navigate('/https-setup'); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
      >
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
          <Lock className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">HTTPS Setup</p>
          <p className="text-[11px] text-muted-foreground">Caddy, Let&apos;s Encrypt &amp; remote access</p>
        </div>
      </button>

      {/* Samsung TV Setup */}
      <button
        onClick={() => { onClose(); navigate('/samsung-tv'); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
      >
        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
          <Tv2 className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">Samsung TV Setup</p>
          <p className="text-[11px] text-muted-foreground">Browser guide, bookmarks &amp; remote tips</p>
        </div>
      </button>

      {/* Setup Wizard */}
      <button
        onClick={() => { onClose(); navigate('/setup'); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
      >
        <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
          <Wand2 className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">Setup Wizard</p>
          <p className="text-[11px] text-muted-foreground">Re-run initial configuration &amp; VPN setup</p>
        </div>
      </button>

      {/* Debug Panel */}
      {onOpenDebug && (
        <button
          onClick={() => { onClose(); onClearHealth(); onOpenDebug(); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-colors text-left group"
        >
          <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors relative">
            <Wrench className="w-4 h-4 text-yellow-400" />
            {healthStatus && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${healthBadgeColor}`}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Debug &amp; Diagnostics</p>
            <p className="text-[11px] text-muted-foreground">
              {healthStatus === 'error' ? 'Issues detected — tap to investigate' :
               healthStatus === 'warn'  ? 'Warnings detected — tap to review' :
               healthStatus === 'ok'    ? 'All systems healthy' :
               'Health checks, quick fixes &amp; crash log'}
            </p>
          </div>
          {healthStatus && healthStatus !== 'ok' && (
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${
                healthStatus === 'error'
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {healthStatus.toUpperCase()}
            </span>
          )}
        </button>
      )}

      {/* Beta Channel toggle (Electron only) */}
      <BetaChannelToggle />

      {/* Feedback */}
      <div className="pt-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
          Feedback
        </p>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/20">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Send Feedback</p>
            <p className="text-[11px] text-muted-foreground">Report bugs or suggest features — posts a GitHub Issue</p>
          </div>
          <FeedbackButton compact />
        </div>
      </div>
    </div>
  );
}
