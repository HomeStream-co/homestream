/**
 * GET /api/library/storage
 *
 * Returns disk usage stats for the media directory and library.
 *
 * Returns:
 *   libraryBytes   — sum of all file sizes in media-library.json
 *   libraryCount   — number of items in the library
 *   diskFreeBytes  — free bytes on the media dir partition (if available)
 *   diskTotalBytes — total bytes on the media dir partition (if available)
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import { execSync } from 'child_process';
import { readLibrary } from '../../../libraryStore.js';
import { readConfig } from '../../../configStore.js';

function getDiskStats(dir: string): { free: number; total: number } | null {
  try {
    // df -k returns 1K blocks; multiply by 1024 for bytes
    const out = execSync(`df -k "${dir}" 2>/dev/null | tail -1`, { timeout: 3000 }).toString().trim();
    const parts = out.split(/\s+/);
    // df columns: Filesystem, 1K-blocks, Used, Available, Use%, Mounted
    if (parts.length >= 4) {
      const total = parseInt(parts[1]) * 1024;
      const free  = parseInt(parts[3]) * 1024;
      if (!isNaN(total) && !isNaN(free)) return { free, total };
    }
  } catch { /* ignore — df not available or dir doesn't exist */ }
  return null;
}

export default async function handler(_req: Request, res: Response) {
  try {
    const library = readLibrary();
    const cfg = readConfig();

    // Sum file sizes from library records
    let libraryBytes = 0;
    for (const item of library) {
      const it = item as { fileSize?: number; filepath?: string; filePath?: string };
      if (it.fileSize && typeof it.fileSize === 'number') {
        libraryBytes += it.fileSize;
      } else {
        const fp = it.filepath || it.filePath;
        if (fp && typeof fp === 'string' && fs.existsSync(fp)) {
          try { libraryBytes += fs.statSync(fp).size; } catch { /* skip */ }
        }
      }
    }

    const diskStats = cfg.mediaDir ? getDiskStats(cfg.mediaDir) : null;

    res.json({
      libraryBytes,
      libraryCount: library.length,
      diskFreeBytes:  diskStats?.free  ?? null,
      diskTotalBytes: diskStats?.total ?? null,
      mediaDir: cfg.mediaDir || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get storage stats', message: String(err) });
  }
}
