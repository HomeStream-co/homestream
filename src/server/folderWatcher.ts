/**
 * folderWatcher — auto-import completed downloads into HomeStream
 *
 * Watches the qBittorrent downloads folder for new video files.
 * When a file appears (and is fully written), it runs through the
 * same transcode + OMDB + CC pipeline as a manual upload.
 *
 * Two watch modes:
 *   1. FILE SYSTEM WATCH — uses fs.watch() for instant detection
 *   2. POLLING FALLBACK  — scans every 30s (for network drives / Docker volumes
 *      where inotify events don't propagate)
 *
 * File stability check:
 *   Waits until the file size stops changing for 5 seconds before importing.
 *   This prevents importing partially-written files.
 *
 * Deduplication:
 *   Tracks imported file paths in a Set so the same file is never imported twice,
 *   even if the watcher fires multiple events.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { createJob } from './transcodeStore.js';
import { transcodeFile } from './transcodeWorker.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm', '.flv', '.3gp']);
const STABILITY_WAIT_MS = 5_000;   // wait 5s of no size change before importing
const POLL_INTERVAL_MS = 30_000;   // fallback poll every 30s
const UPLOADS_DIR = path.resolve('./uploads');

// ─── State ────────────────────────────────────────────────────────────────────

const imported = new Set<string>();   // absolute paths already imported
const pending = new Map<string, ReturnType<typeof setTimeout>>();  // path → stability timer

let watcherActive = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let fsWatcher: fs.FSWatcher | null = null;

// ─── OMDB fetch ───────────────────────────────────────────────────────────────

async function fetchOMDB(title: string, year?: string): Promise<Record<string, string> | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;
  try {
    const yearParam = year ? `&y=${year}` : '';
    const res = await fetch(
      `http://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await res.json() as Record<string, string>;
    return data.Response === 'True' ? data : null;
  } catch {
    return null;
  }
}

function extractTitle(filename: string): { title: string; year?: string } {
  let name = path.basename(filename, path.extname(filename));
  name = name.replace(/[._-]/g, ' ');
  const yearMatch = name.match(/[\[(]?(\d{4})[\])]?/);
  const year = yearMatch ? yearMatch[1] : undefined;
  name = name.replace(/[\[(]?\d{4}[\])]?/g, '');
  name = name.replace(/\b(720p|1080p|2160p|4k|bluray|bdrip|dvdrip|webrip|web-dl|x264|x265|hevc|aac|ac3|hdr|sdr|remux)\b/gi, '');
  name = name.replace(/\s+/g, ' ').trim();
  return { title: name, year };
}

// ─── Import pipeline ──────────────────────────────────────────────────────────

async function importFile(filePath: string): Promise<void> {
  if (imported.has(filePath)) return;
  imported.add(filePath);

  const filename = path.basename(filePath);
  console.log(`[watcher] Importing: ${filename}`);

  // Check if already in library (by original filename)
  const library = readLibrary<{ originalFilename?: string }>();
  if (library.some(item => item.originalFilename === filename)) {
    console.log(`[watcher] Already in library, skipping: ${filename}`);
    return;
  }

  const mediaId = randomUUID();
  const { title, year } = extractTitle(filename);
  const ext = path.extname(filename).toLowerCase();

  // Copy to uploads dir with safe name
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const destPath = path.join(UPLOADS_DIR, safeName);

  try {
    fs.copyFileSync(filePath, destPath);
  } catch (err) {
    console.error(`[watcher] Failed to copy ${filename}:`, err);
    imported.delete(filePath);
    return;
  }

  const outputFilename = safeName.replace(/\.[^.]+$/, '') + '_tc.mp4';

  // Fetch metadata
  const omdb = await fetchOMDB(title, year);
  const genres = omdb?.Genre ? omdb.Genre.split(',').map(g => g.trim()) : ['Unknown'];

  const mediaItem = {
    id: mediaId,
    filename: outputFilename,
    originalFilename: filename,
    filepath: `/uploads/${outputFilename}`,
    title: omdb?.Title || title,
    year: omdb?.Year || year || 'Unknown',
    genre: genres,
    plot: omdb?.Plot || '',
    director: omdb?.Director || '',
    actors: omdb?.Actors || '',
    imdbRating: omdb?.imdbRating || 'N/A',
    poster: (omdb?.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : '',
    type: omdb?.Type === 'series' ? 'series' : 'movie',
    runtime: omdb?.Runtime || 'Unknown',
    rated: omdb?.Rated && omdb.Rated !== 'N/A' ? omdb.Rated.trim() : 'NR',
    addedAt: new Date().toISOString(),
    watchProgress: 0,
    fileSize: fs.statSync(destPath).size,
    transcoding: true,
    needsMetadata: !omdb,
    metadataAvailable: !!omdb,
    importedFrom: 'folder_watcher',
    sourceExt: ext,
  };

  createJob(mediaId, safeName, outputFilename);

  await writeLibrary(lib => {
    lib.unshift(mediaItem as unknown as Record<string, unknown>);
    return lib;
  });

  console.log(`[watcher] Added to library: "${mediaItem.title}" (${mediaId})`);

  // Transcode
  try {
    const result = await transcodeFile(mediaId, safeName, outputFilename);
    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
      if (idx !== -1) {
        const item = lib[idx] as Record<string, unknown>;
        item.transcoding = false;
        item.filename = result.outputFilename;
        item.filepath = `/uploads/${result.outputFilename}`;
        item.fileSize = result.finalSize;
        item.originalSize = result.originalSize;
        item.savedBytes = result.savedBytes;
        item.transcodeStrategy = result.strategy;
      }
      return lib;
    });
    console.log(`[watcher] Transcode complete: "${mediaItem.title}"`);
  } catch (err) {
    console.error(`[watcher] Transcode failed for ${mediaId}:`, err);
    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
      if (idx !== -1) {
        (lib[idx] as Record<string, unknown>).transcoding = false;
      }
      return lib;
    });
  }
}

// ─── Stability check ──────────────────────────────────────────────────────────

function scheduleImport(filePath: string): void {
  if (imported.has(filePath)) return;

  // Cancel any existing timer for this file
  const existing = pending.get(filePath);
  if (existing) clearTimeout(existing);

  const check = () => {
    try {
      const stat1 = fs.statSync(filePath);
      setTimeout(() => {
        try {
          const stat2 = fs.statSync(filePath);
          if (stat1.size === stat2.size && stat2.size > 0) {
            pending.delete(filePath);
            importFile(filePath).catch(err =>
              console.error('[watcher] Import error:', err)
            );
          } else {
            // Still writing — check again
            pending.set(filePath, setTimeout(check, STABILITY_WAIT_MS));
          }
        } catch {
          pending.delete(filePath);
        }
      }, STABILITY_WAIT_MS);
    } catch {
      pending.delete(filePath);
    }
  };

  pending.set(filePath, setTimeout(check, STABILITY_WAIT_MS));
}

// ─── Directory scanner ────────────────────────────────────────────────────────

function scanDirectory(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const scan = (d: string) => {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (VIDEO_EXTENSIONS.has(ext) && !imported.has(fullPath)) {
            scheduleImport(fullPath);
          }
        }
      }
    } catch { /* permission error or dir removed */ }
  };

  scan(dir);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start watching a directory for new video files.
 * Safe to call multiple times — only starts once.
 */
