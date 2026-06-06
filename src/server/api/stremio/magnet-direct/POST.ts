import type { Request, Response } from 'express';
import { requireAuth } from '../../../authMiddleware.js';
import { readConfig } from '../../../configStore.js';
import { addMagnet, isReachable as qbitReachable } from '../../../qbittorrentClient.js';
import { resolvemagnet } from '../../../realDebridClient.js';
import { upsertJob } from '../../../downloadJobStore.js';
import { randomUUID } from 'crypto';

/**
 * POST /api/stremio/magnet-direct
 *
 * Accepts a raw magnet link or .torrent URL pasted by the user and sends it
 * to the best available download backend (RD first, then qBittorrent).
 *
 * Unlike /api/stremio/magnet (which only supports qBittorrent), this endpoint:
 *   - Routes through Real-Debrid when an API key is configured (instant cached downloads)
 *   - Falls back to qBittorrent when RD is not configured or the magnet isn't cached
 *   - Creates a download job entry so it appears in the Downloads queue UI
 *   - Accepts an optional title for the queue card display
 *
 * Body: {
 *   magnet: string;       // magnet: URI or https:// .torrent URL
 *   title?: string;       // display name in queue
 *   poster?: string;      // poster URL for queue card
 *   type?: 'movie' | 'series';
 * }
 */
export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { magnet, title, poster, type } = req.body as {
    magnet?: string;
    title?: string;
    poster?: string;
    type?: string;
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

  // Extract infoHash from magnet for dedup / job tracking
  const infoHashMatch = trimmed.match(/btih:([a-fA-F0-9]{32,40})/i);
  const infoHash = infoHashMatch?.[1]?.toLowerCase() ?? jobId;

  try {
    // ── Path 1: Real-Debrid ────────────────────────────────────────────────────
    if (config.realDebridApiKey) {
      try {
        const rdLink = await resolvemagnet(trimmed, config.realDebridApiKey);
        if (rdLink) {
          upsertJob({
            jobId,
            infoHash,
            title: displayTitle,
            quality: 'Unknown',
            poster: poster ?? '',
            imdbId: '',
            type: (type as 'movie' | 'series') ?? 'movie',
            status: 'downloading',
            progress: 0,
            backend: 'real-debrid',
            addedAt: now,
          });
          res.json({ ok: true, jobId, backend: 'realdebrid', message: 'Sent to Real-Debrid' });
          return;
        }
      } catch (rdErr) {
        console.warn('[magnet-direct] RD failed, falling back to qBit:', rdErr);
      }
    }

    // ── Path 2: qBittorrent ────────────────────────────────────────────────────
    const qbitOnline = await qbitReachable();
    if (!qbitOnline) {
      res.status(503).json({
        ok: false,
        error: 'No download backend available. Configure Real-Debrid in Settings or start qBittorrent.',
      });
      return;
    }

    const savepath = config.downloadsDir || config.mediaDir || undefined;
    const hash = await addMagnet(trimmed, savepath ? { savepath } : {});

    upsertJob({
      jobId,
      infoHash: hash || infoHash,
      title: displayTitle,
      quality: 'Unknown',
      poster: poster ?? '',
      imdbId: '',
      type: (type as 'movie' | 'series') ?? 'movie',
      status: 'downloading',
      progress: 0,
      backend: 'qbittorrent',
      addedAt: now,
    });

    res.json({ ok: true, jobId, backend: 'qbittorrent', hash, message: 'Sent to qBittorrent' });

  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
