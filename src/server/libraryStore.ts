/**
 * libraryStore — serialised read/write access to media-library.json.
 *
 * Problem: multiple simultaneous uploads each do a read-modify-write on the
 * JSON file with no coordination. On a fast home server with 2+ concurrent
 * uploads the writes can race and one upload's item can silently overwrite
 * another's.
 *
 * Fix: all writes go through a simple promise-based queue. Each write waits
 * for the previous one to finish before starting. Reads are always immediate
 * (no queue needed — reads are idempotent).
 */

import fs from 'fs';

// Use persistent storage so the library survives deploys and restarts.
import { dataPath } from './dataDir.js';
// Falls back to local path in dev environments without the /private mount.
const LIBRARY_PATH = dataPath('media-library.json');

// ── Read (always immediate) ───────────────────────────────────────────────────

export function readLibrary<T = Record<string, unknown>>(): T[] {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')) as T[]; }
  catch { return []; }
}

// ── Write queue ───────────────────────────────────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

/**
 * Enqueue a write operation. The callback receives the current library array,
 * mutates or replaces it, and returns the new array to persist.
 *
 * All writes are serialised — concurrent calls will queue up and run in order.
 */
export function writeLibrary<T = Record<string, unknown>>(
  updater: (current: T[]) => T[],
): Promise<void> {
  writeQueue = writeQueue.then(() => {
    const current = readLibrary<T>();
    const next = updater(current);
    // Atomic write: write to a temp file then rename so a crash mid-write
    // never leaves a half-written (corrupted) library file. This is the most
    // critical data file in the app — corruption means all media metadata is lost.
    const tmp = LIBRARY_PATH + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
      fs.renameSync(tmp, LIBRARY_PATH);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
  }).catch(err => {
    console.error('[libraryStore] Write failed:', err);
  });
  return writeQueue;
}

/**
 * Convenience: write a pre-built array directly (no read needed).
 * Still serialised through the queue.
 */
export function writeLibraryDirect<T = Record<string, unknown>>(data: T[]): Promise<void> {
  return writeLibrary(() => data);
}
