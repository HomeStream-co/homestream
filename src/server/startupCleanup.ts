/**
 * Startup cleanup — runs once when the server boots.
 *
 * Problem 1: transcodeStore is in-memory. If the server restarts mid-transcode,
 * any item with `transcoding: true` in media-library.json will stay that way
 * forever — the player shows the "Optimizing…" holding screen permanently.
 *
 * Fix: On startup, scan the library for items still marked as transcoding.
 * For each one, check whether the transcoded output file exists on disk:
 *   - _tc.mp4 exists  → transcode completed before restart; clear the flag.
 *   - _tc.mp4 missing, but original file exists → transcode was reverted
 *     (output was larger than input) or interrupted. The original is still
 *     playable — clear the flag and update filename to the original.
 *   - Neither exists  → transcode was interrupted and original was deleted;
 *     set transcodeError so the library card shows a red "Transcode failed" badge.
 *
 * Problem 2: enrichment is also in-memory (runs as a background SSE stream).
 * If the server restarts while enrichment is running, `enriching: true` stays
 * set forever. Fix: reset all `enriching: true` flags on boot.
 *
 * Problem 3 (T11 edge case): When the post-encode size check reverts to the
 * original, the library `filename` was already set to `_tc.mp4` before the
 * check ran. The upload handler corrects this in the `.then()` callback, but
 * if the server restarts between the FFmpeg finish and the callback write,
 * the library can point to a non-existent `_tc.mp4`. The transcode cleanup
 * above handles this by falling through to the "original file" check.
 *
 * Problem 4: HLS segments written to /tmp/homestream-hls/<mediaId>/ are
 * never cleaned up if the server restarts — the in-memory jobs map is wiped
 * but the directories remain on disk and accumulate indefinitely.
 *
 * Fix: On startup, delete every subdirectory inside HLS_BASE_DIR. The
 * directories are cheap to recreate (FFmpeg regenerates them on next play)
 * and there is no value in keeping stale segments from a previous run.
 *
 * Problem 5: Orphaned upload files — video files sitting in the uploads/
 * directory that have no corresponding entry in media-library.json. These
 * accumulate when:
 *   a) A user uploads a file but the library write fails mid-way.
 *   b) A transcode produces a _tc.mp4 but the original is never deleted.
 *   c) A media item is deleted from the library but the file deletion fails.
 *
 * Fix: On startup, scan the uploads directory and delete any video file whose
 * basename doesn't match any `filename` or `originalFilename` in the library.
 * Only video extensions are considered — subtitles and other assets are left
 * alone. Deletion is logged with the total disk space reclaimed.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

import { dataPath } from './dataDir.js';
const LIBRARY_PATH = dataPath('media-library.json');
const UPLOADS_DIR  = path.resolve('./uploads');

// Mirrors the constant in hlsTranscoder.ts — kept in sync via the exported
// HLS_BASE_DIR value, but we also need it synchronously here before the
// module is imported, so we derive it the same way.
const HLS_BASE_DIR = path.join(os.tmpdir(), 'homestream-hls');

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediaRecord {
  id: string;
  title: string;
  filename: string;
  originalFilename?: string;
  transcoding?: boolean;
  transcodeError?: string;
  transcodeWarning?: string;
  enriching?: boolean;
  [key: string]: unknown;
}

function readLibrary(): MediaRecord[] {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')) as MediaRecord[]; }
  catch { return []; }
}

/**
 * Write library via the shared queue so startup cleanup never races with
 * concurrent upload/progress writes that may already be in flight.
 * Falls back to direct write if the queue module can't be loaded (e.g. very
 * early startup before the module graph is initialised).
 */
async function writeLibrarySafe(data: MediaRecord[]): Promise<void> {
  try {
    const { writeLibraryDirect } = await import('./libraryStore.js');
    await writeLibraryDirect(data as unknown as Record<string, unknown>[]);
  } catch {
    // Fallback: atomic direct write (startup is single-threaded at this point)
    const tmp = LIBRARY_PATH + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, LIBRARY_PATH);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
  }
}

// ── HLS orphan cleanup ────────────────────────────────────────────────────────

/**
 * Delete all subdirectories inside HLS_BASE_DIR left over from a previous run.
 *
 * Why it's safe to delete everything unconditionally:
 *  - The in-memory `jobs` map in hlsTranscoder is wiped on every restart, so
 *    there are no live references to any of these directories.
 *  - HLS segments are purely a streaming cache — the source file is always
 *    intact. FFmpeg regenerates the segments on the next play request.
 *  - Keeping stale segments wastes disk space (each job can produce hundreds
 *    of .ts files) and can confuse the player if a playlist references
 *    segments that belong to a different encode run.
 *
 * What gets removed: every direct child directory of HLS_BASE_DIR.
 * What is NOT touched: the base directory itself, or any non-directory entries.
 *
 * Disk impact: each 4-second segment is ~500 KB–2 MB depending on bitrate.
 * A 2-hour movie at 4s segments = ~1 800 segments = up to ~3.6 GB per item.
 * With multiple items this adds up fast, so cleanup on restart is important.
 */
