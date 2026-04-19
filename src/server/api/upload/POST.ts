import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createJob } from '../../transcodeStore.js';
import { transcodeFile } from '../../transcodeWorker.js';
import { writeLibrary } from '../../libraryStore.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from '../../mediaUtils.js';

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
    const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm', '.flv', '.3gp', '.ogv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Invalid file type "${ext}". Allowed: ${allowed.join(', ')}`));
  },
  limits: { fileSize: 200 * 1024 * 1024 * 1024 }, // 200 GB max
});

export default function handler(req: Request, res: Response) {
  upload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const inputFilename  = req.file.filename;
    const outputFilename = inputFilename.replace(/\.[^.]+$/, '') + '_tc.mp4';
    const inputPath      = path.join(UPLOADS_DIR, inputFilename);
    const outputPath     = path.join(UPLOADS_DIR, outputFilename);

    // ── 1. Parse title — prefer manual override from form body ──
    const { title: extractedTitle, year: extractedYear } = extractTitle(req.file.originalname);
    const manualTitle = (req.body as Record<string, string>).title;
    const manualYear  = (req.body as Record<string, string>).year;
    const searchTitle = manualTitle || extractedTitle;
    const searchYear  = manualYear  || extractedYear;

    // ── 2. Fetch OMDB metadata (graceful — works offline) ──
    const omdb = await fetchOMDB(searchTitle, searchYear);

    // ── 3. Register transcode job ──
    const mediaItem = buildMediaItem({
      filename: outputFilename,
      originalFilename: req.file.originalname,
      filePath: `/uploads/${outputFilename}`,
      fileSize: req.file.size,
      omdb,
      extractedTitle: searchTitle,
      extractedYear: searchYear,
      transcoding: true,
      importedFrom: 'upload',
    });

    createJob(mediaItem.id, inputFilename, outputFilename);

    // ── 4. Write to library immediately (via queue — concurrent-safe) ──
    await writeLibrary(lib => {
      lib.unshift(mediaItem as unknown as Record<string, unknown>);
      return lib;
    });

    // ── 5. Respond to client right away ──
    res.status(201).json({ ...mediaItem, transcodeId: mediaItem.id });

    // ── 6. Kick off enrichment + CC in background ──
    runEnrichmentInBackground(mediaItem.id).catch(() => {});
    runCaptionFetchInBackground(mediaItem.id).catch(() => {});

    // ── 7. Transcode in background ──
    transcodeFile(mediaItem.id, inputPath, outputPath)
      .then(result => {
        writeLibrary(lib => {
          const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
          if (idx !== -1) {
            const item = lib[idx] as Record<string, unknown>;
            item.transcoding      = false;
            item.filename         = result.outputFilename;
            item.filepath         = `/uploads/${result.outputFilename}`;
            item.filePath         = `/uploads/${result.outputFilename}`;
            item.fileSize         = result.finalSize;
            item.originalSize     = result.originalSize;
            item.savedBytes       = result.savedBytes;
            item.transcodeStrategy = result.strategy;
          }
          return lib;
        });
      })
      .catch((transcodeErr: Error) => {
        console.error(`[transcode] Error for ${mediaItem.id}:`, transcodeErr.message);
        writeLibrary(lib => {
          const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
          if (idx !== -1) {
            const item = lib[idx] as Record<string, unknown>;
            item.filename         = inputFilename;
            item.filepath         = `/uploads/${inputFilename}`;
            item.filePath         = `/uploads/${inputFilename}`;
            item.transcoding      = false;
            item.transcodeError   = transcodeErr.message;
          }
          return lib;
        });
      });
  });
}
