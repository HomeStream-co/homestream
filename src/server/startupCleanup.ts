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
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const LIBRARY_PATH = path.resolve('./media-library.json');
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

function writeLibrary(data: MediaRecord[]): void {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2));
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

// ── Main export ───────────────────────────────────────────────────────────────

export function runStartupCleanup(): void {
  // ── HLS orphan cleanup ───────────────────────────────────────────────────────
  // Runs first so disk space is reclaimed before anything else.
  // HLS_BASE_DIR is derived the same way hlsTranscoder.ts does it, so the
  // path is always consistent without needing a dynamic import.
  cleanupHlsOrphans();

  const library = readLibrary();

  const stuckTranscoding = library.filter(m => m.transcoding === true);
  const stuckEnriching   = library.filter(m => m.enriching === true);

  if (stuckTranscoding.length === 0 && stuckEnriching.length === 0) return;

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

    // The transcoded output is always <original-stem>_tc.mp4
    const tcFilename = item.filename.endsWith('_tc.mp4')
      ? item.filename
      : item.filename.replace(/\.[^.]+$/, '') + '_tc.mp4';
    const tcPath = path.join(UPLOADS_DIR, tcFilename);
    const tcExists = fs.existsSync(tcPath);

    changed = true;

    if (tcExists) {
      // Transcode finished before the restart — clear the flag
      console.log(`[startup]   ✓ "${item.title}" — _tc.mp4 found, clearing transcoding flag`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const origPath = path.join(UPLOADS_DIR, path.basename(originalFilename));
      if (fs.existsSync(origPath)) {
        console.log(`[startup]   ↩ "${item.title}" — _tc.mp4 missing but original found, reverting filename`);
        return {
          ...result,
          transcoding: false,
          filename: path.basename(originalFilename),
          filepath: `/uploads/${path.basename(originalFilename)}`,
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
    writeLibrary(cleaned);
    console.log('[startup] Library cleanup complete.');
  }

  // ── Retry missing metadata in background ────────────────────────────────────
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
