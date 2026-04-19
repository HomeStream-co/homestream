/**
 * existingMediaScanner — finds and imports pre-existing media on the RAID/NAS.
 *
 * Called once during setup wizard completion. Walks the entire mediaDir
 * looking for video files not already in the HomeStream library.
 *
 * IMPORTANT: Never deletes, moves, or modifies existing files.
 * Files stay exactly where they are on disk — only registered in the library.
 *
 * After import each item automatically gets:
 *   ✓ OMDB metadata (poster, rating, genre, plot, cast, director)
 *   ✓ AI enrichment (tags, mood, themes, recommendations) — if GOOGLE_AI_API_KEY set
 *   ✓ Closed captions auto-downloaded (EN + ES) from OpenSubtitles
 */

import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from './libraryStore.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from './mediaUtils.js';

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v',
  '.ts', '.webm', '.flv', '.3gp', '.ogv', '.mpg', '.mpeg',
]);

// Folders to skip — system/managed dirs that should never be scanned
const SKIP_DIRS = new Set([
  'downloads', 'uploads', '.trash', '@eaDir', '#recycle',
  '.ds_store', 'system volume information', '$recycle.bin',
  'lost+found', '.thumbnails', '.cache',
]);

export interface ScannedFile {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface ScanResult {
  found: number;
  skipped: number;   // already in library
  files: ScannedFile[];
}

export interface ImportResult {
  imported: number;
  failed: number;
  titles: string[];
}

// ─── Walk directory recursively ───────────────────────────────────────────────

function walkDir(dir: string, results: ScannedFile[] = []): ScannedFile[] {
  if (!fs.existsSync(dir)) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) continue;

      // Skip tiny files — likely samples or trailers (< 50 MB)
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch { continue; }
      if (size < 50 * 1024 * 1024) continue;

      results.push({ path: fullPath, name: entry.name, size, ext });
    }
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan mediaDir for existing video files not yet in the library.
 * Returns a list of found files — does NOT import them yet.
 */
export function scanExistingMedia(mediaDir: string): ScanResult {
  const library = readLibrary<{ filePath?: string; filepath?: string; originalFilename?: string }>();
  const knownPaths = new Set([
    ...library.map(m => m.filePath ?? ''),
    ...library.map(m => m.filepath ?? ''),
  ]);
  const knownNames = new Set(library.map(m => m.originalFilename ?? ''));

  const allFiles = walkDir(mediaDir);
  const newFiles: ScannedFile[] = [];
  let skipped = 0;

  for (const f of allFiles) {
    if (knownPaths.has(f.path) || knownNames.has(f.name)) {
      skipped++;
    } else {
      newFiles.push(f);
    }
  }

  return { found: newFiles.length, skipped, files: newFiles };
}

/**
 * Import a list of scanned files into the HomeStream library.
 *
 * Files are registered in-place — nothing is moved or copied.
 * Each file gets:
 *   1. OMDB metadata fetch (poster, rating, genre, plot, cast, director)
 *   2. Library registration
 *   3. AI enrichment triggered in background
 *   4. Closed captions auto-downloaded in background
 */
export async function importExistingMedia(
  files: ScannedFile[],
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<ImportResult> {
  let imported = 0;
  let failed = 0;
  const titles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const { title: extractedTitle, year: extractedYear } = extractTitle(file.name);

      // 1. Fetch OMDB metadata (best-effort — null if offline or no key)
      const omdb = await fetchOMDB(extractedTitle, extractedYear);

      // 2. Build standardised library record
      const mediaItem = buildMediaItem({
        filename: file.name,
        originalFilename: file.name,
        filePath: file.path,   // point directly at file on disk — no copy
        fileSize: file.size,
        omdb,
        extractedTitle,
        extractedYear,
        transcoding: false,    // existing files are already in their native format
        importedFrom: 'existing_scan',
      });

      // 3. Write to library (concurrent-safe via queue)
      await writeLibrary(lib => {
        const exists = lib.some(m => {
          const r = m as { filePath?: string; filepath?: string; originalFilename?: string };
          return r.filePath === file.path || r.filepath === file.path || r.originalFilename === file.name;
        });
        if (!exists) lib.push(mediaItem as unknown as Record<string, unknown>);
        return lib;
      });

      titles.push(mediaItem.title);
      imported++;
      onProgress?.(i + 1, files.length, mediaItem.title);

      // 4. Trigger AI enrichment + CC in background (non-blocking)
      //    Stagger slightly so we don't hammer the server on large libraries
      const delay = Math.min(i * 200, 3000);
      setTimeout(() => {
        runEnrichmentInBackground(mediaItem.id).catch(() => {});
        runCaptionFetchInBackground(mediaItem.id).catch(() => {});
      }, delay);

      // Rate-limit OMDB requests
      if (omdb && i < files.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error(`[scanner] Failed to import ${file.name}:`, err);
      failed++;
    }
  }

  return { imported, failed, titles };
}
