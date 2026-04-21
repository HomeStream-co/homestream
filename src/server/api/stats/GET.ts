/**
 * GET /api/stats
 *
 * Returns comprehensive library statistics for the Stats Dashboard:
 *   - Storage: total library bytes, disk free/total
 *   - Codec breakdown: count + bytes per video codec
 *   - Resolution breakdown: 4K / 1080p / 720p / SD
 *   - Content type split: movies vs shows
 *   - Watch time: total seconds watched across all items
 *   - Top watched: items sorted by watchedSeconds desc
 *   - Recently added: last 5 items by addedAt
 *   - Genre distribution: top 10 genres by count
 *   - Download speed: live dlspeed + upspeed from qBit transferInfo
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import { execSync } from 'child_process';
import { readLibrary } from '../../libraryStore.js';
import { readConfig } from '../../configStore.js';
import { getTransferInfo, isReachable } from '../../qbittorrentClient.js';
import { requireAuth } from '../../authMiddleware.js';

interface LibraryItem {
  id: string;
  title: string;
  type: string;
  poster?: string;
  filePath?: string;
  filepath?: string;
  fileSize?: number;
  codec?: string;
  width?: number;
  height?: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  watchProgress?: number;
  lastWatchedAt?: string;
  addedAt?: string;
  genre?: string[];
  year?: string;
  demoStream?: boolean;
  isDemo?: boolean;
}

function getDiskStats(dir: string): { free: number; total: number } | null {
  try {
    const out = execSync(`df -k "${dir}" 2>/dev/null | tail -1`, { timeout: 3000 }).toString().trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 4) {
      const total = parseInt(parts[1]) * 1024;
      const free  = parseInt(parts[3]) * 1024;
      if (!isNaN(total) && !isNaN(free)) return { free, total };
    }
  } catch { /* df unavailable */ }
  return null;
}

function resolveFileSize(item: LibraryItem): number {
  if (item.fileSize && typeof item.fileSize === 'number') return item.fileSize;
  const fp = item.filePath || item.filepath;
  if (fp && fs.existsSync(fp)) {
    try { return fs.statSync(fp).size; } catch { /* skip */ }
  }
  return 0;
}

function resolveResolution(item: LibraryItem): '4K' | '1080p' | '720p' | 'SD' {
  const h = item.height ?? 0;
  if (h >= 2160) return '4K';
  if (h >= 1080) return '1080p';
  if (h >= 720)  return '720p';
  return 'SD';
}

export default async function handler(_req: Request, res: Response) {
  try {
    if (!requireAuth(_req, res)) return;
    const library = readLibrary<LibraryItem>();
    const cfg = readConfig();

    // Exclude demo-only items from stats
    const real = library.filter(item => !item.demoStream && !item.isDemo);

    // ── Storage ───────────────────────────────────────────────────────────────
    let libraryBytes = 0;
    for (const item of real) libraryBytes += resolveFileSize(item);

    const diskStats = cfg.mediaDir ? getDiskStats(cfg.mediaDir) : null;

    // Per-category storage breakdown
    let movieBytes = 0;
    let tvBytes = 0;
    let otherBytes = 0;
    for (const item of real) {
      const sz = resolveFileSize(item);
      if (item.type === 'movie') movieBytes += sz;
      else if (item.type === 'series') tvBytes += sz;
      else otherBytes += sz;
    }

    // ── Codec breakdown ───────────────────────────────────────────────────────
    const codecMap = new Map<string, { count: number; bytes: number }>();
    for (const item of real) {
      const codec = (item.codec ?? 'unknown').toLowerCase();
      const bytes = resolveFileSize(item);
      const existing = codecMap.get(codec) ?? { count: 0, bytes: 0 };
      codecMap.set(codec, { count: existing.count + 1, bytes: existing.bytes + bytes });
    }
    const codecs = Array.from(codecMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // ── Resolution breakdown ──────────────────────────────────────────────────
    const resMap: Record<string, { count: number; bytes: number }> = {
      '4K': { count: 0, bytes: 0 },
      '1080p': { count: 0, bytes: 0 },
      '720p': { count: 0, bytes: 0 },
      'SD': { count: 0, bytes: 0 },
    };
    for (const item of real) {
      const res = resolveResolution(item);
      resMap[res].count++;
      resMap[res].bytes += resolveFileSize(item);
    }
    const resolutions = Object.entries(resMap).map(([name, data]) => ({ name, ...data }));

    // ── Content type split ────────────────────────────────────────────────────
    const movies = real.filter(i => i.type === 'movie').length;
    const shows  = real.filter(i => i.type === 'series').length;
    const other  = real.length - movies - shows;

    // ── Watch time ────────────────────────────────────────────────────────────
    let totalWatchedSeconds = 0;
    for (const item of real) totalWatchedSeconds += item.watchedSeconds ?? 0;

    // ── Top watched ───────────────────────────────────────────────────────────
    const topWatched = [...real]
      .filter(i => (i.watchedSeconds ?? 0) > 0)
      .sort((a, b) => (b.watchedSeconds ?? 0) - (a.watchedSeconds ?? 0))
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        title: i.title,
        type: i.type,
        poster: i.poster,
        watchedSeconds: i.watchedSeconds ?? 0,
        totalSeconds: i.totalSeconds ?? 0,
        watchProgress: i.watchProgress ?? 0,
      }));

    // ── Recently added ────────────────────────────────────────────────────────
    const recentlyAdded = [...real]
      .filter(i => i.addedAt)
      .sort((a, b) => new Date(b.addedAt!).getTime() - new Date(a.addedAt!).getTime())
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        title: i.title,
        type: i.type,
        poster: i.poster,
        addedAt: i.addedAt,
        year: i.year,
      }));

    // ── Genre distribution ────────────────────────────────────────────────────
    const genreMap = new Map<string, number>();
    for (const item of real) {
      for (const g of item.genre ?? []) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }
    const genres = Array.from(genreMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Download speed (live from qBit) ───────────────────────────────────────
    let downloadSpeed: { dlspeed: number; upspeed: number; dlTotal: number; upTotal: number } | null = null;
    try {
      const qbitUp = await isReachable();
      if (qbitUp) {
        const info = await getTransferInfo();
        if (info) {
          downloadSpeed = {
            dlspeed: info.dl_info_speed ?? 0,
            upspeed: info.up_info_speed ?? 0,
            dlTotal: info.dl_info_data ?? 0,
            upTotal: info.up_info_data ?? 0,
          };
        }
      }
    } catch { /* qBit offline — skip */ }

    res.json({
      // Storage
      libraryBytes,
      libraryCount: real.length,
      diskFreeBytes:  diskStats?.free  ?? null,
      diskTotalBytes: diskStats?.total ?? null,
      mediaDir: cfg.mediaDir || null,
      // Per-category storage
      categoryBytes: { movies: movieBytes, tv: tvBytes, other: otherBytes },
      // Storage allocation targets from config
      storageAllocation: {
        moviesPct: cfg.storageMoviesPct ?? 60,
        tvPct:     cfg.storageTvPct     ?? 30,
        otherPct:  Math.max(0, 100 - (cfg.storageMoviesPct ?? 60) - (cfg.storageTvPct ?? 30)),
      },

      // Breakdown
      codecs,
      resolutions,

      // Content split
      contentTypes: { movies, shows, other },

      // Watch time
      totalWatchedSeconds,
      topWatched,
      recentlyAdded,

      // Genres
      genres,

      // Live download speed
      downloadSpeed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute stats', message: String(err) });
  }
}
