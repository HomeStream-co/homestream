import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createJob } from '../../transcodeStore.js';
import { transcodeFile } from '../../transcodeWorker.js';
import { writeLibrary } from '../../libraryStore.js';
import { requireAuth } from '../../authMiddleware.js';
import {
  extractTitle,
  fetchOMDB,
  buildMediaItem,
  runEnrichmentInBackground,
  runCaptionFetchInBackground,
} from '../../mediaUtils.js';
import { readConfig } from '../../configStore.js';
import { dataDir } from '../../dataDir.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  try {
    const { localPath, originalName } = req.body;
    if (!localPath || !originalName) {
      return res.status(400).json({ error: 'Missing localPath or originalName' });
    }

    if (!fs.existsSync(localPath)) {
      return res.status(400).json({ error: 'Local file does not exist' });
    }

    const stat = fs.statSync(localPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'localPath is not a file' });
    }

    const config = readConfig();
    const baseDir = config.mediaDir || dataDir();
    const libDir = config.libraryDir || path.join(baseDir, 'library');

    // Ensure library directory exists
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }

    const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const outputFilename = safeName.replace(/\.[^.]+$/, '') + '_tc.mp4';
    const outputPath = path.join(libDir, outputFilename);

    // â”€â”€ 1. Parse title â”€â”€
    const { title: extractedTitle, year: extractedYear } = extractTitle(originalName);
    const searchTitle = extractedTitle;
    const searchYear  = extractedYear;

    // â”€â”€ 2. Fetch OMDB metadata (graceful â€” works offline) â”€â”€
    const omdb = await fetchOMDB(searchTitle, searchYear);

    // â”€â”€ 3. Register transcode job â”€â”€
    const mediaItem = buildMediaItem({
      filename: outputFilename,
      originalFilename: originalName,
      filePath: outputPath,   // absolute path â€” stream endpoint uses this directly
      fileSize: stat.size,
      omdb,
      extractedTitle: searchTitle,
      extractedYear: searchYear,
      transcoding: true,
      importedFrom: 'upload',
    });

    createJob(mediaItem.id, safeName, outputFilename);

    // â”€â”€ 4. Write to library immediately (via queue â€” concurrent-safe) â”€â”€
    await writeLibrary(lib => {
      lib.unshift(mediaItem as unknown as Record<string, unknown>);
      return lib;
    });

    // â”€â”€ 5. Respond to client right away â”€â”€
    // ——— 5. Respond to client right away ———
    res.status(201).json({ ...mediaItem, transcodeId: mediaItem.id });

    // ——— 6. Kick off enrichment + CC in background ———
    runEnrichmentInBackground(mediaItem.id).catch(() => {});
    runCaptionFetchInBackground(mediaItem.id).catch(() => {});

    // ——— 7. Copy file to library first, then Transcode in background ———
    const finalOriginalPath = path.join(libDir, safeName.replace(/\.[^.]+$/, '') + path.extname(localPath));
    try {
      if (!fs.existsSync(finalOriginalPath) && localPath !== finalOriginalPath) {
        fs.copyFileSync(localPath, finalOriginalPath);
      }
      try {
        fs.unlinkSync(localPath);
      } catch (e) {} // ignore unlink error if they didn't want to move it
    } catch(e) {
      console.error('[upload-local] Failed to copy local file', e);
    }

    transcodeFile(mediaItem.id, finalOriginalPath, outputPath)
      .then(result => {
        let finalPath = outputPath;
        let finalFilename = outputFilename;

        if (result.outputFilename === path.basename(finalOriginalPath) || result.outputFilename === finalOriginalPath || result.outputFilename === path.basename(localPath)) {
          finalPath = finalOriginalPath;
          finalFilename = path.basename(finalOriginalPath);
        }

        writeLibrary(lib => {
          const idx = lib.findIndex(m => (m as { id: string }).id === mediaItem.id);
          if (idx !== -1) {
            const item = lib[idx] as Record<string, unknown>;
            item.transcoding      = false;
            item.filename         = finalFilename;
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
            item.filename         = path.basename(finalOriginalPath);
            item.filepath         = finalOriginalPath;
            item.filePath         = finalOriginalPath;
            item.transcoding      = false;
            item.transcodeError   = transcodeErr.message;
          }
          return lib;
        });
      });
  } catch (err) {
    console.error('[upload-local] Unexpected error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed unexpectedly' });
    }
  }
}
