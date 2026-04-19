/**
 * GET /api/stream/:filename
 * Streams video files with HTTP Range request support (enables seeking).
 * Prefers the transcoded _tc.mp4 version if it exists.
 * Falls back to original file if transcode is still in progress.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.resolve('./uploads');

const MIME_TYPES: Record<string, string> = {
  '.mp4':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mov':  'video/quicktime',
  '.wmv':  'video/x-ms-wmv',
  '.m4v':  'video/mp4',
  '.webm': 'video/webm',
};

export default async function handler(req: Request, res: Response) {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);

    // Primary path — what the library record points to (usually _tc.mp4)
    let filePath = path.join(UPLOADS_DIR, safeFilename);

    // If the transcoded file doesn't exist yet (still transcoding),
    // try to serve the original file as a fallback so playback can start immediately
    if (!fs.existsSync(filePath)) {
      // Strip _tc suffix and try common original extensions
      const base = safeFilename.replace(/_tc\.mp4$/, '');
      const fallbackExts = ['.mkv', '.avi', '.mov', '.wmv', '.m4v', '.mp4'];
      let found = false;
      for (const ext of fallbackExts) {
        const candidate = path.join(UPLOADS_DIR, base + ext);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        return res.status(404).json({ error: 'File not found' });
      }
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'video/mp4';

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   contentType,
        'Cache-Control':  'no-cache',
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type':   contentType,
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: 'Streaming failed', message: String(error) });
  }
}
