/**
 * mediaUtils — shared utilities used by upload, folderWatcher, and existingMediaScanner.
 *
 * Previously each module had its own copy of:
 *   - extractTitle()       — parse title/year from filename
 *   - fetchOMDB()          — call OMDB API
 *   - buildMediaItem()     — construct the library record
 *   - runEnrichment()      — trigger AI enrichment in background
 *   - fetchCaptions()      — trigger CC auto-download in background
 *
 * Single source of truth lives here. All three import from this file.
 */

import path from 'path';
import { randomUUID } from 'crypto';
// No #airo/secrets — reads from process.env directly for full portability

// ─── Title extraction ─────────────────────────────────────────────────────────

/**
 * Parse a video filename into a clean title and optional year.
 * Strips quality tags, codec names, release group suffixes, etc.
 *
 * Examples:
 *   "The.Dark.Knight.2008.1080p.BluRay.x264.mkv" → { title: "The Dark Knight", year: "2008" }
 *   "Breaking.Bad.S01E01.720p.mkv"               → { title: "Breaking Bad S01E01", year: undefined }
 */
export function extractTitle(filename: string): { title: string; year?: string } {
  let name = path.basename(filename, path.extname(filename));

  // Replace separators with spaces
  name = name.replace(/[._]/g, ' ').replace(/-/g, ' ');

  // Extract 4-digit year (1900–2099)
  const yearMatch = name.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : undefined;

  // Strip year, quality tags, codec names, release group noise
  name = name
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(
      /\b(720p|1080p|2160p|4k|uhd|bluray|blu ray|bdrip|dvdrip|dvdscr|webrip|web[-. ]?dl|hdtv|pdtv|x264|x265|h264|h265|hevc|avc|aac|ac3|dts|truehd|atmos|hdr|hdr10|sdr|remux|proper|repack|extended|theatrical|directors\.?cut|unrated|retail|internal|limited|nfofix|readnfo)\b/gi,
      ''
    )
    // Strip trailing release group tags like "-GROUP" or "[GROUP]"
    .replace(/[-[(][A-Z0-9]{2,10}[\])]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: name || path.basename(filename, path.extname(filename)),
    year,
  };
}

// ─── OMDB ─────────────────────────────────────────────────────────────────────

export interface OMDBData {
  Title?: string;
  Year?: string;
  Genre?: string;
  Plot?: string;
  Director?: string;
  Actors?: string;
  imdbRating?: string;
  Poster?: string;
  Type?: string;
  Runtime?: string;
  Rated?: string;
  Response?: string;
  [key: string]: string | undefined;
}

/**
 * Fetch movie/series metadata from OMDB.
 * Returns null if: no API key, network error, or title not found.
 * Never throws — always returns null on failure.
 */
export async function fetchOMDB(title: string, year?: string): Promise<OMDBData | null> {
  // Check env first, then secrets store
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey || typeof apiKey !== 'string') return null;

  try {
    const yearParam = year ? `&y=${year}` : '';
    const url = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const data = await res.json() as OMDBData;
    return data.Response === 'True' ? data : null;
  } catch {
    return null;
  }
}

// ─── Media item builder ───────────────────────────────────────────────────────

export interface MediaItemInput {
  id?: string;
  filename: string;           // stored filename (may differ from original)
  originalFilename: string;   // original filename as found on disk
  filePath: string;           // absolute or relative path for streaming
  fileSize: number;
  omdb: OMDBData | null;
  extractedTitle: string;
  extractedYear?: string;
  transcoding: boolean;
  importedFrom: 'upload' | 'folder_watcher' | 'existing_scan';
}

export interface MediaItem {
  id: string;
  filename: string;
  originalFilename: string;
  filepath: string;
  filePath: string;
  title: string;
  year: string;
  genre: string[];
  plot: string;
  director: string;
  actors: string;
  imdbRating: string;
  poster: string;
  type: 'movie' | 'series';
  runtime: string;
  rated: string;
  addedAt: string;
  watchProgress: number;
  fileSize: number;
  originalSize: number;
  transcoding: boolean;
  needsMetadata: boolean;
  metadataAvailable: boolean;
  importedFrom: string;
  ccStatus: 'none' | 'fetching' | 'available' | 'failed';
  enriching?: boolean;
}

/**
 * Build a standardised MediaItem record from raw inputs.
 * Used by upload, folderWatcher, and existingMediaScanner so the
 * library schema is always consistent regardless of import path.
 */
