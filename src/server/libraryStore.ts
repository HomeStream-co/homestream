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
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');

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
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(next, null, 2));
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
