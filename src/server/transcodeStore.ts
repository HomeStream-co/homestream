/**
 * In-memory transcode job store.
 * Shared across all API route handlers via module singleton.
 */

export type TranscodeStatus =
  | 'queued'
  | 'transcoding'
  | 'done'
  | 'error'
  | 'skipped'; // already MP4 H.264 — no transcode needed

export interface TranscodeJob {
  mediaId: string;
  status: TranscodeStatus;
  progress: number;       // 0-100 FFmpeg progress
  fps?: number;
  speed?: string;
  eta?: number;           // seconds remaining
  error?: string;
  inputFile: string;      // original uploaded filename
  outputFile: string;     // final filename served by stream endpoint
  startedAt?: number;
  finishedAt?: number;
  /** Human-readable encoder label, e.g. "NVIDIA NVENC" or "Software (libx264)" */
  encoderLabel?: string;
}

// Module-level singleton map: mediaId → job
const jobs = new Map<string, TranscodeJob>();

export function createJob(mediaId: string, inputFile: string, outputFile: string): TranscodeJob {
  const job: TranscodeJob = {
    mediaId,
    status: 'queued',
    progress: 0,
    inputFile,
    outputFile,
  };
  jobs.set(mediaId, job);
  return job;
}

export function updateJob(mediaId: string, updates: Partial<TranscodeJob>): void {
  const job = jobs.get(mediaId);
  if (job) jobs.set(mediaId, { ...job, ...updates });
}

export function getJob(mediaId: string): TranscodeJob | undefined {
  return jobs.get(mediaId);
}

export function getAllJobs(): TranscodeJob[] {
  return Array.from(jobs.values());
}

// SSE subscriber map: mediaId → set of response writers
type SSEWriter = (data: string) => void;
const subscribers = new Map<string, Set<SSEWriter>>();

export function subscribe(mediaId: string, writer: SSEWriter): () => void {
  if (!subscribers.has(mediaId)) subscribers.set(mediaId, new Set());
  subscribers.get(mediaId)!.add(writer);
  // Return unsubscribe fn
  return () => {
    subscribers.get(mediaId)?.delete(writer);
  };
}

export function broadcast(mediaId: string, job: TranscodeJob): void {
  const subs = subscribers.get(mediaId);
  if (!subs || subs.size === 0) return;
  const payload = `data: ${JSON.stringify(job)}\n\n`;
  subs.forEach(write => write(payload));
}
