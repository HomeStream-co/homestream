/**
 * useTranscodeProgress
 *
 * Connects to GET /api/transcode/:mediaId via Server-Sent Events and
 * returns live progress data while a transcode job is active.
 *
 * Returns null immediately if no job exists for this mediaId.
 * Automatically closes the SSE connection when the job reaches a
 * terminal state (done / error / skipped).
 */
import { useEffect, useState } from 'react';

export type TranscodeStatus = 'queued' | 'transcoding' | 'done' | 'error' | 'skipped';

export interface TranscodeProgress {
  status: TranscodeStatus;
  progress: number;   // 0–100
  fps?: number;
  speed?: string;     // e.g. "1.4x"
  eta?: number;       // seconds remaining
  error?: string;
}

const TERMINAL: TranscodeStatus[] = ['done', 'error', 'skipped'];

export function useTranscodeProgress(mediaId: string | undefined): TranscodeProgress | null {
  const [job, setJob] = useState<TranscodeProgress | null>(null);

  useEffect(() => {
    if (!mediaId) return;

    let es: EventSource | null = null;
    let cancelled = false;

    // First do a quick HEAD-style fetch to see if a job exists at all.
    // The SSE endpoint returns JSON immediately for terminal states, so
    // we can use a regular fetch to check without opening a long-lived connection.
    fetch(`/api/transcode/${mediaId}`, { credentials: 'include' })
      .then(r => {
        if (!r.ok || cancelled) return;
        const ct = r.headers.get('content-type') ?? '';

        // Terminal state returned as plain JSON — parse and set once, no SSE needed
        if (ct.includes('application/json')) {
          return r.json().then((data: TranscodeProgress) => {
            if (!cancelled) setJob(data);
          });
        }

        // Active job — open SSE stream
        es = new EventSource(`/api/transcode/${mediaId}`);

        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data) as TranscodeProgress;
            if (!cancelled) setJob(data);
            // Close once terminal
            if (TERMINAL.includes(data.status)) {
              es?.close();
            }
          } catch { /* ignore malformed frames */ }
        };

        es.onerror = () => {
          es?.close();
        };
      })
      .catch(() => { /* no job — stay null */ });

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [mediaId]);

  return job;
}
