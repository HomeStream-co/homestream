/**
 * POST /api/stremio/downloads/retry
 *
 * Retries an interrupted or errored download job.
 *
 * Body: { jobId: string }
 *
 * Behaviour:
 *   1. Looks up the persisted job by jobId
 *   2. Rebuilds the magnet link from the stored infoHash
 *   3. Re-queues via the same backend that originally handled it
 *   4. Marks the old job as superseded (deleted from store)
 *   5. Returns the new job
 *
 * For qBittorrent: re-adds the magnet (qBit handles resume internally
 * if the partial download files are still on disk).
 * For WebTorrent: starts a fresh download (WebTorrent doesn't persist state).
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { getPersistedJob, deleteJob, findJobByInfoHash } from '../../../../downloadJobStore.js';
import { addMagnet, isReachable } from '../../../../qbittorrentClient.js';
import { readConfig } from '../../../../configStore.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { jobId } = req.body as { jobId?: string };
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  const job = getPersistedJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'error') {
    return res.status(409).json({
      error: 'Job is not in error state',
      status: job.status,
    });
  }

  // Check if already re-queued (prevent double-retry)
  const existing = findJobByInfoHash(job.infoHash);
  if (existing && existing.jobId !== jobId) {
    return res.status(409).json({
      error: 'A download for this torrent is already active',
      existingJobId: existing.jobId,
    });
  }

  try {
    const magnet = `magnet:?xt=urn:btih:${job.infoHash}`;
    const qbitReachable = await isReachable();

    if (qbitReachable && job.backend === 'qbittorrent') {
      const config = readConfig();
      const savePath = config.mediaDir ? `${config.mediaDir}/downloads` : '/downloads';

      // Re-add to qBittorrent — it will resume from partial files if present
      const hash = await addMagnet(magnet, {
        savepath: savePath,
        category: 'homestream',
        tags: job.type,
      });

      // Remove old error job, upsert fresh queued job
      deleteJob(jobId);

      const { upsertJob } = await import('../../../../downloadJobStore.js');
      const newJobId = hash || job.infoHash;
      upsertJob({
        jobId: newJobId,
        infoHash: job.infoHash,
        title: job.title,
        quality: job.quality,
        type: job.type,
        season: job.season,
        episode: job.episode,
        status: 'queued',
        addedAt: new Date().toISOString(),
        poster: job.poster,
        imdbId: job.imdbId,
        backend: 'qbittorrent',
      });

      return res.json({
        ok: true,
        newJobId,
        backend: 'qbittorrent',
        message: `"${job.title}" re-queued in qBittorrent`,
      });
    } else {
      // WebTorrent fallback — start fresh download
      const { queueDownload } = await import('../../../../torrentManager.js');
      deleteJob(jobId);

      const newJob = queueDownload({
        infoHash: job.infoHash,
        magnet,
        title: job.title,
        quality: job.quality,
        type: job.type,
        season: job.season,
        episode: job.episode,
        imdbId: job.imdbId,
        poster: job.poster,
      });

      return res.json({
        ok: true,
        newJobId: newJob.jobId,
        backend: 'webtorrent',
        message: `"${job.title}" restarted via WebTorrent`,
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: 'Retry failed',
      message: String(err),
    });
  }
}
