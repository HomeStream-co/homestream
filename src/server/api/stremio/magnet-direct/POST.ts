import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';
import { addMagnet, isReachable as qbitReachable } from '../../../qbittorrentClient.js';
import { resolvemagnet, downloadUrl } from '../../../realDebridClient.js';
import { upsertJob, updateJobProgress } from '../../../downloadJobStore.js';
import { runPostDownloadPipeline } from '../../../postDownloadPipeline.js';
import { randomUUID } from 'crypto';

/**
 * POST /api/stremio/magnet-direct
 *
 * Accepts a raw magnet link or .torrent URL pasted by the user and sends it
 * to the best available download backend (RD first, then qBittorrent).
 *
 * Both paths respond immediately with a jobId and run the download + pipeline
 * in the background so the HTTP connection is never held open.
 *
 * Body: {
 *   magnet: string;       // magnet: URI or https:// .torrent URL
 *   title?: string;       // display name in queue
 *   poster?: string;      // poster URL for queue card
 *   type?: 'movie' | 'series';
 *   year?: string;
 * }
 */
export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { magnet, title, poster, type, year } = req.body as {
    magnet?: string;
    title?: string;
    poster?: string;
    type?: string;
    year?: string;
  };

  if (!magnet?.trim()) {
    res.status(400).json({ ok: false, error: 'magnet is required' });
    return;
  }

  const trimmed = magnet.trim();
  const isMagnet = trimmed.startsWith('magnet:');
  const isTorrentUrl = trimmed.startsWith('http') && (trimmed.includes('.torrent') || trimmed.includes('torrent'));

  if (!isMagnet && !isTorrentUrl) {
    res.status(400).json({ ok: false, error: 'Must be a magnet: link or a .torrent URL' });
    return;
  }

  const config = readConfig();
  const displayTitle = title?.trim() || 'Manual download';
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const mediaType = (type as 'movie' | 'series') ?? 'movie';

  // Extract infoHash from magnet for dedup / job tracking
  const infoHashMatch = trimmed.match(/btih:([a-fA-F0-9]{32,40})/i);
  const infoHash = infoHashMatch?.[1]?.toLowerCase() ?? jobId;

  // ── Path 1: Real-Debrid ──────────────────────────────────────────────────────
  if (config.realDebridApiKey) {
    const jobEntry = {
      jobId,
      infoHash,
      title: displayTitle,
      quality: 'Unknown',
      poster: poster ?? '',
      imdbId: '',
      type: mediaType,
      status: 'downloading' as const,
      progress: 0,
      backend: 'real-debrid' as const,
      addedAt: now,
    };
    upsertJob(jobEntry);

    // Respond immediately — RD resolve can take minutes
    res.json({ ok: true, jobId, backend: 'real-debrid', message: 'Queued via Real-Debrid' });

    // Background: resolve → download → pipeline
    ;(async () => {
      try {
        const rdApiKey = config.realDebridApiKey!;
        const directUrl = await resolvemagnet(trimmed, rdApiKey, (pct, status) => {
          console.log(`[magnet-direct/rd] ${displayTitle}: ${status} ${pct}%`);
        });

        const ext = directUrl.split('?')[0].split('.').pop() ?? 'mkv';
        const safeTitle = displayTitle.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
        const cfg2 = readConfig();
        const destDir = cfg2.downloadsDir || (cfg2.mediaDir ? `${cfg2.mediaDir}/downloads` : '/downloads');
        const destPath = `${destDir}/${safeTitle}.${ext}`;

        let lastWrite = 0;
        await downloadUrl(directUrl, destPath, (dl, total) => {
          const now2 = Date.now();
          if (total > 0 && now2 - lastWrite > 1000) {
            lastWrite = now2;
            updateJobProgress(jobId, dl, total);
          }
        });

        await runPostDownloadPipeline({
          filePath: destPath,
          title: displayTitle,
          quality: 'Unknown',
          type: mediaType,
          imdbId: '',
          poster,
          year,
          jobId,
          backend: 'real-debrid',
        });
      } catch (err) {
        console.error(`[magnet-direct/rd] Failed for "${displayTitle}":`, err);
        upsertJob({ ...jobEntry, status: 'error' });
      }
    })();

    return;
  }

  // ── Path 2: qBittorrent ──────────────────────────────────────────────────────
  const qbitOnline = await qbitReachable();
  if (!qbitOnline) {
    res.status(503).json({
      ok: false,
      error: 'No download backend available. Configure Real-Debrid in Settings or start qBittorrent.',
    });
    return;
  }

  try {
    const savepath = config.downloadsDir || config.mediaDir || undefined;
    const hash = await addMagnet(trimmed, {
      savepath: savepath ? `${savepath}/downloads` : undefined,
      category: 'homestream',
      tags: mediaType,
    });

    const jobEntry = {
      jobId,
      infoHash: hash || infoHash,
      title: displayTitle,
      quality: 'Unknown',
      poster: poster ?? '',
      imdbId: '',
      type: mediaType,
      status: 'queued' as const,
      progress: 0,
      backend: 'qbittorrent' as const,
      addedAt: now,
    };
    upsertJob(jobEntry);

    // qBit completion is handled by qbitCompletionWatcher — no inline polling needed
    res.json({ ok: true, jobId, backend: 'qbittorrent', hash, message: 'Sent to qBittorrent' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
