/**
 * folderWatcher — auto-import completed downloads into HomeStream.
 *
 * Watches the qBittorrent downloads folder for new video files.
 * When a file appears and is fully written, it runs through the full pipeline:
 *   1. OMDB metadata fetch (poster, rating, genre, plot, cast, director)
 *   2. Library registration
 *   3. Smart transcode (skip/remux/encode based on codec analysis)
 *   4. AI enrichment in background (if GOOGLE_AI_API_KEY set)
 *   5. Closed captions auto-downloaded in background (EN + ES)
 *
 * Two watch modes:
 *   1. FILE SYSTEM WATCH — fs.watch() for instant detection
 *   2. POLLING FALLBACK  — scans every 30s for network drives / Docker volumes
 *      where inotify events don't propagate
 *
 * File stability check:
 *   Waits until file size stops changing for 5s before importing.
 *   Prevents importing partially-written files.
 *
 * Deduplication:
 *   Tracks imported file paths in a Set — same file never imported twice.
 *
 * NOTE: Downloaded files are imported IN-PLACE from the downloads folder.
 * They are NOT copied to uploads/ — this saves disk space on RAID arrays.
 * The file path stored in the library points directly to the downloads folder.
 */

import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { createJob } from './transcodeStore.js';
import { transcodeFile } from './transcodeWorker.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from './mediaUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v',
  '.ts', '.webm', '.flv', '.3gp', '.ogv',
]);
const STABILITY_WAIT_MS = 5_000;   // wait 5s of no size change before importing
const POLL_INTERVAL_MS  = 30_000;  // fallback poll every 30s

// ─── State ────────────────────────────────────────────────────────────────────

const importedPaths = new Set<string>();  // absolute paths already imported this session
const pending = new Map<string, ReturnType<typeof setTimeout>>();

let watcherActive = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let fsWatcher: fs.FSWatcher | null = null;
let activeWatchDir = '';

// ─── Import pipeline ──────────────────────────────────────────────────────────

async function importFile(filePath: string): Promise<void> {
  if (importedPaths.has(filePath)) return;
  importedPaths.add(filePath);

  const filename = path.basename(filePath);
  console.log(`[watcher] Importing: ${filename}`);

  // Check if already in library
  const library = readLibrary<{ originalFilename?: string; filePath?: string; filepath?: string }>();
  if (library.some(item =>
    item.originalFilename === filename ||
    item.filePath === filePath ||
    item.filepath === filePath
  )) {
    console.log(`[watcher] Already in library, skipping: ${filename}`);
    return;
  }

  const { title: extractedTitle, year: extractedYear } = extractTitle(filename);
  const ext = path.extname(filename).toLowerCase();

  // Fetch OMDB metadata
  const omdb = await fetchOMDB(extractedTitle, extractedYear);

  // Determine output path for transcoded file
  // Transcoded file lives alongside the source in the downloads folder
  const outputFilename = filename.replace(/\.[^.]+$/, '') + '_tc.mp4';
  const outputPath = path.join(path.dirname(filePath), outputFilename);

  const fileSize = (() => {
    try { return fs.statSync(filePath).size; } catch { return 0; }
  })();

  // Build library record — initially points at source file.
  // Always mark transcoding:true so the UI shows "Optimizing…" while the
  // transcoder runs. The transcoder itself decides whether to skip, remux,
  // or re-encode based on codec analysis — it may finish instantly for
  // already-efficient H.264 MP4 files.
  const mediaItem = buildMediaItem({
    filename,
    originalFilename: filename,
    filePath,                    // stream from source until transcode completes
    fileSize,
    omdb,
    extractedTitle,
    extractedYear,
    transcoding: true,
    importedFrom: 'folder_watcher',
  });

  // Register transcode job
  createJob(mediaItem.id, filename, outputFilename);

  // Write to library immediately — item visible in UI right away
  await writeLibrary(lib => {
    lib.unshift(mediaItem as unknown as Record<string, unknown>);
    return lib;
  });

  console.log(`[watcher] Added to library: "${mediaItem.title}" (${mediaItem.id})`);

  // Trigger AI enrichment + CC in background immediately
  runEnrichmentInBackground(mediaItem.id).catch(() => {});
  runCaptionFetchInBackground(mediaItem.id).catch(() => {});

  // Transcode in background
  try {
    const result = await transcodeFile(mediaItem.id, filePath, outputPath);
    // result.outputFilename is the basename of whichever file won (output or original)
    const finalPath = result.outputFilename === path.basename(outputPath)
      ? outputPath
      : filePath; // reverted to original

    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
      if (idx !== -1) {
        const item = lib[idx] as Record<string, unknown>;
        item.transcoding = false;
        item.filename = result.outputFilename;
        item.filepath = finalPath;
        item.filePath = finalPath;
        item.fileSize = result.finalSize;
        item.originalSize = result.originalSize;
        item.savedBytes = result.savedBytes;
        item.transcodeStrategy = result.strategy;
      }
      return lib;
    });
    console.log(`[watcher] Transcode complete: "${mediaItem.title}" — saved ${Math.round((result.savedBytes ?? 0) / 1024 / 1024)}MB`);
  } catch (err) {
    console.error(`[watcher] Transcode failed for ${mediaItem.id}:`, err);
    // Keep original file — mark transcoding done so UI doesn't spin forever
    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
      if (idx !== -1) {
        const item = lib[idx] as Record<string, unknown>;
        item.transcoding = false;
        item.transcodeError = String(err);
      }
      return lib;
    });
  }
}

// ─── Stability check ──────────────────────────────────────────────────────────

function scheduleImport(filePath: string): void {
  if (importedPaths.has(filePath)) return;

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
          if (VIDEO_EXTENSIONS.has(ext) && !importedPaths.has(fullPath)) {
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
 * Safe to call multiple times — only starts once per session.
 */
export function startWatcher(watchDir: string): void {
  if (watcherActive) return;
  watcherActive = true;
  activeWatchDir = watchDir;

  if (!fs.existsSync(watchDir)) {
    try { fs.mkdirSync(watchDir, { recursive: true }); } catch { /* ignore */ }
  }

  console.log(`[watcher] Watching: ${watchDir}`);

  // Initial scan for any files already present
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

  // Polling fallback — catches network drives, Docker bind mounts, NFS
  pollTimer = setInterval(() => scanDirectory(watchDir), POLL_INTERVAL_MS);
}

/**
 * Stop the watcher and clear all pending timers.
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
 * Get current watcher status for health checks.
 */
export function getWatcherStatus() {
  return {
    active: watcherActive,
    watchDir: activeWatchDir,
    importedCount: importedPaths.size,
    pendingCount: pending.size,
  };
}
