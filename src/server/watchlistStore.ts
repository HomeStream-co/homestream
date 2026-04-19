/**
 * watchlistStore — persistent watchlist storage.
 *
 * Stores the watchlist as a simple JSON array of media IDs in
 * homestream-watchlist.json. Uses the same promise-queue write
 * pattern as libraryStore to prevent concurrent write races.
 *
 * Previously the watchlist lived only in the browser's localStorage,
 * which meant it was lost on browser data clear and invisible to
 * other devices (phone, TV apps). This module is the source of truth.
 */

import fs from 'fs';
import path from 'path';

const WATCHLIST_PATH = path.resolve('./homestream-watchlist.json');

// ── Read ──────────────────────────────────────────────────────────────────────

export function readWatchlist(): string[] {
  if (!fs.existsSync(WATCHLIST_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
    return Array.isArray(data) ? data as string[] : [];
  } catch {
    return [];
  }
}

// ── Write queue ───────────────────────────────────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function writeWatchlist(ids: string[]): Promise<void> {
  writeQueue = writeQueue.then(() => {
    fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(ids, null, 2));
  }).catch(err => {
    console.error('[watchlistStore] Write failed:', err);
  });
  return writeQueue;
}

// ── Operations ────────────────────────────────────────────────────────────────

export function addToWatchlist(id: string): Promise<string[]> {
  const current = readWatchlist();
  if (current.includes(id)) return Promise.resolve(current);
  const next = [...current, id];
  return writeWatchlist(next).then(() => next);
}

export function removeFromWatchlist(id: string): Promise<string[]> {
  const current = readWatchlist();
  const next = current.filter(w => w !== id);
  return writeWatchlist(next).then(() => next);
}
