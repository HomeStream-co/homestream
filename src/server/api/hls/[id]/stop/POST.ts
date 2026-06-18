/**
 * POST /api/hls/:id/stop
 *
 * Stops the HLS transcode job for the given media ID, killing its FFmpeg process
 * and cleaning up its temporary segment files immediately.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../../authMiddleware.js';
import { stopHlsJob } from '../../../../hlsTranscoder.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const id = req.params.id as string;

  try {
    stopHlsJob(id);
    console.log(`[hls] Stopped HLS transcode job for ${id} via API request`);
    res.json({ success: true, message: 'Transcode job stopped successfully' });
  } catch (err) {
    console.error(`[hls] Failed to stop HLS job for ${id}:`, err);
    res.status(500).json({ error: 'Failed to stop HLS transcode job', message: String(err) });
  }
}