function cleanupHlsOrphans(): void {
  if (!fs.existsSync(HLS_BASE_DIR)) {
    // Base dir doesn't exist yet — nothing to clean, and hlsTranscoder will
    // create it when the first HLS request comes in.
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(HLS_BASE_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn(`[startup] Could not read HLS base dir (${HLS_BASE_DIR}): ${err}`);
    return;
  }

  const dirs = entries.filter(e => e.isDirectory());

  if (dirs.length === 0) {
    console.log('[startup] HLS orphan cleanup: no leftover segment directories found.');
    return;
  }

  let removed = 0;
  let totalBytes = 0;
  const errors: string[] = [];

  for (const dir of dirs) {
    const dirPath = path.join(HLS_BASE_DIR, dir.name);

    // Tally disk usage before deleting so we can log how much was reclaimed
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        try {
          const stat = fs.statSync(path.join(dirPath, file));
          if (stat.isFile()) totalBytes += stat.size;
        } catch { /* ignore stat errors */ }
      }
    } catch { /* ignore read errors — we'll still try to delete */ }

    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed++;
    } catch (err) {
      errors.push(`${dir.name}: ${err}`);
    }
  }

  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  if (errors.length === 0) {
    console.log(`[startup] HLS orphan cleanup: removed ${removed} segment director${removed === 1 ? 'y' : 'ies'} (${mb} MB reclaimed).`);
  } else {
    console.warn(`[startup] HLS orphan cleanup: removed ${removed}/${dirs.length} directories (${mb} MB). Errors: ${errors.join('; ')}`);
  }
}

// ── Orphaned upload file cleanup ──────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts']);

/**
 * Delete video files in the uploads directory that have no library entry.
 *
 * Safe because:
 *  - We only delete files whose extension is in VIDEO_EXTENSIONS.
 *  - We cross-reference every file against ALL filenames in the library
 *    (both `filename` and `originalFilename`) before deleting.
 *  - Subtitle files (.srt, .vtt, .ass) and thumbnails are never touched.
 *  - Non-existent uploads dir is silently skipped.
 */
