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
 * For Real-Debrid: re-runs the full resolvemagnet → downloadUrl pipeline.
 * For qBittorrent: re-adds the magnet (qBit handles resume internally
 *   if the partial download files are still on disk).
 * For WebTorrent: starts a fresh download (WebTorrent doesn't persist state).
 */

import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import {
  getPersistedJob, deleteJob, findJobByInfoHash,
  upsertJob, updateJobProgress,
} from '../../../../downloadJobStore.js';
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
    return res.status(409).json({ error: 'Job is not in error state', status: job.status });
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

    // ── Real-Debrid retry ──────────────────────────────────────────────────────
    if (job.backend === 'real-debrid') {
      const config = readConfig();
      const rdApiKey = config.realDebridApiKey?.trim();
      if (!rdApiKey) {
        return res.status(503).json({
          error: 'Real-Debrid API key not configured',
          message: 'Add your Real-Debrid API key in Settings → API Keys to retry this download.',
        });
      }

      // Delete old error job and create a fresh downloading job immediately
      deleteJob(jobId);
      const newJobId = `rd-${job.infoHash}-${Date.now()}`;
      const newJobEntry = {
        jobId: newJobId,
        infoHash: job.infoHash,
        title: job.title,
        quality: job.quality,
        type: job.type as 'movie' | 'series',
        season: job.season,
        episode: job.episode,
        status: 'downloading' as const,
        addedAt: new Date().toISOString(),
        poster: job.poster,
        imdbId: job.imdbId,
        backend: 'real-debrid' as const,
      };
      upsertJob(newJobEntry);

      // Respond immediately — RD resolves in background
      res.json({
        ok: true,
        newJobId,
        backend: 'real-debrid',
        message: `"${job.title}" re-queued via Real-Debrid`,
      });

      // Background: re-run the full RD pipeline
      const { resolvemagnet, downloadUrl } = await import('../../../../realDebridClient.js');
      (async () => {
        try {
          const cfg = readConfig();
          const directUrl = await resolvemagnet(magnet, rdApiKey);
          const ext = directUrl.split('?')[0].split('.').pop() ?? 'mkv';
          const safeTitle = job.title.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
          const destDir = cfg.downloadsDir || (cfg.mediaDir ? `${cfg.mediaDir}/downloads` : '/downloads');
          const destPath = `${destDir}/${safeTitle} [${job.quality}].${ext}`;
          let lastProgressWrite = 0;
          await downloadUrl(directUrl, destPath, (dl, total) => {
            const now = Date.now();
            if (total > 0 && now - lastProgressWrite > 1000) {
              lastProgressWrite = now;
              updateJobProgress(newJobId, dl, total);
            }
          });
          // Hand off to the shared pipeline (transcode + library add)
          const { runPostDownloadPipeline } = await import('../../../../postDownloadPipeline.js');
          await runPostDownloadPipeline({
            filePath: destPath,
            title: job.title,
            quality: job.quality,
            type: job.type,
            season: job.season,
            episode: job.episode,
            imdbId: job.imdbId,
            poster: job.poster,
            jobId: newJobId,
            backend: 'real-debrid',
          });
          console.log(`[rd-retry] ✓ ${job.title} pipeline complete`);
        } catch (err) {
          console.error(`[rd-retry] ✗ ${job.title} failed:`, err);
          upsertJob({ ...newJobEntry, status: 'error' });
        }
      })();

      return; // response already sent
    }

    // ── qBittorrent retry ──────────────────────────────────────────────────────
    const qbitReachable = await isReachable();

    if (qbitReachable && job.backend === 'qbittorrent') {
      const config = readConfig();
      const savePath = config.mediaDir ? `${config.mediaDir}/downloads` : '/downloads';

      const hash = await addMagnet(magnet, {
        savepath: savePath,
        category: 'homestream',
        tags: job.type,
      });

      deleteJob(jobId);
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
    }

    // ── WebTorrent fallback removed — no backend available ─────────────────────
    return res.status(503).json({
      ok: false,
      error: 'No download backend available',
      message: 'Configure Real-Debrid in Settings → Downloads for instant downloads, or start qBittorrent.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Retry failed', message: String(err) });
  }
}
