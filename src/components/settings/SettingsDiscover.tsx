import { Compass, Clock, WifiOff, RefreshCw } from 'lucide-react';
import { SectionHeader } from './shared';

interface SettingsDiscoverProps {
  tmdbRefreshing: boolean;
  tmdbLastRefreshed: string | null;
  tmdbStale: boolean;
  onRefresh: () => void;
}

export default function SettingsDiscover({
  tmdbRefreshing, tmdbLastRefreshed, tmdbStale, onRefresh,
}: SettingsDiscoverProps) {
  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Compass} label="Discover" />
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Movie data is cached for 30 days to keep things fast. Refresh to pull the latest new
          releases and trending titles right now.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {tmdbLastRefreshed
            ? `Last updated: ${tmdbLastRefreshed}`
            : 'Not yet fetched — will load on first visit to Discover'}
          {tmdbStale && (
            <span className="flex items-center gap-1 text-orange-400 ml-1">
              <WifiOff className="w-2.5 h-2.5" /> Stale
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={tmdbRefreshing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${tmdbRefreshing ? 'animate-spin' : ''}`} />
          {tmdbRefreshing ? 'Refreshing…' : 'Refresh New Releases Now'}
        </button>
      </div>
    </div>
  );
}
