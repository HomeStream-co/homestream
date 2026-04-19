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

async function fetchOMDBMetadata(title: string, year?: string) {
  const apiKey = process.env.OMDB_API_KEY || 'DEMO_KEY';
  const yearParam = year ? `&y=${year}` : '';
  const url = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json() as Record<string, string>;
    return data.Response === 'True' ? data : null;
  } catch {
    return null;
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

    // ── 2. Fetch OMDB metadata in parallel with transcode start ──
    const omdbPromise = fetchOMDBMetadata(searchTitle, searchYear);

    // ── 3. Register transcode job immediately ──
    createJob(mediaId, inputFilename, outputFilename);

    // ── 4. Build initial media item (placeholder poster until OMDB resolves) ──
    const omdb = await omdbPromise;
    const genres = omdb?.Genre
      ? omdb.Genre.split(',').map((g: string) => g.trim())
      : ['Unknown'];

    const mediaItem = {
      id: mediaId,
      filename: outputFilename,          // Always point to the transcoded output
      originalFilename: req.file.originalname,
      filepath: `/uploads/${outputFilename}`,
      title: omdb?.Title || searchTitle,
      year: omdb?.Year || searchYear || 'Unknown',
      genre: genres,
      plot: omdb?.Plot || 'No description available.',
      director: omdb?.Director || 'Unknown',
      actors: omdb?.Actors || 'Unknown',
      imdbRating: omdb?.imdbRating || 'N/A',
      poster: (omdb?.Poster && omdb.Poster !== 'N/A')
        ? omdb.Poster
        : `https://via.placeholder.com/300x450/141420/e50914?text=${encodeURIComponent(searchTitle)}`,
      type: omdb?.Type === 'series' ? 'series' : 'movie',
      runtime: omdb?.Runtime || 'Unknown',
      rated: omdb?.Rated || 'NR',
      addedAt: new Date().toISOString(),
      watchProgress: 0,
      fileSize: req.file.size,
      transcoding: true,   // Flag so UI can show "transcoding" state on card
    };

    // Write to library immediately — item is visible right away
    const library = readLibrary();
    library.unshift(mediaItem);
    writeLibrary(library);

    // Respond to client — UI starts polling /api/transcode/:id
    res.status(201).json({ ...mediaItem, transcodeId: mediaId });

    // ── 5. Kick off AI enrichment wizard in background (non-blocking) ──
    // Runs in parallel with transcode — enrichment is independent of video processing
    runEnrichmentInBackground(mediaId);

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
