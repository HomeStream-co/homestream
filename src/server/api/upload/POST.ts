import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { createJob } from '../../transcodeStore.js';
import { transcodeFile } from '../../transcodeWorker.js';

const LIBRARY_PATH = path.resolve('./media-library.json');
const UPLOADS_DIR = path.resolve('./uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: mp4, mkv, avi, mov, wmv, m4v'));
  },
  limits: { fileSize: 200 * 1024 * 1024 * 1024 }, // 200GB max
});

function extractTitleFromFilename(filename: string): { title: string; year?: string } {
  let name = path.basename(filename, path.extname(filename));
  name = name.replace(/[._-]/g, ' ');
  const yearMatch = name.match(/[\[(]?(\d{4})[\])]?/);
  const year = yearMatch ? yearMatch[1] : undefined;
  name = name.replace(/[\[(]?\d{4}[\])]?/g, '');
  name = name.replace(/\b(720p|1080p|2160p|4k|bluray|bdrip|dvdrip|webrip|web-dl|x264|x265|hevc|aac|ac3|hdr|sdr|remux)\b/gi, '');
  name = name.replace(/\s+/g, ' ').trim();
  return { title: name, year };
}

interface OMDBResult {
  omdb: Record<string, string> | null;
  /** true = internet was reachable but title not found; false = offline or fetch error */
  online: boolean;
}

async function fetchOMDBMetadata(title: string, year?: string): Promise<OMDBResult> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    console.warn('[omdb] OMDB_API_KEY not set — skipping metadata fetch');
    return { omdb: null, online: false };
  }

  const yearParam = year ? `&y=${year}` : '';
  const url = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json() as Record<string, string>;
    return {
      omdb: data.Response === 'True' ? data : null,
      online: true,
    };
  } catch (err: unknown) {
    // Network error (offline, DNS failure, timeout)
    const isNetworkError =
      err instanceof TypeError ||
      (err instanceof Error && (
        err.name === 'AbortError' ||
        err.message.includes('fetch') ||
        err.message.includes('network') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT')
      ));
    if (isNetworkError) {
      console.warn('[omdb] Network unreachable — running in offline mode');
    } else {
      console.error('[omdb] Unexpected error:', err);
    }
    return { omdb: null, online: false };
  }
}

function readLibrary() {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')); }
  catch { return []; }
}

function writeLibrary(data: unknown[]) {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2));
}

/**
 * Trigger the enrichment endpoint internally by making a loopback HTTP call.
 * This keeps the enrichment logic in one place (the /api/enrich/:id handler)
 * and lets it run independently of the upload response.
 */
async function runEnrichmentInBackground(mediaId: string): Promise<void> {
  // Small delay so the library item is definitely written before enrichment reads it
  await new Promise(r => setTimeout(r, 500));
  try {
    // Use loopback — the server calls itself on the same port
    const port = process.env.PORT || 3000;
    const res = await fetch(`http://localhost:${port}/api/enrich/${mediaId}`, {
      method: 'POST',
      headers: { 'Accept': 'text/event-stream' },
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

export default function handler(req: Request, res: Response) {
  upload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mediaId = randomUUID();
    const inputFilename = req.file.filename;
    const ext = path.extname(inputFilename).toLowerCase();

    // Output is always .mp4 — transcoded or remuxed
    const outputFilename = inputFilename.replace(/\.[^.]+$/, '') + '_tc.mp4';

    // ── 1. Respond immediately so the UI can start polling transcode progress ──
    const { title: extractedTitle, year: extractedYear } = extractTitleFromFilename(req.file.originalname);
    const manualTitle = (req.body as Record<string, string>).title;
    const manualYear = (req.body as Record<string, string>).year;
    const searchTitle = manualTitle || extractedTitle;
    const searchYear = manualYear || extractedYear;

    // ── 2. Fetch OMDB metadata (graceful — works offline) ──
    const omdbResult = await fetchOMDBMetadata(searchTitle, searchYear);
    const omdb = omdbResult.omdb;
    const metadataAvailable = omdbResult.online; // false = offline or no API key

    // ── 3. Register transcode job immediately ──
    createJob(mediaId, inputFilename, outputFilename);

    // ── 4. Build media item — use OMDB data if available, sensible defaults if not ──
    const genres = omdb?.Genre
      ? omdb.Genre.split(',').map((g: string) => g.trim())
      : ['Unknown'];

    const mediaItem = {
      id: mediaId,
      filename: outputFilename,
      originalFilename: req.file.originalname,
      filepath: `/uploads/${outputFilename}`,
      title: omdb?.Title || searchTitle,
      year: omdb?.Year || searchYear || 'Unknown',
      genre: genres,
      plot: omdb?.Plot || '',
      director: omdb?.Director || '',
      actors: omdb?.Actors || '',
      imdbRating: omdb?.imdbRating || 'N/A',
      poster: (omdb?.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : '',
      type: omdb?.Type === 'series' ? 'series' : 'movie',
      runtime: omdb?.Runtime || 'Unknown',
      rated: omdb?.Rated && omdb.Rated !== 'N/A' && omdb.Rated.trim() !== '' ? omdb.Rated.trim() : 'NR',
      addedAt: new Date().toISOString(),
      watchProgress: 0,
      fileSize: req.file.size,
      transcoding: true,
      // Let the UI know whether it should show a manual metadata form
      metadataAvailable,
      needsMetadata: !omdb, // true = user should fill in title/poster manually
    };

    // Write to library immediately — item is visible right away
    const library = readLibrary();
    library.unshift(mediaItem);
    writeLibrary(library);

    // Respond to client — includes metadataAvailable so UI can react
    res.status(201).json({ ...mediaItem, transcodeId: mediaId });

    // ── 5. Kick off AI enrichment in background — skip if offline ──
    if (metadataAvailable && process.env.GOOGLE_AI_API_KEY) {
      runEnrichmentInBackground(mediaId);
    } else {
      console.log(`[enrich] Skipping enrichment for ${mediaId} — ${!metadataAvailable ? 'offline' : 'no GOOGLE_AI_API_KEY'}`);
    }

    // ── 6. Run transcode in background (non-blocking) ──
    transcodeFile(mediaId, inputFilename, outputFilename)
      .then(() => {
        // Mark transcoding: false in library once done
        const lib = readLibrary();
        const idx = lib.findIndex((m: { id: string }) => m.id === mediaId);
        if (idx !== -1) {
          lib[idx].transcoding = false;
          writeLibrary(lib);
        }
      })
      .catch((transcodeErr: Error) => {
        console.error(`[transcode] Error for ${mediaId}:`, transcodeErr.message);
        // If FFmpeg failed, keep original file as fallback
        const lib = readLibrary();
        const idx = lib.findIndex((m: { id: string }) => m.id === mediaId);
        if (idx !== -1) {
          // Fall back to original file
          const origExt = ext;
          lib[idx].filename = inputFilename;
          lib[idx].filepath = `/uploads/${inputFilename}`;
          lib[idx].transcoding = false;
          lib[idx].transcodeError = transcodeErr.message;
          // If original is not mp4, note it
          if (origExt !== '.mp4') {
            lib[idx].transcodeWarning = 'Transcode failed — original file kept. May not play in all browsers.';
          }
          writeLibrary(lib);
        }
      });
  });
}
