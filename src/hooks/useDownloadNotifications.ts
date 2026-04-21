/**
 * useDownloadNotifications — polls /api/downloads and fires notifications
 * when a torrent transitions to "done" or "error" state.
 *
 * Mount this once at the app root (App.tsx). It tracks previously-seen
 * torrent hashes so it only fires once per completion event.
 */

import { useEffect, useRef } from 'react';
import { notify } from '@/lib/notificationStore';

interface TorrentInfo {
  hash: string;
  name: string;
  status: string; // 'downloading' | 'done' | 'seeding' | 'error' | 'paused' | 'stalled'
  progress: number;
}

interface DownloadsResponse {
  torrents?: TorrentInfo[];
  qbitOnline?: boolean;
}

const POLL_INTERVAL = 8000; // 8 seconds

export function useDownloadNotifications() {
  // Track hashes we've already notified about so we don't re-fire
  const seenDone  = useRef<Set<string>>(new Set());
  const seenError = useRef<Set<string>>(new Set());
  // Track hashes that were "in progress" so we can detect new completions
  const inProgress = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch('/api/downloads');
        if (!res.ok) return;
        const data: DownloadsResponse = await res.json();
        const torrents = data.torrents ?? [];

        for (const t of torrents) {
          const isDone  = t.status === 'done' || t.status === 'seeding';
          const isError = t.status === 'error';

          // Track anything actively downloading
          if (t.status === 'downloading') {
            inProgress.current.add(t.hash);
          }

          // Fire "complete" only if it was previously in-progress (avoids
          // notifying about items that were already done on page load)
          if (isDone && !seenDone.current.has(t.hash)) {
            seenDone.current.add(t.hash);
            if (inProgress.current.has(t.hash)) {
              notify({
                type: 'download_complete',
                title: t.name,
                message: 'Download complete — ready to watch',
                ttl: 0, // persistent until dismissed
              });
            }
          }

          if (isError && !seenError.current.has(t.hash)) {
            seenError.current.add(t.hash);
            notify({
              type: 'download_error',
              title: t.name,
              message: 'Download failed — check the Downloads page for details',
              ttl: 0,
            });
          }
        }
      } catch {
        // Network error — silently skip
      }
    }

    // Initial poll after a short delay (let the app settle)
    const initial = setTimeout(poll, 3000);
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);
}
