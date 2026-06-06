import fs from 'fs';
import path from 'path';
import { dataPath } from './dataDir.js';

const JOBS_PATH = dataPath('homestream-download-jobs.json');

export interface PersistedDownloadJob {
  jobId: string;
  infoHash?: string;
  title: string;
  quality: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  status: string;
  addedAt: string;
  completedAt?: string;
  poster?: string;
  imdbId?: string;
  backend?: string;
}

type JobStore = Record<string, PersistedDownloadJob>;

let writeQueue: Promise<void> = Promise.resolve();

function readStore(): JobStore {
  if (!fs.existsSync(JOBS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8')) as JobStore;
  } catch {
    return {};
  }
}

function writeStore(store: JobStore): void {
  const tmp = JOBS_PATH + '.tmp';
  fs.mkdirSync(path.dirname(JOBS_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, JOBS_PATH);
}

export function getAllPersistedJobs(): PersistedDownloadJob[] {
  return Object.values(readStore());
}

export function upsertJob(job: PersistedDownloadJob): void {
  writeQueue = writeQueue.then(() => {
    const store = readStore();
    store[job.jobId] = job;
    writeStore(store);
  }).catch(err => console.error('[downloadJobStore] Write failed:', err));
}

export function updateJobStatus(jobId: string, status: string, completedAt?: string): void {
  writeQueue = writeQueue.then(() => {
    const store = readStore();
    if (store[jobId]) {
      store[jobId].status = status;
      if (completedAt) store[jobId].completedAt = completedAt;
      writeStore(store);
    }
  }).catch(err => console.error('[downloadJobStore] Write failed:', err));
}

export function deleteJob(jobId: string): void {
  writeQueue = writeQueue.then(() => {
    const store = readStore();
    delete store[jobId];
    writeStore(store);
  }).catch(err => console.error('[downloadJobStore] Write failed:', err));
}
