/**
 * GET /api/hls/:id/index.m3u8
 *
 * Starts (or reuses) an HLS transcode job for the given media item and
 * returns the HLS playlist. The player polls this until segments appear.
 *
 * Flow:
 *  1. Look up media item in library to get source file path
 *  2. Probe codec — if browser-safe, redirect to /api/stream/:filename
 *  3. Start HLS transcode job (FFmpeg → /tmp/homestream-hls/:id/)
 *  4. Wait for first segment, then serve the .m3u8 playlist
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../../authMiddleware.js';
import { readLibrary } from '../../../../libraryStore.js';
import { probeCodec, startHlsJob } from '../../../../hlsTranscoder.js';
import { checkRating } from '../../../../ratingGate.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { id } = req.params;

  try {
    // Find media item
    const library = readLibrary<{
      id: string;
      filename?: string;
      filePath?: string;
      filepath?: string;
      rated?: string;
    }>();
    const item = library.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    // ── Rating gate ───────────────────────────────────────────────────────────
    if (!checkRating(req, res, item.rated)) return;

    const filePath = item.filePath ?? item.filepath ?? '';
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Source file not found' });
    }

    // Probe codec
    const { needsTranscode, codec } = await probeCodec(filePath);

    if (!needsTranscode) {
      // Browser can handle this codec natively — redirect to direct stream
      const filename = item.filename ?? path.basename(filePath);
      return res.redirect(`/api/stream/${encodeURIComponent(filename)}`);
    }

    console.log(`[hls] Codec ${codec} needs transcode for ${id}`);

    // Start/reuse HLS job — waits until first segment is ready
    const outputDir = await startHlsJob(id, filePath);
    const playlistPath = path.join(outputDir, 'index.m3u8');

    if (!fs.existsSync(playlistPath)) {
      return res.status(503).json({ error: 'Transcode not ready yet — retry in a moment' });
    }

    // Serve the playlist
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(playlistPath).pipe(res);

  } catch (err) {
    console.error('[hls] playlist error:', err);
    res.status(500).json({ error: 'HLS error', message: String(err) });
  }
}
