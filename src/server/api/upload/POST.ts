import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createJob } from '../../transcodeStore.js';
import { transcodeFile } from '../../transcodeWorker.js';
import { readLibrary, writeLibrary } from '../../libraryStore.js';
import { requireAuth } from '../../authMiddleware.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from '../../mediaUtils.js';
import { dataDir } from '../../dataDir.js';
import { readConfig } from '../../configStore.js';

// Uploads live inside the data directory so they are writable in packaged
// Electron on Linux (AppImage mounts read-only; process.cwd() is not writable).
const UPLOADS_DIR = path.join(dataDir(), 'uploads');
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
  if (!requireAuth(req, res)) return;
  upload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const cfg = readConfig();
      const inputFilename  = req.file.filename;
      const tempInputPath  = path.join(UPLOADS_DIR, inputFilename);

      // Resolve final target directory: use libraryDir if configured, fallback to UPLOADS_DIR
      const targetDir = cfg.libraryDir || UPLOADS_DIR;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      const inputPath = path.join(targetDir, inputFilename);
      
      // Move helper with cross-device copy/unlink fallback
      const moveFile = (src: string, dest: string) => {
        try {
          fs.renameSync(src, dest);
        } catch (renameErr) {
          if ((renameErr as any).code === 'EXDEV') {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
          } else {
            throw renameErr;
          }
        }
      };

      // Move the file from temp/uploads to the user's library directory
      if (tempInputPath !== inputPath) {
        moveFile(tempInputPath, inputPath);
      }

      // ── 1. Parse title — prefer manual override from form body ──
      const { title: extractedTitle, year: extractedYear } = extractTitle(req.file.originalname);
      const manualTitle = (req.body as Record<string, string>).title;
      const manualYear  = (req.body as Record<string, string>).year;
      const searchTitle = manualTitle || extractedTitle;
      const searchYear  = manualYear  || extractedYear;

      // ── DEDUP CHECK: if same originalFilename already in library, skip re-upload ──
      const existingLib = readLibrary<{ id: string; originalFilename?: string; filePath?: string; filepath?: string; transcoding?: boolean }>();
      const duplicate = existingLib.find(
        m => m.originalFilename === req.file!.originalname && !m.transcoding
      );
      if (duplicate) {
        console.log(`[upload] Duplicate detected — "${req.file.originalname}" already in library as id=${duplicate.id}. Discarding re-upload.`);
        // Remove the redundant uploaded file from disk
        try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
        try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
        return res.status(200).json({ ...duplicate, transcodeId: duplicate.id, _deduplicated: true });
      }

      // ── 2. Fetch OMDB metadata (graceful — works offline) ──
      const omdb = await fetchOMDB(searchTitle, searchYear);

      if (cfg.autoTranscode === false) {
        // Skip transcoding — add file directly to the library in-place
        const mediaItem = buildMediaItem({
          filename: inputFilename,
          originalFilename: req.file.originalname,
          filePath: inputPath,   // absolute path — stream endpoint uses this directly
          fileSize: req.file.size,
          omdb,
          extractedTitle: searchTitle,
          extractedYear: searchYear,
          transcoding: false,
          importedFrom: 'upload',
        });

        await writeLibrary(lib => {
          lib.unshift(mediaItem as unknown as Record<string, unknown>);
          return lib;
        });

        res.status(201).json({ ...mediaItem, transcodeId: mediaItem.id });

        runEnrichmentInBackground(mediaItem.id).catch(() => {});
        runCaptionFetchInBackground(mediaItem.id).catch(() => {});
        return;
      }

      const outputFilename = inputFilename.replace(/\.[^.]+$/, '') + '_tc.mp4';
      const outputPath     = path.join(targetDir, outputFilename);

      // ── 3. Register transcode job ──
      const mediaItem = buildMediaItem({
        filename: outputFilename,
        originalFilename: req.file.originalname,
        filePath: outputPath,   // absolute path — stream endpoint uses this directly
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
          // Determine the final absolute path (may revert to input if output was larger)
          const finalPath = result.outputFilename === outputFilename ? outputPath : inputPath;
          writeLibrary(lib => {
            const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
            if (idx !== -1) {
              const item = lib[idx] as Record<string, unknown>;
              item.transcoding      = false;
              item.filename         = result.outputFilename;
              item.filepath         = finalPath;
              item.filePath         = finalPath;
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
              item.filepath         = inputPath;   // absolute path
              item.filePath         = inputPath;   // absolute path
              item.transcoding      = false;
              item.transcodeError   = transcodeErr.message;
            }
            return lib;
          });
        });
    } catch (uploadErr) {
      console.error('[upload] Unexpected error in upload handler:', uploadErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Upload failed unexpectedly' });
      }
    }
  });
}
