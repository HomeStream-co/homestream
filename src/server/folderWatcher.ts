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

import { transcodeFile } from './transcodeWorker.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from './mediaUtils.js';
import { readConfig } from './configStore.js';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function moveFile(src: string, dest: string): void {
  if (src === dest) return;
  if (!fs.existsSync(src)) return;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else throw err;
  }
}

function cleanFilename(omdbTitle: string | undefined, omdbYear: string | undefined, originalBasename: string, ext: string): string {
  if (omdbTitle) {
    const safeName = omdbTitle
      .replace(/[<>:"/\\|?*]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
    const yearPart = omdbYear ? `_${omdbYear}` : '';
    return `${safeName}${yearPart}${ext}`;
  }
  return originalBasename.replace(/^\d{13}-/, '');
}

function resolveTargetDir(libraryDir: string, type: string, genres: string[], title: string): string {
  if (type === 'series') return path.join(libraryDir, 'tv');
  const g = genres.map(x => x.toLowerCase());
  // Anime heuristic
  const isAnime = g.includes('animation') &&
    (title.toLowerCase().match(/\b(anime|manga|shonen|shojo|seinen|isekai|mecha|naruto|bleach|one piece|dragon ball|attack on titan|demon slayer|jujutsu|chainsaw|spy x|my hero)\b/) != null ||
     g.includes('japan'));
  if (isAnime) return path.join(libraryDir, 'movies');
  return path.join(libraryDir, 'movies'); // all non-TV goes to movies/
}

// ─── Import pipeline ──────────────────────────────────────────────────────────

async function importFile(filePath: string): Promise<void> {
  if (importedPaths.has(filePath)) return;
  importedPaths.add(filePath);

  const filename = path.basename(filePath);
  const ext      = path.extname(filename).toLowerCase();
  console.log(`[watcher] Importing: ${filename}`);

  // Check if already in library by path or original filename
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

  // Fetch OMDB metadata
  const omdb = await fetchOMDB(extractedTitle, extractedYear);

  const genres: string[] = omdb?.Genre
    ? omdb.Genre.split(',').map((g: string) => g.trim()).filter(Boolean)
    : ['Unknown'];

  const fileSize = (() => {
    try { return fs.statSync(filePath).size; } catch { return 0; }
  })();

  const cfg = readConfig();
  const libraryDir = cfg.libraryDir || path.dirname(filePath);
  const targetDir  = resolveTargetDir(libraryDir, 'movie', genres, extractedTitle);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  if (cfg.autoTranscode === false) {
    // No transcode — move directly to library/movies/ with clean name
    const destFilename = cleanFilename(omdb?.Title, omdb?.Year, filename, ext);
    const destPath     = path.join(targetDir, destFilename);
    try { moveFile(filePath, destPath); } catch (e) {
      console.error(`[watcher] Failed to move file to library:`, e);
    }

    if (!fs.existsSync(destPath)) {
      console.error(`[watcher] File missing after move: ${destPath}`);
      return;
    }

    const finalSize = fs.statSync(destPath).size;
    const mediaItem = buildMediaItem({
      filename: destFilename,
      originalFilename: filename,
      filePath: destPath,
      fileSize: finalSize,
      omdb,
      extractedTitle,
      extractedYear,
      transcoding: false,
      importedFrom: 'folder_watcher',
    });

    await writeLibrary(lib => {
      lib.unshift(mediaItem as unknown as Record<string, unknown>);
      return lib;
    });

    console.log(`[watcher] ✓ Added to library (no transcode): "${mediaItem.title}" → ${destPath}`);
    runEnrichmentInBackground(mediaItem.id).catch(() => {});
    runCaptionFetchInBackground(mediaItem.id).catch(() => {});
    return;
  }

  // Transcode path — output goes directly to targetDir with clean name
  const tcBase     = cleanFilename(omdb?.Title, omdb?.Year, filename, '').replace(/\.mp4$/, '');
  const tcFilename = `${tcBase}_tc.mp4`;
  const outputPath = path.join(targetDir, tcFilename);

  console.log(`[watcher] Transcoding → ${outputPath}`);

  let finalPath     = outputPath;
  let finalFilename = tcFilename;
  let finalSize     = fileSize;
  const extraFields: Record<string, unknown> = {};

  try {
    const mediaItemId = buildMediaItem({
      filename,
      originalFilename: filename,
      filePath,
      fileSize,
      omdb,
      extractedTitle,
      extractedYear,
      transcoding: false,
      importedFrom: 'folder_watcher',
    }).id; // generate stable ID to pass to transcoder

    const result = await transcodeFile(mediaItemId, filePath, outputPath);
    finalSize = result.finalSize;
    extraFields.savedBytes = result.savedBytes;
    extraFields.transcodeStrategy = result.strategy;
    extraFields.originalSize = result.originalSize;

    if (result.outputFilename !== path.basename(outputPath)) {
      // Reverted — move original to library/movies/ with clean name
      finalFilename = cleanFilename(omdb?.Title, omdb?.Year, filename, ext);
      finalPath     = path.join(targetDir, finalFilename);
      console.log(`[watcher] Reverted to original, moving: ${filePath} → ${finalPath}`);
      moveFile(filePath, finalPath);
    }
    // _tc.mp4 is already written directly to targetDir — nothing to move
    console.log(`[watcher] ✓ Transcode complete: saved ${Math.round((result.savedBytes ?? 0) / 1024 / 1024)}MB`);
  } catch (err) {
    console.error(`[watcher] Transcode failed:`, err);
    // Move original to library/movies/ so it's still playable
    finalFilename = cleanFilename(omdb?.Title, omdb?.Year, filename, ext);
    finalPath     = path.join(targetDir, finalFilename);
    try { moveFile(filePath, finalPath); } catch (e) {
      console.error(`[watcher] Also failed to move original:`, e);
    }
    extraFields.transcodeError = String(err);
  }

  // Delete source from downloads if it still exists and isn't the final file
  if (fs.existsSync(filePath) && filePath !== finalPath) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[watcher] Deleted source from downloads: ${filePath}`);
    } catch (e) {
      console.warn(`[watcher] Could not delete source:`, e);
    }
  }

  // Only add to library once file is confirmed in place
  if (!fs.existsSync(finalPath)) {
    console.error(`[watcher] Final file missing: ${finalPath}. NOT adding to library.`);
    return;
  }

  finalSize = fs.statSync(finalPath).size;

  const mediaItem = buildMediaItem({
    filename: finalFilename,
    originalFilename: filename,
    filePath: finalPath,
    fileSize: finalSize,
    omdb,
    extractedTitle,
    extractedYear,
    transcoding: false,
    importedFrom: 'folder_watcher',
  });

  // Merge extra transcode fields
  Object.assign(mediaItem, extraFields);

  await writeLibrary(lib => {
    lib.unshift(mediaItem as unknown as Record<string, unknown>);
    return lib;
  });

  console.log(`[watcher] ✓ Added to library: "${mediaItem.title}" → ${finalPath}`);

  // Trigger AI enrichment + CC in background
  runEnrichmentInBackground(mediaItem.id).catch(() => {});
  runCaptionFetchInBackground(mediaItem.id).catch(() => {});
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
  // .unref() so this timer never prevents a clean process exit (SIGTERM/SIGINT)
  pollTimer = setInterval(() => scanDirectory(watchDir), POLL_INTERVAL_MS).unref();
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
