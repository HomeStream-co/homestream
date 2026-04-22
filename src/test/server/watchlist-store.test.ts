/**
 * watchlist-store.test.ts
 *
 * Unit tests for src/server/watchlistStore.ts
 *
 * The watchlist is the user's "want to watch" list — per-profile, persistent.
 * Bugs here mean:
 *   - Items silently disappear from watchlists
 *   - Profiles bleed into each other's lists
 *   - Legacy data (plain array format) gets corrupted on first write
 *   - Deleting a media item leaves ghost IDs in watchlists
 *
 * All tests run against an in-memory fs mock — no disk I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory fs mock ─────────────────────────────────────────────────────────

let diskData: string | null = null;

vi.mock('fs', () => ({
  default: {
    existsSync: () => diskData !== null,
    readFileSync: () => {
      if (diskData === null) throw new Error('ENOENT');
      return diskData;
    },
    writeFileSync: (_p: string, data: string) => { diskData = data; },
  },
  existsSync: () => diskData !== null,
  readFileSync: () => {
    if (diskData === null) throw new Error('ENOENT');
    return diskData;
  },
  writeFileSync: (_p: string, data: string) => { diskData = data; },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/tmp/test-${name}`,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const {
  readWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  removeFromAllWatchlists,
} = await import('../../server/watchlistStore.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetDisk() { diskData = null; }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readWatchlist()', () => {
  beforeEach(resetDisk);

  it('returns empty array when no file exists', () => {
    expect(readWatchlist('adult')).toEqual([]);
  });

  it('returns empty array for unknown profile', () => {
    diskData = JSON.stringify({ adult: ['id1'] });
    expect(readWatchlist('unknown-profile')).toEqual([]);
  });

  it('defaults to adult profile when no profileId given', () => {
    diskData = JSON.stringify({ adult: ['id1', 'id2'] });
    expect(readWatchlist()).toEqual(['id1', 'id2']);
  });

  it('returns the correct profile list', () => {
    diskData = JSON.stringify({ adult: ['a1'], kids: ['k1', 'k2'] });
    expect(readWatchlist('kids')).toEqual(['k1', 'k2']);
    expect(readWatchlist('adult')).toEqual(['a1']);
  });

  it('returns empty array on JSON parse error', () => {
    diskData = '{ bad json';
    expect(readWatchlist('adult')).toEqual([]);
  });

  it('migrates legacy plain-array format to adult profile', () => {
    // Old format: the file was just a JSON array, not an object
    diskData = JSON.stringify(['legacy1', 'legacy2']);
    expect(readWatchlist('adult')).toEqual(['legacy1', 'legacy2']);
  });
});

describe('addToWatchlist()', () => {
  beforeEach(resetDisk);

  it('adds an item to an empty watchlist', async () => {
    const result = await addToWatchlist('movie1', 'adult');
    expect(result).toContain('movie1');
  });

  it('persists the item so readWatchlist sees it', async () => {
    await addToWatchlist('movie1', 'adult');
    expect(readWatchlist('adult')).toContain('movie1');
  });

  it('does not add duplicates', async () => {
    await addToWatchlist('movie1', 'adult');
    await addToWatchlist('movie1', 'adult');
    const list = readWatchlist('adult');
    expect(list.filter(id => id === 'movie1')).toHaveLength(1);
  });

  it('adds to the correct profile without affecting others', async () => {
    await addToWatchlist('movie1', 'adult');
    await addToWatchlist('show1', 'kids');
    expect(readWatchlist('adult')).toContain('movie1');
    expect(readWatchlist('adult')).not.toContain('show1');
    expect(readWatchlist('kids')).toContain('show1');
    expect(readWatchlist('kids')).not.toContain('movie1');
  });

  it('defaults to adult profile when no profileId given', async () => {
    await addToWatchlist('movie1');
    expect(readWatchlist('adult')).toContain('movie1');
  });

  it('returns the updated list', async () => {
    await addToWatchlist('a', 'adult');
    const result = await addToWatchlist('b', 'adult');
    expect(result).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('removeFromWatchlist()', () => {
  beforeEach(resetDisk);

  it('removes an existing item', async () => {
    await addToWatchlist('movie1', 'adult');
    await removeFromWatchlist('movie1', 'adult');
    expect(readWatchlist('adult')).not.toContain('movie1');
  });

  it('does not throw when removing a non-existent item', async () => {
    await expect(removeFromWatchlist('ghost', 'adult')).resolves.not.toThrow();
  });

  it('only removes the targeted item', async () => {
    await addToWatchlist('movie1', 'adult');
    await addToWatchlist('movie2', 'adult');
    await removeFromWatchlist('movie1', 'adult');
    expect(readWatchlist('adult')).toContain('movie2');
    expect(readWatchlist('adult')).not.toContain('movie1');
  });

  it('does not affect other profiles', async () => {
    await addToWatchlist('movie1', 'adult');
    await addToWatchlist('movie1', 'kids');
    await removeFromWatchlist('movie1', 'adult');
    expect(readWatchlist('kids')).toContain('movie1');
  });
});

describe('removeFromAllWatchlists()', () => {
  beforeEach(resetDisk);

  it('removes the ID from every profile', async () => {
    await addToWatchlist('shared', 'adult');
    await addToWatchlist('shared', 'kids');
    await addToWatchlist('shared', 'profile_custom');
    await removeFromAllWatchlists('shared');
    expect(readWatchlist('adult')).not.toContain('shared');
    expect(readWatchlist('kids')).not.toContain('shared');
    expect(readWatchlist('profile_custom')).not.toContain('shared');
  });

  it('preserves other items in each profile', async () => {
    await addToWatchlist('keep', 'adult');
    await addToWatchlist('remove', 'adult');
    await addToWatchlist('keep', 'kids');
    await removeFromAllWatchlists('remove');
    expect(readWatchlist('adult')).toContain('keep');
    expect(readWatchlist('kids')).toContain('keep');
  });

  it('does not throw when ID is not in any watchlist', async () => {
    await expect(removeFromAllWatchlists('ghost')).resolves.not.toThrow();
  });

  it('handles empty store gracefully', async () => {
    await expect(removeFromAllWatchlists('any')).resolves.not.toThrow();
  });
});

describe('watchlistStore — per-profile isolation', () => {
  beforeEach(resetDisk);

  it('maintains independent lists for adult, kids, and custom profiles', async () => {
    await addToWatchlist('m1', 'adult');
    await addToWatchlist('m2', 'kids');
    await addToWatchlist('m3', 'profile_abc');

    expect(readWatchlist('adult')).toEqual(['m1']);
    expect(readWatchlist('kids')).toEqual(['m2']);
    expect(readWatchlist('profile_abc')).toEqual(['m3']);
  });
});
