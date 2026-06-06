/**
 * GET /api/stream/:filename
 *
 * Optimized for zero-latency LAN playback:
 *  - 4MB read chunks so the browser fills its buffer in 1-2 round trips
 *  - X-Content-Duration so the browser knows total length before first byte
 *  - ETag + Last-Modified so the browser caches chunks and never re-fetches
 *  - Cache-Control: no-transform prevents any proxy from re-encoding
 *  - Connection: keep-alive reuses the TCP socket between chunk requests
 *
 * File resolution order:
 *  1. Look up the library for an item whose filename matches — use its filePath
 *     (handles files in downloads folder, not just uploads/)
 *  2. Fall back to uploads/ directory search
 *  3. Fall back to original file (pre-transcode) in uploads/
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary } from '../../../libraryStore.js';
import { dataDir } from '../../../dataDir.js';
import { readConfig } from '../../../configStore.js';
import { checkRating } from '../../../ratingGate.js';

// Uploads live inside the data directory so they are writable in packaged
// Electron on Linux (AppImage mounts read-only; process.cwd() is not writable).
const UPLOADS_DIR = path.join(dataDir(), 'uploads');

// 4 MB — large enough to fill the browser's initial buffer in one shot on LAN
const CHUNK_SIZE = 4 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.mp4':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mov':  'video/quicktime',
  '.wmv':  'video/x-ms-wmv',
  '.m4v':  'video/mp4',
  '.webm': 'video/webm',
  '.ts':   'video/mp2t',
  '.flv':  'video/x-flv',
  '.3gp':  'video/3gpp',
  '.ogv':  'video/ogg',
};

/**
 * Resolve the actual file path for a given filename.
 *
 * Priority:
 *  1. Library lookup by filename → use stored filePath (supports downloads folder)
 *  2. Direct path in uploads/
 *  3. Original file fallback (strip _tc.mp4 suffix)
 */
