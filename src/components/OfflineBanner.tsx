/**
 * OfflineBanner
 *
 * Shown when TMDB/internet data is stale (server is offline or no internet).
 * The app still works fully — library, player, history, watchlist all work
 * without internet. Only the Discover page and TMDB metadata are affected.
 */
import { WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface OfflineBannerProps {
  /** True when TMDB data is stale (no internet or TMDB unreachable) */
  stale: boolean;
  /** Optional error message */
  error?: string | null;
}

export default function OfflineBanner({ stale, error }: OfflineBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const show = stale && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/60 border-b border-amber-800/40 text-amber-300 text-xs"
        >
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            {error
              ? 'Could not reach TMDB — showing cached data. Your library and player work normally.'
              : 'Showing cached discovery data. Connect to the internet to refresh.'}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-500 hover:text-amber-300 transition-colors flex-shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