export function buildMediaItem(input: MediaItemInput): MediaItem {
  const { omdb } = input;

  const genre = omdb?.Genre
    ? omdb.Genre.split(',').map(g => g.trim()).filter(Boolean)
    : ['Unknown'];

  const rated =
    omdb?.Rated && omdb.Rated !== 'N/A' && omdb.Rated.trim() !== ''
      ? omdb.Rated.trim()
      : 'NR';

  return {
    id: input.id ?? randomUUID(),
    filename: input.filename,
    originalFilename: input.originalFilename,
    filepath: input.filePath,
    filePath: input.filePath,
    title: omdb?.Title || input.extractedTitle,
    year: omdb?.Year || input.extractedYear || 'Unknown',
    genre,
    plot: omdb?.Plot || '',
    director: omdb?.Director || '',
    actors: omdb?.Actors || '',
    imdbRating: omdb?.imdbRating || 'N/A',
    poster: omdb?.Poster && omdb.Poster !== 'N/A' ? omdb.Poster : '',
    type: omdb?.Type === 'series' ? 'series' : 'movie',
    runtime: omdb?.Runtime || 'Unknown',
    rated,
    addedAt: new Date().toISOString(),
    watchProgress: 0,
    fileSize: input.fileSize,
    originalSize: input.fileSize,
    transcoding: input.transcoding,
    needsMetadata: !omdb,
    metadataAvailable: !!omdb,
    importedFrom: input.importedFrom,
    ccStatus: 'none',
    enriching: false,
  };
}

// ─── Background enrichment ────────────────────────────────────────────────────

/**
 * Trigger AI enrichment for a media item in the background.
 * Calls the /api/enrich/:id endpoint via loopback so enrichment
 * logic stays in one place. Fire-and-forget — never throws.
 *
 * The loopback call bypasses auth by using the internal bypass header
 * that the authMiddleware recognises for server-to-server calls.
 * This is safe because the call only ever originates from this process.
 */
export async function runEnrichmentInBackground(mediaId: string): Promise<void> {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  if (!googleAiKey) return;

  // Small delay so the library item is definitely written before enrichment reads it
  await new Promise(r => setTimeout(r, 600));

  try {
    const port = process.env.PORT || 3000;
    const res = await fetch(`http://localhost:${port}/api/enrich/${mediaId}`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        // Internal server-to-server bypass — authMiddleware checks this header
        // and allows the request without a session cookie.
        'X-Internal-Server-Call': 'homestream',
      },
      signal: AbortSignal.timeout(120_000),
    });
    // Drain the SSE stream so the connection closes cleanly
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  } catch (err) {
    console.error(`[enrich] Background enrichment failed for ${mediaId}:`, err);
  }
}

/**
 * Trigger closed-caption auto-download for a media item in the background.
 * Calls the /api/captions/:id/fetch endpoint via loopback.
 * Fire-and-forget — never throws.
 */
export async function runCaptionFetchInBackground(mediaId: string): Promise<void> {
  await new Promise(r => setTimeout(r, 1_200));
  try {
    const port = process.env.PORT || 3000;
    await fetch(`http://localhost:${port}/api/captions/${mediaId}/fetch`, {
      method: 'POST',
      headers: { 'X-Internal-Server-Call': 'homestream' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error(`[captions] Background CC fetch failed for ${mediaId}:`, err);
  }
}

// ─── Metadata retry helpers ───────────────────────────────────────────────────

/**
 * On server startup, find all library items with needsMetadata=true
 * and re-attempt OMDB fetch + enrichment for them.
 * This handles items that were imported while offline.
 */
export async function retryMissingMetadata(): Promise<void> {
  // Lazy import to avoid circular deps at module load time
  const { readLibrary, writeLibrary } = await import('./libraryStore.js');
  const library = readLibrary<MediaItem & { needsMetadata?: boolean }>();
  const needsRetry = library.filter(m => m.needsMetadata && m.originalFilename);

  if (needsRetry.length === 0) return;
  console.log(`[metadata-retry] ${needsRetry.length} items need metadata — retrying…`);

  for (const item of needsRetry) {
    const { title, year } = extractTitle(item.originalFilename);
    const omdb = await fetchOMDB(title, year);
    if (!omdb) continue;

    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === item.id);
      if (idx !== -1) {
        const existing = lib[idx] as Record<string, unknown>;
        existing.title = omdb.Title || existing.title;
        existing.year = omdb.Year || existing.year;
        existing.genre = omdb.Genre ? omdb.Genre.split(',').map(g => g.trim()) : existing.genre;
        existing.plot = omdb.Plot || existing.plot;
        existing.director = omdb.Director || existing.director;
        existing.actors = omdb.Actors || existing.actors;
        existing.imdbRating = omdb.imdbRating || existing.imdbRating;
        existing.poster = (omdb.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : existing.poster;
        existing.type = omdb.Type === 'series' ? 'series' : 'movie';
        existing.runtime = omdb.Runtime || existing.runtime;
        existing.rated = (omdb.Rated && omdb.Rated !== 'N/A') ? omdb.Rated.trim() : existing.rated;
        existing.needsMetadata = false;
        existing.metadataAvailable = true;
      }
      return lib;
    });

    console.log(`[metadata-retry] Updated: "${omdb.Title || title}"`);

    // Kick off enrichment now that we have metadata
    runEnrichmentInBackground(item.id).catch(() => {});
    runCaptionFetchInBackground(item.id).catch(() => {});

    // Rate limit
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('[metadata-retry] Done');
}
