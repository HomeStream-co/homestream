/**
 * useTranscodeProgress
 *
 * Connects to GET /api/transcode/:mediaId via Server-Sent Events and
 * returns live progress data while a transcode job is active.
 *
 * Returns null immediately if no job exists for this mediaId.
 * Automatically closes the SSE connection when the job reaches a
 * terminal state (done / error / skipped).
 *
 * Race-condition fix (v1.4.3):
 *   Previously the hook did a fetch() to sniff the Content-Type, then opened
 *   a second EventSource to the same endpoint. This caused two simultaneous
 *   connections — the fetch consumed the SSE stream body, and the EventSource
 *   got an empty response. Now we open EventSource directly and detect the
 *   terminal/no-job case from the first message frame.
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

// How long to wait for the first SSE message before assuming no active job.
// The server sends a frame immediately if a job exists; 3s is generous.
const NO_JOB_TIMEOUT_MS = 3_000;

export function useTranscodeProgress(mediaId: string | undefined): TranscodeProgress | null {
  const [job, setJob] = useState<TranscodeProgress | null>(null);

  useEffect(() => {
    if (!mediaId) return;

    let es: EventSource | null = null;
    let cancelled = false;
    let noJobTimer: ReturnType<typeof setTimeout> | null = null;

    // Open SSE connection directly — no pre-flight fetch.
    // The server sends the first frame immediately for active jobs, or closes
    // the connection with a terminal-state JSON frame for finished/absent jobs.
    es = new EventSource(`/api/transcode/${mediaId}`);

    // If no message arrives within NO_JOB_TIMEOUT_MS, assume no active job
    // and close the connection to avoid a dangling SSE stream.
    noJobTimer = setTimeout(() => {
      if (!cancelled) {
        es?.close();
        es = null;
      }
    }, NO_JOB_TIMEOUT_MS);

    es.onmessage = (e) => {
      // Clear the no-job timeout — we got a real frame
      if (noJobTimer) { clearTimeout(noJobTimer); noJobTimer = null; }

      try {
        const data = JSON.parse(e.data) as TranscodeProgress;
        if (!cancelled) setJob(data);
        // Close once terminal
        if (TERMINAL.includes(data.status)) {
          es?.close();
          es = null;
        }
      } catch { /* ignore malformed frames */ }
    };

    es.onerror = () => {
      if (noJobTimer) { clearTimeout(noJobTimer); noJobTimer = null; }
      es?.close();
      es = null;
    };

    return () => {
      cancelled = true;
      if (noJobTimer) clearTimeout(noJobTimer);
      es?.close();
      es = null;
    };
  }, [mediaId]);

  return job;
}
