/**
 * GET /api/history
 *
 * Returns all library items that have been watched at least once,
 * sorted by lastWatchedAt descending (most recent first).
 *
 * Each entry includes: id, title, type, poster, watchProgress,
 * watchedSeconds, totalSeconds, lastWatchedAt, watchedAt (if complete)
 */
import type { Request, Response } from 'express';
import { readLibrary } from '../../libraryStore.js';

interface LibraryItem {
  id: string;
  title: string;
  type: string;
  poster?: string;
  watchProgress?: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
  genre?: string[];
  imdbRating?: string;
  year?: string;
  rated?: string;
}

export default async function handler(_req: Request, res: Response) {
  try {
    const library = readLibrary<LibraryItem>();

    const watched = library
      .filter(item => item.lastWatchedAt)
      .sort((a, b) => {
        const ta = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
        const tb = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
        return tb - ta;
      })
      .map(item => ({
        id: item.id,
        title: item.title,
        type: item.type,
        poster: item.poster,
        watchProgress: item.watchProgress ?? 0,
        watchedSeconds: item.watchedSeconds ?? 0,
        totalSeconds: item.totalSeconds ?? 0,
        lastWatchedAt: item.lastWatchedAt,
        watchedAt: item.watchedAt,
        genre: item.genre ?? [],
        imdbRating: item.imdbRating,
        year: item.year,
        rated: item.rated,
      }));

    res.json(watched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history', message: String(err) });
  }
}
