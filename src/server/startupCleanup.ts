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
 */

import fs from 'fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');
const UPLOADS_DIR  = path.resolve('./uploads');

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

export function runStartupCleanup(): void {
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
    let result = { ...item };

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
      const { transcoding: _t, transcodeError: _e, ...rest } = result;
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
}
