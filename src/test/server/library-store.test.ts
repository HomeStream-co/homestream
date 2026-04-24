/**
 * library-store.test.ts
 *
 * Tests for src/server/libraryStore.ts — the serialised read/write layer
 * that protects media-library.json from concurrent-write corruption.
 *
 * What we verify:
 *   - readLibrary returns [] when the file doesn't exist
 *   - readLibrary returns [] when the file contains invalid JSON (corruption recovery)
 *   - writeLibrary performs an atomic tmp+rename write
 *   - writeLibrary serialises concurrent writes (queue ordering)
 *   - writeLibrary calls the updater with the current library contents
 *   - writeLibraryDirect writes a pre-built array without reading first
 *   - A failed rename cleans up the .tmp file and logs the error
 *
 * Error codes produced when these tests fail:
 *   LIB_STORE_MISSING     — readLibrary didn't return [] for missing file
 *   LIB_STORE_CORRUPT     — readLibrary didn't return [] for corrupt JSON
 *   LIB_STORE_ATOMIC      — writeLibrary didn't use tmp+rename pattern
 *   LIB_STORE_QUEUE       — concurrent writes weren't serialised
 *   LIB_STORE_UPDATER     — updater wasn't called with current contents
 *   LIB_STORE_DIRECT      — writeLibraryDirect didn't persist the array
 *   LIB_STORE_RENAME_FAIL — failed rename didn't clean up .tmp file
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockFiles: Record<string, string> = {};
const mockRenameSync = vi.fn();
const mockUnlinkSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync:    (p: string) => p in mockFiles,
    readFileSync:  (p: string) => {
      if (!(p in mockFiles)) throw new Error(`ENOENT: ${p}`);
      return mockFiles[p];
    },
    writeFileSync: (p: string, data: string) => { mockFiles[p] = data; },
    renameSync:    (src: string, dst: string) => {
      mockRenameSync(src, dst);
      if (mockFiles[src] !== undefined) {
        mockFiles[dst] = mockFiles[src];
        delete mockFiles[src];
      }
    },
    unlinkSync:    (p: string) => {
      mockUnlinkSync(p);
      delete mockFiles[p];
    },
  },
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/data/${name}`,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { readLibrary, writeLibrary, writeLibraryDirect } from '../../server/libraryStore.js';

const LIBRARY_PATH = '/data/media-library.json';
const TMP_PATH     = LIBRARY_PATH + '.tmp';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MediaItem { id: string; title: string }

function seedLibrary(items: MediaItem[]) {
  mockFiles[LIBRARY_PATH] = JSON.stringify(items);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('libraryStore', () => {
  beforeEach(() => {
    mockFiles = {};
    mockRenameSync.mockClear();
    mockUnlinkSync.mockClear();
  });

  // ── readLibrary ─────────────────────────────────────────────────────────────

  it('[LIB_STORE_MISSING] returns [] when library file does not exist', () => {
    const result = readLibrary();
    expect(result).toEqual([]);
  });

  it('[LIB_STORE_CORRUPT] returns [] when library file contains invalid JSON', () => {
    mockFiles[LIBRARY_PATH] = '{ this is not valid json !!!';
    const result = readLibrary();
    expect(result).toEqual([]);
  });

  it('[LIB_STORE_CORRUPT] returns [] when library file is empty string', () => {
    mockFiles[LIBRARY_PATH] = '';
    const result = readLibrary();
    expect(result).toEqual([]);
  });

  it('[LIB_STORE_MISSING] returns the parsed array when file exists and is valid', () => {
    const items: MediaItem[] = [{ id: '1', title: 'Inception' }];
    seedLibrary(items);
    const result = readLibrary<MediaItem>();
    expect(result).toEqual(items);
  });

  // ── writeLibrary ────────────────────────────────────────────────────────────

  it('[LIB_STORE_ATOMIC] writes to .tmp file then renames to final path', async () => {
    seedLibrary([]);

    await writeLibrary<MediaItem>(items => [...items, { id: '1', title: 'Dune' }]);

    // renameSync must have been called with (tmp, final)
    expect(mockRenameSync).toHaveBeenCalledWith(TMP_PATH, LIBRARY_PATH);
    // Final file should contain the new item
    const saved = JSON.parse(mockFiles[LIBRARY_PATH]) as MediaItem[];
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('Dune');
  });

  it('[LIB_STORE_UPDATER] calls updater with current library contents', async () => {
    const existing: MediaItem[] = [{ id: '1', title: 'Existing' }];
    seedLibrary(existing);

    const updater = vi.fn((items: MediaItem[]) => [...items, { id: '2', title: 'New' }]);
    await writeLibrary<MediaItem>(updater);

    expect(updater).toHaveBeenCalledOnce();
    expect(updater).toHaveBeenCalledWith(existing);
  });

  it('[LIB_STORE_QUEUE] serialises concurrent writes — order is preserved', async () => {
    seedLibrary([]);
    const order: number[] = [];

    // Fire 3 writes simultaneously — they must execute in order
    const p1 = writeLibrary<MediaItem>(items => {
      order.push(1);
      return [...items, { id: '1', title: 'First' }];
    });
    const p2 = writeLibrary<MediaItem>(items => {
      order.push(2);
      return [...items, { id: '2', title: 'Second' }];
    });
    const p3 = writeLibrary<MediaItem>(items => {
      order.push(3);
      return [...items, { id: '3', title: 'Third' }];
    });

    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);

    const saved = JSON.parse(mockFiles[LIBRARY_PATH]) as MediaItem[];
    expect(saved).toHaveLength(3);
    expect(saved.map(i => i.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('[LIB_STORE_QUEUE] each write sees the result of the previous write', async () => {
    seedLibrary([]);

    await writeLibrary<MediaItem>(items => [...items, { id: '1', title: 'A' }]);
    await writeLibrary<MediaItem>(items => {
      // Should see the item written by the first call
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('A');
      return [...items, { id: '2', title: 'B' }];
    });

    const saved = JSON.parse(mockFiles[LIBRARY_PATH]) as MediaItem[];
    expect(saved).toHaveLength(2);
  });

  // ── writeLibraryDirect ──────────────────────────────────────────────────────

  it('[LIB_STORE_DIRECT] writeLibraryDirect persists the provided array', async () => {
    const items: MediaItem[] = [
      { id: '1', title: 'Movie A' },
      { id: '2', title: 'Movie B' },
    ];

    await writeLibraryDirect<MediaItem>(items);

    const saved = JSON.parse(mockFiles[LIBRARY_PATH]) as MediaItem[];
    expect(saved).toEqual(items);
  });

  it('[LIB_STORE_DIRECT] writeLibraryDirect overwrites existing contents', async () => {
    seedLibrary([{ id: 'old', title: 'Old Movie' }]);

    await writeLibraryDirect<MediaItem>([{ id: 'new', title: 'New Movie' }]);

    const saved = JSON.parse(mockFiles[LIBRARY_PATH]) as MediaItem[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('new');
  });

  // ── Rename failure ──────────────────────────────────────────────────────────

  it('[LIB_STORE_RENAME_FAIL] cleans up .tmp file when rename throws', async () => {
    seedLibrary([]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Make renameSync throw on the first call
    mockRenameSync.mockImplementationOnce(() => {
      // Simulate the tmp file existing before the throw
      mockFiles[TMP_PATH] = '[]';
      throw new Error('EACCES: permission denied');
    });

    await writeLibrary(() => []);

    // unlinkSync should have been called to clean up the .tmp file
    expect(mockUnlinkSync).toHaveBeenCalledWith(TMP_PATH);
    // Error should have been logged
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[libraryStore]'),
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});
