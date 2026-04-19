import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';

// NOTE: Get a free OMDB API key at https://www.omdbapi.com/apikey.aspx
// Set it as environment variable OMDB_API_KEY for better results
// DEMO_KEY works for low-volume usage

const LIBRARY_PATH = path.resolve('./media-library.json');
const UPLOADS_DIR = path.resolve('./uploads');

// Ensure uploads directory exists
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
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: mp4, mkv, avi, mov, wmv, m4v'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB max
});

function extractTitleFromFilename(filename: string): { title: string; year?: string } {
  let name = path.basename(filename, path.extname(filename));
  // Replace dots, underscores, hyphens with spaces
  name = name.replace(/[._-]/g, ' ');
  // Detect year like (2008) or .2008. or [2008]
  const yearMatch = name.match(/[\[(]?(\d{4})[\])]?/);
  const year = yearMatch ? yearMatch[1] : undefined;
  // Remove year and common quality tags
  name = name.replace(/[\[(]?\d{4}[\])]?/g, '');
  name = name.replace(/\b(720p|1080p|4k|bluray|bdrip|dvdrip|webrip|web-dl|x264|x265|hevc|aac|ac3|hdr|sdr)\b/gi, '');
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
    if (data.Response === 'True') {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function readLibrary() {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function writeLibrary(data: unknown[]) {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2));
}

// Express middleware handler
export default function handler(req: Request, res: Response) {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title: extractedTitle, year: extractedYear } = extractTitleFromFilename(req.file.originalname);
    
    // Allow manual title override from form data
    const manualTitle = (req.body as Record<string, string>).title;
    const manualYear = (req.body as Record<string, string>).year;
    const searchTitle = manualTitle || extractedTitle;
    const searchYear = manualYear || extractedYear;

    // Fetch metadata from OMDB
    const omdb = await fetchOMDBMetadata(searchTitle, searchYear);

    const genres = omdb?.Genre
      ? omdb.Genre.split(',').map((g: string) => g.trim())
      : ['Unknown'];

    const mediaItem = {
      id: randomUUID(),
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      filepath: `/uploads/${req.file.filename}`,
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
    };

    const library = readLibrary();
    library.unshift(mediaItem); // Add to front (recently added)
    writeLibrary(library);

    res.status(201).json(mediaItem);
  });
}
