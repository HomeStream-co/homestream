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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanFilename(omdbTitle: string | undefined, omdbYear: string | undefined, originalBasename: string, ext: string): string {
  if (omdbTitle) {
    const safeName = omdbTitle
      .replace(/[<>:"/\\|?*]+/g, '')   // strip illegal chars
      .replace(/\s+/g, '_')             // spaces → underscores
      .replace(/_+/g, '_')              // collapse multiple underscores
      .trim();
    const yearPart = omdbYear ? `_${omdbYear}` : '';
    return `${safeName}${yearPart}${ext}`;
  }
  return originalBasename.replace(/^\d{13}-/, '');
}

function resolveSubfolder(type: string | undefined): string {
  if (type === 'series') return 'tv';
  return 'movies';
}

const moveFile = (src: string, dest: string) => {
  if (src === dest) return;
  if (!fs.existsSync(src)) return;
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
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

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  upload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const cfg = readConfig();
      const inputFilename  = req.file.filename;
      const tempInputPath  = path.join(UPLOADS_DIR, inputFilename);

      // ── 1. Parse title — prefer manual override from form body ──
      const { title: extractedTitle, year: extractedYear } = extractTitle(req.file.originalname);
      const manualTitle = (req.body as Record<string, string>).title;
      const manualYear  = (req.body as Record<string, string>).year;
      const searchTitle = manualTitle || extractedTitle;
      const searchYear  = manualYear  || extractedYear;

      // ── 2. Fetch OMDB metadata (graceful — works offline) ──
      const omdb = await fetchOMDB(searchTitle, searchYear);

      const subfolder = resolveSubfolder(omdb?.Type);
      const libraryDir = cfg.libraryDir || UPLOADS_DIR;
      const targetDir = path.join(libraryDir, subfolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const inputExt = path.extname(req.file.originalname).toLowerCase();
      const finalFilename = cleanFilename(omdb?.Title, omdb?.Year, req.file.originalname, inputExt);
      const finalPath = path.join(targetDir, finalFilename);

      // ── DEDUP CHECK: if same originalFilename already in library, skip re-upload ──
      const existingLib = readLibrary<{ id: string; originalFilename?: string; filePath?: string; filepath?: string; transcoding?: boolean }>();
      const duplicate = existingLib.find(
        m => m.originalFilename === req.file!.originalname && !m.transcoding
      );
      if (duplicate) {
        console.log(`[upload] Duplicate detected — "${req.file.originalname}" already in library as id=${duplicate.id}. Discarding re-upload.`);
        // Remove the redundant uploaded file from disk
        try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
        return res.status(200).json({ ...duplicate, transcodeId: duplicate.id, _deduplicated: true });
      }

      if (cfg.autoTranscode === false) {
        // Skip transcoding — move file directly to targetDir with clean name
        moveFile(tempInputPath, finalPath);

        const mediaItem = buildMediaItem({
          filename: finalFilename,
          originalFilename: req.file.originalname,
          filePath: finalPath,   // absolute path — stream endpoint uses this directly
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

      const tcFilename = finalFilename.replace(/\.[^.]+$/, '') + '_tc.mp4';
      const outputPath = path.join(targetDir, tcFilename);

      // ── 3. Register transcode job ──
      const mediaItem = buildMediaItem({
        filename: tcFilename,
        originalFilename: req.file.originalname,
        filePath: outputPath,   // absolute path — stream endpoint uses this directly
        fileSize: req.file.size,
        omdb,
        extractedTitle: searchTitle,
        extractedYear: searchYear,
        transcoding: true,
        importedFrom: 'upload',
      });

      createJob(mediaItem.id, inputFilename, tcFilename);

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
      transcodeFile(mediaItem.id, tempInputPath, outputPath)
        .then(result => {
          let resolvedPath = outputPath;
          let resolvedFilename = tcFilename;
          if (result.outputFilename !== tcFilename) {
            // Reverted to original
            resolvedFilename = finalFilename;
            resolvedPath = finalPath;
            console.log(`[upload] Reverted to original, moving: ${tempInputPath} → ${resolvedPath}`);
            moveFile(tempInputPath, resolvedPath);
          }

          // Clean up temp file
          if (fs.existsSync(tempInputPath) && tempInputPath !== resolvedPath) {
            try { fs.unlinkSync(tempInputPath); } catch {}
          }

          writeLibrary(lib => {
            const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
            if (idx !== -1) {
              const item = lib[idx] as Record<string, unknown>;
              item.transcoding      = false;
              item.filename         = resolvedFilename;
              item.filepath         = resolvedPath;
              item.filePath         = resolvedPath;
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
          // Transcode failed — move original to finalPath
          try {
            console.log(`[upload] Transcode failed, moving original: ${tempInputPath} → ${finalPath}`);
            moveFile(tempInputPath, finalPath);
          } catch (moveErr) {
            console.error(`[upload] Failed to move original after transcode failure:`, moveErr);
          }

          writeLibrary(lib => {
            const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
            if (idx !== -1) {
              const item = lib[idx] as Record<string, unknown>;
              item.filename         = finalFilename;
              item.filepath         = finalPath;   // absolute path
              item.filePath         = finalPath;   // absolute path
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