function resolveFilePath(filename: string): string | null {
  const safe = path.basename(filename);

  // 1. Library lookup — find item whose filename matches and use its stored filePath
  try {
    const library = readLibrary<{
      filename?: string;
      filePath?: string;
      filepath?: string;
    }>();
    const item = library.find(m => m.filename === safe);
    if (item) {
      const storedPath = item.filePath ?? item.filepath;
      if (storedPath && fs.existsSync(storedPath)) {
        return storedPath;
      }
    }
  } catch { /* fall through to filesystem search */ }

  // 2. Direct path in uploads/
  const primary = path.join(UPLOADS_DIR, safe);
  if (fs.existsSync(primary)) return primary;

  // 3. Original file fallback — transcoded file not ready yet
  const base = safe.replace(/_tc\.mp4$/, '');
  for (const ext of ['.mkv', '.avi', '.mov', '.wmv', '.m4v', '.mp4']) {
    const candidate = path.join(UPLOADS_DIR, base + ext);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Verify that a resolved file path is inside one of the directories
 * HomeStream is allowed to serve from. This is the last line of defence
 * against a crafted/corrupted library entry pointing outside the media tree.
 *
 * Allowed roots:
 *   - UPLOADS_DIR  (dataDir/uploads)
 *   - cfg.mediaDir (user-configured media folder, e.g. /mnt/media)
 *   - cfg.downloadsDir (derived from mediaDir/downloads)
 *   - cfg.libraryDir  (derived from mediaDir/library)
 *
 * path.resolve() normalises away any ".." segments before the comparison,
 * so "../../etc/passwd" can never pass this check.
 */
function isPathAllowed(resolvedPath: string): boolean {
  const normalised = path.resolve(resolvedPath);

  // Always allow the uploads directory
  const allowedRoots: string[] = [path.resolve(UPLOADS_DIR)];

  // Add the user-configured media directories
  try {
    const cfg = readConfig() as {
      mediaDir?: string;
      downloadsDir?: string;
      libraryDir?: string;
    };
    if (cfg.mediaDir)     allowedRoots.push(path.resolve(cfg.mediaDir));
    if (cfg.downloadsDir) allowedRoots.push(path.resolve(cfg.downloadsDir));
    if (cfg.libraryDir)   allowedRoots.push(path.resolve(cfg.libraryDir));
  } catch { /* config unreadable — only uploads dir is allowed */ }

  return allowedRoots.some(root => normalised.startsWith(root + path.sep) || normalised === root);
}

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  try {
    const filename = req.params.filename as string;

    // ── Rating gate — look up the item's rating and check against active profile ──
    try {
      const library = readLibrary<{ filename?: string; rated?: string }>();
      const item = library.find(m => m.filename === path.basename(filename));
      if (item?.rated) {
        if (!checkRating(req, res, item.rated)) return;
      }
    } catch { /* library read failure — allow stream, don't block */ }

    const filePath = resolveFilePath(filename);

    if (!filePath) {
      return res.status(404).json({ error: 'File not found', filename });
    }

    // ── Path traversal guard ──────────────────────────────────────────────────
    // Verify the resolved path is inside an allowed media directory before
    // opening the file. This catches corrupted or crafted library entries that
    // point outside the media tree (e.g. /etc/passwd, /proc/self/environ).
    if (!isPathAllowed(filePath)) {
      console.warn(`[stream] BLOCKED path traversal attempt: ${filePath}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'video/mp4';

    // ETag based on file size + mtime — lets browser cache chunks aggressively
    const etag = `"${stat.size}-${stat.mtimeMs.toString(36)}"`;
    const lastModified = stat.mtime.toUTCString();

    // FIX (🔴): Previously returned 304 for ALL requests with a matching ETag,
    // including Range requests. A 304 on a Range request tells the browser "use
    // your cached copy" — but the browser only has the previously-fetched range,
    // not the full file. This broke seeking: after seeking to a new position the
    // browser sent a Range + If-None-Match request, got 304, and stalled because
    // it had no cached data for that byte range.
    //
    // Correct behaviour: 304 is only valid for full-file (non-Range) requests.
    // Range requests must always get a 206 with the actual bytes.
    if (!req.headers.range && req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);

      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : -1;
      const end = requestedEnd >= 0
        ? requestedEnd
        : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range':      `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':      'bytes',
        'Content-Length':     chunkSize,
        'Content-Type':       contentType,
        'Cache-Control':      'private, max-age=3600, no-transform',
        'ETag':               etag,
        'Last-Modified':      lastModified,
        'Vary':               'Range',
        'Connection':         'keep-alive',
        'X-Content-Duration': String(stat.size),
      });

      fs.createReadStream(filePath, { start, end, highWaterMark: CHUNK_SIZE }).pipe(res);

    } else {
      const end = Math.min(CHUNK_SIZE - 1, fileSize - 1);
      const chunkSize = end + 1;

      if (fileSize > CHUNK_SIZE) {
        res.writeHead(206, {
          'Content-Range':  `bytes 0-${end}/${fileSize}`,
          'Accept-Ranges':  'bytes',
          'Content-Length': chunkSize,
          'Content-Type':   contentType,
          'Cache-Control':  'private, max-age=3600, no-transform',
          'ETag':           etag,
          'Last-Modified':  lastModified,
          'Vary':           'Range',
          'Connection':     'keep-alive',
        });
        fs.createReadStream(filePath, { start: 0, end, highWaterMark: CHUNK_SIZE }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type':   contentType,
          'Accept-Ranges':  'bytes',
          'Cache-Control':  'private, max-age=3600, no-transform',
          'ETag':           etag,
          'Last-Modified':  lastModified,
          'Vary':           'Range',
          'Connection':     'keep-alive',
        });
        fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE }).pipe(res);
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Streaming failed', message: String(error) });
  }
}
