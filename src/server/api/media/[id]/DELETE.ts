import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { removeFromAllWatchlists } from '../../../watchlistStore.js';
import { requireAuth } from '../../../authMiddleware.js';
import { dataDir } from '../../../dataDir.js';
import { killTranscode } from '../../../transcodeWorker.js';
import { getAllTorrents, deleteTorrent } from '../../../qbittorrentClient.js';
import { deleteJob, getAllPersistedJobs } from '../../../downloadJobStore.js';

const UPLOADS_DIR = path.join(dataDir(), 'uploads');

/**
 * Safely delete a file that belongs to this media item.
 *
 * Accepts either:
 *   - A bare filename (basename only) → resolved inside uploads/ (or fallbackDir)
 *   - An absolute path → used directly if it exists
 *
 * In both cases we verify the resolved path exists before unlinking.
 * We do NOT restrict deletion to uploads/ only — items imported via
 * folderWatcher live in the downloads directory and must also be deletable.
 * We DO prevent path traversal by rejecting any path that contains '..'
 * after normalisation.
 */
function safeDelete(fileRef: string, fallbackDir = UPLOADS_DIR): void {
  if (!fileRef) return;

  // Reject path traversal attempts BEFORE normalisation.
  // path.normalize resolves '..' segments so checking the normalised path
  // is insufficient — '/media/../../etc/passwd' normalises to '/etc/passwd'
  // with no '..' remaining. We must check the raw string first.
  if (fileRef.includes('..')) return;

  // Normalise to an absolute path
  const resolved = path.isAbsolute(fileRef)
    ? path.normalize(fileRef)
    : path.resolve(fallbackDir, path.basename(fileRef));

  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  } catch (err: any) { 
    if (err.code !== 'ENOENT') {
      console.error(`[delete] Failed to delete file ${resolved}:`, err);
      throw new Error(`Could not delete file ${resolved}: ${err.message}`);
    }
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!requireAuth(req, res)) return;
    const id = req.params.id as string;
    const data = readLibrary<Record<string, unknown>>();
    const item = data.find((m) => m.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    // Kill any active transcode process for this media item
    killTranscode(id);

    // ── Clean up associated torrents and jobs ──
    const primaryPath = (item.filePath ?? item.filepath ?? item.filename) as string | undefined;
    const fallbackDir = primaryPath && path.isAbsolute(primaryPath)
      ? path.dirname(primaryPath)
      : UPLOADS_DIR;

    const originalFilename = item.originalFilename as string | undefined;
    if (originalFilename) {
      try {
        const torrents = await getAllTorrents();
        const lowerOriginal = originalFilename.toLowerCase();
        for (const t of torrents) {
          const matchName = t.name && t.name.toLowerCase().includes(lowerOriginal);
          const matchContent = t.content_path && t.content_path.toLowerCase().includes(lowerOriginal);
          const matchSave = t.save_path && t.save_path.toLowerCase().includes(lowerOriginal);

          if (matchName || matchContent || matchSave) {
            console.log(`[delete] Found matching torrent in qBittorrent: ${t.name} (${t.hash}). Deleting...`);
            await deleteTorrent(t.hash, false);

            // Delete corresponding job by infoHash
            const jobs = getAllPersistedJobs();
            const job = jobs.find(j => j.infoHash?.toLowerCase() === t.hash.toLowerCase());
            if (job) {
              console.log(`[delete] Deleting corresponding download job: ${job.jobId}`);
              deleteJob(job.jobId);
            }
          }
        }
      } catch (err) {
        console.error(`[delete] Failed to clean up matching torrents in qBittorrent:`, err);
      }
    }

    // Now safely delete files (qBittorrent should have released its lock)
    if (primaryPath) safeDelete(primaryPath, fallbackDir);
    const originalRef = item.originalFilename as string | undefined;
    if (originalRef && originalRef !== path.basename(primaryPath ?? '')) {
      safeDelete(originalRef, fallbackDir);
    }

    // Also clean up any job whose title matches
    try {
      const jobs = getAllPersistedJobs();
      const mediaTitle = item.title as string | undefined;
      const mediaSeason = item.season as number | undefined;
      const mediaEpisode = item.episode as number | undefined;

      const matchedJob = jobs.find(j => {
        const titleMatch = mediaTitle && j.title && j.title.toLowerCase() === mediaTitle.toLowerCase();
        const typeMatch = j.type === item.type;
        const seasonMatch = j.season === mediaSeason;
        const episodeMatch = j.episode === mediaEpisode;
        return titleMatch && typeMatch && seasonMatch && episodeMatch;
      });

      if (matchedJob) {
        console.log(`[delete] Deleting matched download job: ${matchedJob.jobId}`);
        deleteJob(matchedJob.jobId);
      }
    } catch (err) {
      console.error(`[delete] Failed to clean up job by title match:`, err);
    }

    // Remove from library (serialised through write queue)
    await writeLibrary(lib => lib.filter(m => m.id !== id));
    // Remove from all profiles' watchlists
    await removeFromAllWatchlists(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media', message: String(error) });
  }
}
