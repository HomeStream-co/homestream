/**
 * existingMediaScanner — finds and imports pre-existing media on the RAID/NAS
 *
 * Called once during setup wizard completion. Walks the entire mediaDir
 * (including library/ and any other subfolders) looking for video files
 * that aren't already in the HomeStream library.
 *
 * IMPORTANT: Never deletes, moves, or modifies existing files.
 * It only reads them and registers them in the library JSON.
 * Files stay exactly where they are on disk.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { readLibrary, writeLibrary } from './libraryStore.js';

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v',
  '.ts', '.webm', '.flv', '.3gp', '.ogv', '.mpg', '.mpeg',
]);

// Folders to skip — these are managed by HomeStream itself
const SKIP_DIRS = new Set(['downloads', 'uploads', '.trash', '@eaDir', '#recycle']);

export interface ScannedFile {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface ScanResult {
  found: number;
  skipped: number;        // already in library
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
      // Skip system/managed folders
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) continue;

      // Skip tiny files (likely samples, trailers < 50MB)
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch { continue; }
      if (size < 50 * 1024 * 1024) continue;

      results.push({ path: fullPath, name: entry.name, size, ext });
    }
  }

  return results;
}

// ─── Extract title from filename ─────────────────────────────────────────────

function extractTitle(filename: string): { title: string; year?: string } {
  let name = path.basename(filename, path.extname(filename));
  // Replace dots/underscores/hyphens with spaces
  name = name.replace(/[._]/g, ' ').replace(/-/g, ' ');
  // Extract year
  const yearMatch = name.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : undefined;
  // Strip year and quality tags
  name = name
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b(720p|1080p|2160p|4k|uhd|bluray|bdrip|dvdrip|webrip|web[-.]?dl|x264|x265|hevc|aac|ac3|dts|hdr|sdr|remux|proper|repack|extended|theatrical|directors\.cut)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: name || path.basename(filename, path.extname(filename)), year };
}

// ─── OMDB fetch ───────────────────────────────────────────────────────────────

async function fetchOMDB(title: string, year?: string): Promise<Record<string, string> | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;
  try {
    const yearParam = year ? `&y=${year}` : '';
    const res = await fetch(
      `http://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6_000) }
    );
    const data = await res.json() as Record<string, string>;
    return data.Response === 'True' ? data : null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan mediaDir for existing video files not yet in the library.
 * Returns a list of found files — does NOT import them yet.
 */
export function scanExistingMedia(mediaDir: string): ScanResult {
  const library = readLibrary<{ filePath?: string; originalFilename?: string }>();
  const knownPaths = new Set(library.map(m => m.filePath ?? ''));
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
 * Files are registered in-place — nothing is moved or copied.
 * OMDB metadata is fetched for each file (rate-limited to avoid hammering).
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
    const { title, year } = extractTitle(file.name);

    try {
      // Fetch OMDB metadata (best-effort)
      const omdb = await fetchOMDB(title, year);

      const mediaItem = {
        id: randomUUID(),
        title: omdb?.Title || title,
        year: omdb?.Year || year || 'Unknown',
        genre: omdb?.Genre ? omdb.Genre.split(',').map((g: string) => g.trim()) : ['Unknown'],
        plot: omdb?.Plot || '',
        director: omdb?.Director || '',
        actors: omdb?.Actors || '',
        imdbRating: omdb?.imdbRating || 'N/A',
        poster: (omdb?.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : '',
        type: (omdb?.Type === 'series' ? 'series' : 'movie') as 'movie' | 'series',
        runtime: omdb?.Runtime || 'Unknown',
        rated: omdb?.Rated && omdb.Rated !== 'N/A' ? omdb.Rated.trim() : 'NR',
        // Point directly at the file on disk — no copy, no move
        filePath: file.path,
        filename: file.name,
        originalFilename: file.name,
        filepath: file.path,
        fileSize: file.size,
        originalSize: file.size,
        addedAt: new Date().toISOString(),
        watchProgress: 0,
        transcoding: false,
        needsMetadata: !omdb,
        metadataAvailable: !!omdb,
        importedFrom: 'existing_scan',
        ccStatus: 'none' as const,
      };

      await writeLibrary(lib => {
        // Double-check not already added (concurrent safety)
        const exists = lib.some(
          m => (m as { filePath?: string }).filePath === file.path ||
               (m as { originalFilename?: string }).originalFilename === file.name
        );
        if (!exists) lib.push(mediaItem as unknown as Record<string, unknown>);
        return lib;
      });

      titles.push(mediaItem.title);
      imported++;
      onProgress?.(i + 1, files.length, mediaItem.title);

      // Small delay between OMDB requests to avoid rate limiting
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