export function startWatcher(watchDir: string): void {
  if (watcherActive) return;
  watcherActive = true;

  if (!fs.existsSync(watchDir)) {
    try { fs.mkdirSync(watchDir, { recursive: true }); } catch { /* ignore */ }
  }

  console.log(`[watcher] Watching: ${watchDir}`);

  // Initial scan for any existing files
  scanDirectory(watchDir);

  // fs.watch for instant detection
  try {
    fsWatcher = fs.watch(watchDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) return;
      const fullPath = path.join(watchDir, filename);
      if (fs.existsSync(fullPath)) {
        scheduleImport(fullPath);
      }
    });
    console.log('[watcher] fs.watch active');
  } catch (err) {
    console.warn('[watcher] fs.watch failed (network drive?), using polling only:', err);
  }

  // Polling fallback (catches network drives, Docker bind mounts)
  pollTimer = setInterval(() => scanDirectory(watchDir), POLL_INTERVAL_MS);
}

/**
 * Stop the watcher.
 */
export function stopWatcher(): void {
  watcherActive = false;
  if (fsWatcher) { fsWatcher.close(); fsWatcher = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  console.log('[watcher] Stopped');
}

/**
 * Get watcher status.
 */
export function getWatcherStatus(): { active: boolean; watchDir: string; importedCount: number; pendingCount: number } {
  const watchDir = process.env.MEDIA_DIR
    ? path.join(process.env.MEDIA_DIR, 'downloads')
    : path.resolve('./media/downloads');
  return {
    active: watcherActive,
    watchDir,
    importedCount: imported.size,
    pendingCount: pending.size,
  };
}
