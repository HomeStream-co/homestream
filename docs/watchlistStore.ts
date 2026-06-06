/**
 * watchlistStore — per-profile persistent watchlist storage.
 *
 * Stores watchlists as a JSON object keyed by profileId in
 * homestream-watchlist.json. Each profile has its own independent
 * list of media IDs.
 *
 * Uses the same promise-queue write pattern as libraryStore to
 * prevent concurrent write races.
 *
 * Schema:
 *   {
 *     "adult":      ["id1", "id2"],
 *     "kids":       ["id3"],
 *     "profile_xx": ["id4"]
 *   }
 *
 * Backwards compat: if the file contains a plain array (old format),
 * it is migrated to { adult: [...] } on first write.
 */

import fs from 'fs';

import { dataPath } from './dataDir.js';
const WATCHLIST_PATH = dataPath('homestream-watchlist.json');

// ── Read ──────────────────────────────────────────────────────────────────────

type WatchlistStore = Record<string, string[]>;

function readStore(): WatchlistStore {
  if (!fs.existsSync(WATCHLIST_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
    // Migrate legacy plain-array format → adult profile
    if (Array.isArray(raw)) {
      return { adult: raw as string[] };
    }
    return raw as WatchlistStore;
  } catch {
    return {};
  }
}

export function readWatchlist(profileId = 'adult'): string[] {
  const store = readStore();
  return store[profileId] ?? [];
}

// ── Write queue ───────────────────────────────────────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function writeStore(store: WatchlistStore): Promise<void> {
  writeQueue = writeQueue.then(() => {
    const tmp = WATCHLIST_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, WATCHLIST_PATH);
  }).catch(err => {
    console.error('[watchlistStore] Write failed:', err);
  });
  return writeQueue;
}

// ── Operations ────────────────────────────────────────────────────────────────

export function addToWatchlist(id: string, profileId = 'adult'): Promise<string[]> {
  const store = readStore();
  const current = store[profileId] ?? [];
  if (current.includes(id)) return Promise.resolve(current);
  const next = [...current, id];
  return writeStore({ ...store, [profileId]: next }).then(() => next);
}

export function removeFromWatchlist(id: string, profileId = 'adult'): Promise<string[]> {
  const store = readStore();
  const current = store[profileId] ?? [];
  const next = current.filter(w => w !== id);
  return writeStore({ ...store, [profileId]: next }).then(() => next);
}

/**
 * Remove a media ID from ALL profiles' watchlists.
 * Called when a media item is deleted from the library.
 */
export function removeFromAllWatchlists(id: string): Promise<void> {
  const store = readStore();
  const updated: WatchlistStore = {};
  for (const [pid, ids] of Object.entries(store)) {
    updated[pid] = ids.filter(w => w !== id);
  }
  return writeStore(updated);
}
