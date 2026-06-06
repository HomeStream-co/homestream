/**
 * UpdateBanner — shows a banner when a new HomeStream server version is available.
 */
import { useState, useEffect } from 'react';
import { Download, X, ExternalLink } from 'lucide-react';

interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  currentVersion?: string;
  releaseUrl?: string;
}

interface UpdateBannerProps {
  compact?: boolean;
}

export default function UpdateBanner({ compact = false }: UpdateBannerProps) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/update-check', { credentials: 'include' })
      .then(r => r.json())
      .then((data: UpdateInfo) => { if (data.available) setUpdate(data); })
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs">
        <Download className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-foreground flex-1">v{update.latestVersion} available</span>
        {update.releaseUrl && (
          <a href={update.releaseUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
            Update <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
      <Download className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Update available</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          HomeStream v{update.latestVersion} is available (current: v{update.currentVersion})
        </p>
        {update.releaseUrl && (
          <a href={update.releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">
            View release notes <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