function cleanupOrphanedUploads(library: MediaRecord[]): void {
  if (!fs.existsSync(UPLOADS_DIR)) return;

  // Build a set of every filename the library knows about
  const knownFiles = new Set<string>();
  for (const item of library) {
    if (item.filename)         knownFiles.add(path.basename(item.filename));
    if (item.originalFilename) knownFiles.add(path.basename(item.originalFilename as string));
    // Also protect episode files for TV shows
    if (Array.isArray(item.episodes)) {
      for (const ep of item.episodes as Array<{ filename?: string }>) {
        if (ep.filename) knownFiles.add(path.basename(ep.filename));
      }
    }
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn(`[startup] Could not read uploads dir: ${err}`);
    return;
  }

  const orphans = entries.filter(e => {
    if (!e.isFile()) return false;
    const ext = path.extname(e.name).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) return false;
    return !knownFiles.has(e.name);
  });

  if (orphans.length === 0) {
    console.log('[startup] Orphaned upload cleanup: no orphaned video files found.');
    return;
  }

  let removed = 0;
  let totalBytes = 0;

  for (const orphan of orphans) {
    const filePath = path.join(UPLOADS_DIR, orphan.name);
    try {
      const stat = fs.statSync(filePath);
      totalBytes += stat.size;
      fs.unlinkSync(filePath);
      removed++;
      console.log(`[startup]   🗑 Orphan removed: ${orphan.name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`[startup]   ⚠ Could not delete orphan ${orphan.name}: ${err}`);
    }
  }

  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  console.log(`[startup] Orphaned upload cleanup: removed ${removed} file(s) (${mb} MB reclaimed).`);
}



export function runStartupCleanup(): void {
  // ── HLS orphan cleanup ───────────────────────────────────────────────────────
  // Runs first so disk space is reclaimed before anything else.
  cleanupHlsOrphans();

  const library = readLibrary();

  // ── Orphaned upload file cleanup ─────────────────────────────────────────────
  // Must run AFTER readLibrary so we have the full known-files set.
  // Runs unconditionally — doesn't depend on stuck flags.
  cleanupOrphanedUploads(library);

  // ── Stale TMDB cache file pruner ─────────────────────────────────────────────
  // Removes per-item TMDB cache files older than 90 days from the cache dir.
  // The in-memory cache and baked cache are unaffected — only stale file-backed
  // entries are pruned. Keeps the cache dir from growing unbounded over time.
  pruneStaleTmdbCache();

  const stuckTranscoding = library.filter(m => m.transcoding === true);
  const stuckEnriching   = library.filter(m => m.enriching === true);

  // Note: do NOT early-return here — orphan and TMDB cleanup already ran above.
  // Only skip the library-write section if there's nothing to fix.
  if (stuckTranscoding.length === 0 && stuckEnriching.length === 0) {
    scheduleMetadataRetry();
    return;
  }

  if (stuckTranscoding.length > 0) {
    console.log(`[startup] Found ${stuckTranscoding.length} item(s) with transcoding:true — checking disk…`);
  }
  if (stuckEnriching.length > 0) {
    console.log(`[startup] Found ${stuckEnriching.length} item(s) with enriching:true — resetting…`);
  }

  let changed = false;

  const cleaned = library.map(item => {
    const result = { ...item };

    // ── Reset stuck enrichment flag ──────────────────────────────────────────
    if (item.enriching) {
      result.enriching = false;
      changed = true;
      console.log(`[startup]   ↺ "${item.title}" — enriching flag reset`);
    }

    // ── Resolve stuck transcode flag ─────────────────────────────────────────
    if (!item.transcoding) return result;

    // The transcoded output is always <original-stem>_tc.mp4.
    // For items imported via folderWatcher, the file lives in the downloads dir
    // (stored as an absolute path in filePath). For uploaded items it's in uploads/.
    const storedDir = (() => {
      const fp = (item.filePath ?? item.filepath) as string | undefined;
      if (fp && path.isAbsolute(fp)) return path.dirname(fp);
      return UPLOADS_DIR;
    })();

    const tcFilename = item.filename.endsWith('_tc.mp4')
      ? item.filename
      : item.filename.replace(/\.[^.]+$/, '') + '_tc.mp4';
    const tcPath = path.join(storedDir, tcFilename);
    const tcExists = fs.existsSync(tcPath);

    changed = true;

    if (tcExists) {
      // Transcode finished before the restart — clear the flag
      console.log(`[startup]   ✓ "${item.title}" — _tc.mp4 found, clearing transcoding flag`);
      const { transcoding: _transcoding, transcodeError: _transcodeError, ...rest } = result;
      return { ...rest, filename: tcFilename };
    }

    // _tc.mp4 not found — check if the original file is still on disk.
    // This covers two cases:
    //   a) Transcode was reverted (output was larger) — original kept, library
    //      filename may still say _tc.mp4 (T11 edge case).
    //   b) Transcode was interrupted before FFmpeg finished.
    const originalFilename = item.originalFilename;
    if (originalFilename) {
      // Check in the same directory as the stored filePath first (downloads dir),
      // then fall back to uploads/ for legacy items.
      const origCandidates = [
        path.join(storedDir, path.basename(originalFilename as string)),
        path.join(UPLOADS_DIR, path.basename(originalFilename as string)),
      ];
      const origPath = origCandidates.find(p => fs.existsSync(p));
      if (origPath) {
        console.log(`[startup]   ↩ "${item.title}" — _tc.mp4 missing but original found, reverting filename`);
        return {
          ...result,
          transcoding: false,
          filename: path.basename(originalFilename as string),
          filepath: origPath,
          filePath: origPath,
          transcodeError: undefined,
          transcodeWarning: 'Transcode was reverted or interrupted — playing original file. May not seek perfectly.',
        };
      }
    }

    // Neither _tc.mp4 nor original found — transcode was interrupted and
    // original was already deleted. Mark as failed.
    console.log(`[startup]   ✗ "${item.title}" — no playable file found, marking as failed`);
    return {
      ...result,
      transcoding: false,
      transcodeError: 'Transcode was interrupted by a server restart. Re-upload to try again.',
    };
  });

  if (changed) {
    writeLibrarySafe(cleaned).catch(err =>
      console.error('[startup] Library write failed:', err)
    );
    console.log('[startup] Library cleanup complete.');
  }

  scheduleMetadataRetry();
}

// ── Stale TMDB cache file pruner ──────────────────────────────────────────────

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Remove per-item TMDB cache files that haven't been modified in 90 days.
 *
 * The TMDB cache dir (dataPath('tmdb-cache')) holds one JSON file per item,
 * named by a hash of the TMDB ID. After items are deleted from the library
 * these files are never cleaned up and accumulate indefinitely.
 *
 * 90 days is generous — the in-memory cache TTL is 30 days, so anything
 * older than 90 days is definitely stale and safe to remove.
 * Only .json files are touched; the baked cache is a build-time asset.
 */
export function pruneStaleTmdbCache(): void {
  const cacheDir = dataPath('tmdb-cache');
  if (!fs.existsSync(cacheDir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();
  let pruned = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(cacheDir, entry.name);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > NINETY_DAYS_MS) {
        totalBytes += stat.size;
        fs.unlinkSync(filePath);
        pruned++;
      }
    } catch { /* ignore */ }
  }

  if (pruned > 0) {
    const kb = (totalBytes / 1024).toFixed(1);
    console.log(`[startup] TMDB cache prune: removed ${pruned} stale file(s) (${kb} KB reclaimed).`);
  } else {
    console.log('[startup] TMDB cache prune: no stale files found.');
  }
}

// ── Metadata retry helper ─────────────────────────────────────────────────────

function scheduleMetadataRetry(): void {
  // Items imported while offline (needsMetadata: true) get a second chance
  // now that the server is up and network may be available.
  global.setTimeout(async () => {
    try {
      const { retryMissingMetadata } = await import('./mediaUtils.js');
      await retryMissingMetadata();
    } catch (err) {
      console.error('[startup] Metadata retry error:', err);
    }
  }, 5_000); // 5s delay — let the server fully boot first
}
