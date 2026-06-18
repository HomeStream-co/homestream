/**
 * GET /api/hls/:id/status
 *
 * Returns the status of an active HLS transcode job, including the percentage
 * of segment files generated.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../../authMiddleware.js';
import { readLibrary } from '../../../../libraryStore.js';
import { HLS_BASE_DIR, getHlsEncoderLabel, isHlsJobReady } from '../../../../hlsTranscoder.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const id = req.params.id as string;

  try {
    const outputDir = path.join(HLS_BASE_DIR, id);
    if (!fs.existsSync(outputDir)) {
      return res.json({ active: false });
    }

    // Read files in the directory and count segment_#####.ts files
    let segmentFiles: string[] = [];
    try {
      segmentFiles = fs.readdirSync(outputDir).filter(f => /^segment_\d{5}\.ts$/.test(f));
    } catch {
      // Directory read failed (e.g. concurrent deletion)
    }

    const segmentsCount = segmentFiles.length;

    // Get total duration of media item from library store
    const library = readLibrary<{ id: string; duration?: number }>();
    const item = library.find(m => m.id === id);
    const totalDuration = item?.duration ?? 0;

    let percentTranscoded = 0;
    if (totalDuration > 0) {
      // 6 seconds per segment
      percentTranscoded = Math.min(100, Math.round(((segmentsCount * 6) / totalDuration) * 100));
    }

    res.json({
      active: true,
      ready: isHlsJobReady(id),
      percentTranscoded,
      encoderLabel: getHlsEncoderLabel(id) || 'Software (libx264)',
    });
  } catch (err) {
    console.error('[hls] status error:', err);
    res.status(500).json({ error: 'Status check failed', message: String(err) });
  }
}
