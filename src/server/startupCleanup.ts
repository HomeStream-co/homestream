/**
 * Startup cleanup — runs once when the server boots.
 *
 * Problem: transcodeStore is in-memory. If the server restarts mid-transcode,
 * any item with `transcoding: true` in media-library.json will stay that way
 * forever — the player shows the "Optimizing…" holding screen permanently.
 *
 * Fix: On startup, scan the library for items still marked as transcoding.
 * For each one, check whether the transcoded output file exists on disk:
 *   - Exists  → transcode completed before restart; clear the flag.
 *   - Missing → transcode was interrupted; clear the flag and set transcodeError
 *               so the library card shows a red "Transcode failed" badge.
 */

import fs from 'fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('./media-library.json');
const UPLOADS_DIR  = path.resolve('./uploads');

interface MediaRecord {
  id: string;
  title: string;
  filename: string;
  transcoding?: boolean;
  transcodeError?: string;
  transcodeWarning?: string;
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
  const stuck = library.filter(m => m.transcoding === true);

  if (stuck.length === 0) return;

  console.log(`[startup] Found ${stuck.length} item(s) with transcoding:true — checking disk…`);

  let changed = false;

  const cleaned = library.map(item => {
    if (!item.transcoding) return item;

    // The transcoded output is always <original-stem>_tc.mp4
    const tcFilename = item.filename.replace(/\.[^.]+$/, '') + '_tc.mp4';
    const tcPath = path.join(UPLOADS_DIR, tcFilename);
    const tcExists = fs.existsSync(tcPath);

    changed = true;

    if (tcExists) {
      // Transcode finished before the restart — just clear the flag
      console.log(`[startup]   ✓ "${item.title}" — _tc.mp4 found, clearing transcoding flag`);
      const { transcoding: _t, transcodeError: _e, ...rest } = item;
      return { ...rest, filename: tcFilename };
    } else {
      // Transcode was interrupted — mark as failed so the UI shows an error badge
      console.log(`[startup]   ✗ "${item.title}" — _tc.mp4 missing, marking as failed`);
      return {
        ...item,
        transcoding: false,
        transcodeError: 'Transcode was interrupted by a server restart. Re-upload to try again.',
      };
    }
  });

  if (changed) {
    writeLibrary(cleaned);
    console.log('[startup] Library cleanup complete.');
  }
}
