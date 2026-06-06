/**
 * GET /api/hls/:id/probe
 *
 * Returns codec info for a media item so the player can decide whether
 * to use direct streaming or HLS transcoding.
 *
 * Response:
 *   { codec: string, needsTranscode: boolean, hlsUrl: string | null, encoderLabel: string }
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import { requireAuth } from '../../../../authMiddleware.js';
import { readLibrary } from '../../../../libraryStore.js';
import { probeCodec } from '../../../../hlsTranscoder.js';
import { getCachedHwEncoder } from '../../../../hwEncoderDetect.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { id } = req.params;

  try {
    const library = readLibrary<{
      id: string;
      filePath?: string;
      filepath?: string;
    }>();
    const item = library.find(m => m.id === id);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    const filePath = item.filePath ?? item.filepath ?? '';
    if (!filePath || !fs.existsSync(filePath)) {
      return res.json({ codec: 'unknown', needsTranscode: false, hlsUrl: null, encoderLabel: 'Software (libx264)' });
    }

    const { codec, needsTranscode } = await probeCodec(filePath);
    const hw = getCachedHwEncoder();
    const encoderLabel = hw?.label ?? 'Software (libx264)';

    res.json({
      codec,
      needsTranscode,
      hlsUrl: needsTranscode ? `/api/hls/${id}/index.m3u8` : null,
      encoderLabel,
    });
  } catch (err) {
    res.status(500).json({ error: 'Probe failed', message: String(err) });
  }
}
