import { useAppUpdater } from '@/hooks/useAppUpdater';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface UpdateBannerProps {
  compact?: boolean;
}

export default function UpdateBanner({ compact = false }: UpdateBannerProps) {
  const {
    isElectron,
    status,
    checkForUpdate,
    installUpdate,
  } = useAppUpdater();

  if (!isElectron) return null;

  // If compact and idle, we can still show a subtle check button instead of hiding it entirely
  // so the user always has a 1-click entry point.

  let icon = <RefreshCw className="w-3.5 h-3.5" />;
  let text = "Check for updates";
  let colorClass = "text-muted-foreground hover:text-foreground";
  let bgClass = "bg-transparent hover:bg-muted/50";
  let onClick = checkForUpdate;
  let disabled = false;

  switch (status.state) {
    case 'checking':
      icon = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
      text = "Checking...";
      disabled = true;
      break;
    case 'available':
      icon = <Download className="w-3.5 h-3.5" />;
      text = "Starting download...";
      disabled = true;
      break;
    case 'downloading':
      icon = <Download className="w-3.5 h-3.5 animate-bounce" />;
      text = `Downloading... ${status.percent ?? 0}%`;
      colorClass = "text-blue-400";
      disabled = true;
      break;
    case 'ready':
      icon = <RefreshCw className="w-3.5 h-3.5" />;
      text = `Restart to Update (v${status.version})`;
      colorClass = "text-white";
      bgClass = "bg-green-600 hover:bg-green-500 shadow-sm";
      onClick = installUpdate;
      break;
    case 'not-available':
      icon = <CheckCircle2 className="w-3.5 h-3.5" />;
      text = "Up to date";
      colorClass = "text-green-500";
      disabled = true; // disabled so they can't spam it, though useAppUpdater resets to idle after 5s
      break;
    case 'error':
      icon = <AlertTriangle className="w-3.5 h-3.5" />;
      text = "Update failed - Retry";
      colorClass = "text-amber-500 hover:text-amber-400";
      onClick = checkForUpdate;
      break;
  }

  const baseClasses = `flex items-center gap-2 text-xs font-medium transition-colors px-2 py-1.5 rounded-md ${colorClass} ${bgClass} disabled:opacity-70 disabled:cursor-not-allowed ${compact ? '' : 'w-full justify-start'}`;

  return (
    <button onClick={onClick} disabled={disabled} className={baseClasses}>
      {icon}
      <span>{text}</span>
    </button>
  );
}
