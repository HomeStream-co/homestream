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
  jobId?: string;
  name: string;
  title?: string;
  status: string;
  progress: number;
}

interface DownloadsResponse {
  qbitTorrents?: TorrentInfo[];
  jobs?: TorrentInfo[];
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
        const res = await fetch('/api/stremio/downloads', { credentials: 'include' });
        if (!res.ok) return;
        const data: DownloadsResponse = await res.json();
        const torrents = [...(data.qbitTorrents ?? []), ...(data.jobs ?? [])];

        for (const t of torrents) {
          const id = t.hash ?? t.jobId ?? '';
          const label = t.name ?? t.title ?? 'Unknown';
          const isDone  = t.status === 'done' || t.status === 'seeding';
          const isError = t.status === 'error';

          if (t.status === 'downloading') {
            inProgress.current.add(id);
          }

          if (isDone && !seenDone.current.has(id)) {
            seenDone.current.add(id);
            if (inProgress.current.has(id)) {
              notify({
                type: 'download_complete',
                title: label,
                message: 'Download complete — ready to watch',
                ttl: 0,
              });
            }
          }

          if (isError && !seenError.current.has(id)) {
            seenError.current.add(id);
            notify({
              type: 'download_error',
              title: label,
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
