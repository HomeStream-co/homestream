/**
 * GET /api/library/storage
 *
 * Returns disk usage stats for the media directory and library,
 * including per-category (movies / TV / other) breakdown and
 * the configured storage allocation targets.
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import { execSync } from 'child_process';
import { readLibrary } from '../../../libraryStore.js';
import { readConfig } from '../../../configStore.js';
import { requireAuth } from '../../../authMiddleware.js';

function getDiskStats(dir: string): { free: number; total: number } | null {
<<<<<<< HEAD
  // Windows: use wmic to get disk free/total for the drive letter
  if (process.platform === 'win32') {
    try {
      // Extract drive letter (e.g. "D:" from "D:\HomeStream")
=======
  // Windows: use wmic — df does not exist on Windows
  if (process.platform === 'win32') {
    try {
>>>>>>> 20260425045933-9h9yrecco0
      const driveLetter = dir.match(/^([A-Za-z]:)/)?.[1];
      if (!driveLetter) return null;
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}'" get FreeSpace,Size /format:csv`,
        { timeout: 5000 }
      ).toString().trim();
<<<<<<< HEAD
      // CSV output: Node,FreeSpace,Size  (first line is header, second is data)
=======
      // CSV: Node,FreeSpace,Size  (first line header, second line data)
>>>>>>> 20260425045933-9h9yrecco0
      const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
      const dataLine = lines.find(l => !l.startsWith('Node') && l.includes(','));
      if (dataLine) {
        const parts = dataLine.split(',');
<<<<<<< HEAD
        // wmic csv: Node, FreeSpace, Size
=======
>>>>>>> 20260425045933-9h9yrecco0
        const free  = parseInt(parts[1] ?? '0', 10);
        const total = parseInt(parts[2] ?? '0', 10);
        if (!isNaN(free) && !isNaN(total) && total > 0) return { free, total };
      }
    } catch { /* wmic unavailable */ }
    return null;
  }

  // Linux / macOS: use df -k
  const safePath = dir.replace(/[`$\\|;&<>(){}!]/g, '');
  try {
    const out = execSync(`df -k "${safePath}" 2>/dev/null | tail -1`, { timeout: 3000 }).toString().trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 4) {
      const total = parseInt(parts[1]) * 1024;
      const free  = parseInt(parts[3]) * 1024;
      if (!isNaN(total) && !isNaN(free)) return { free, total };
    }
  } catch { /* df unavailable */ }
  return null;
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const library = readLibrary<{
      fileSize?: number;
      filepath?: string;
      filePath?: string;
      type?: string;
    }>();
    const cfg = readConfig();

    const real = library;

    let libraryBytes = 0;
    let movieBytes   = 0;
    let tvBytes      = 0;
    let otherBytes   = 0;

    for (const item of real) {
      let sz = 0;
      if (item.fileSize && typeof item.fileSize === 'number') {
        sz = item.fileSize;
      } else {
        const fp = item.filepath || item.filePath;
        if (fp && typeof fp === 'string' && fs.existsSync(fp)) {
          try { sz = fs.statSync(fp).size; } catch { /* skip */ }
        }
      }
      libraryBytes += sz;
      if (item.type === 'movie')  movieBytes += sz;
      else if (item.type === 'series') tvBytes += sz;
      else otherBytes += sz;
    }

    const diskStats = cfg.mediaDir ? getDiskStats(cfg.mediaDir) : null;
    const moviesPct = cfg.storageMoviesPct ?? 60;
    const tvPct     = cfg.storageTvPct     ?? 30;

    res.json({
      libraryBytes,
      libraryCount: real.length,
      diskFreeBytes:  diskStats?.free  ?? null,
      diskTotalBytes: diskStats?.total ?? null,
      mediaDir: cfg.mediaDir || null,
      categoryBytes: { movies: movieBytes, tv: tvBytes, other: otherBytes },
      storageAllocation: {
        moviesPct,
        tvPct,
        otherPct: Math.max(0, 100 - moviesPct - tvPct),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get storage stats', message: String(err) });
  }
}
