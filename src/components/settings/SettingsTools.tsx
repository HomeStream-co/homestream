import { ShieldCheck, Lock, Tv2, Wand2, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SettingsToolsProps {
  onClose: () => void;
  onOpenSecurity?: () => void;
  onOpenDebug?: () => void;
  onClearHealth: () => void;
  healthStatus: 'ok' | 'warn' | 'error' | null;
}

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
    </div>
  );
}
