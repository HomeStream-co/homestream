/**
 * GET /api/hls/:id/:segment
 *
 * Serves individual HLS segments (.ts files) for a transcoding job.
 * The segment filename is e.g. "0000.ts", "0001.ts", etc.
 *
 * Waits up to 10s for the segment to appear (FFmpeg may still be writing it).
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../../authMiddleware.js';
import { getHlsJobDir, startHlsJob } from '../../../../hlsTranscoder.js';
import { readLibrary } from '../../../../libraryStore.js';

const SEGMENT_WAIT_MS = 10_000;
const POLL_INTERVAL_MS = 200;

async function waitForSegment(segPath: string): Promise<boolean> {
  const deadline = Date.now() + SEGMENT_WAIT_MS;
  while (Date.now() < deadline) {
    if (fs.existsSync(segPath)) {
      // Also wait until the file has non-zero size (FFmpeg may still be writing)
      try {
        const stat = fs.statSync(segPath);
        if (stat.size > 0) return true;
      } catch { /* ignore */ }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { id, segment } = req.params;

  // Validate segment name — allow 4–6 digit segment filenames (e.g. 0000.ts … 999999.ts).
  // FFmpeg uses %04d by default but overflows to 5+ digits for files longer than ~5.5 hours.
  if (!/^\d{4,6}\.ts$/.test(segment)) {
    return res.status(400).json({ error: 'Invalid segment name' });
  }

  try {
    // Try to get existing job dir first
    let outputDir = getHlsJobDir(id);

    // If no job running, try to restart it (e.g. after server restart)
    if (!outputDir) {
      const library = readLibrary<{
        id: string;
        filePath?: string;
        filepath?: string;
      }>();
      const item = library.find(m => m.id === id);
      if (!item) return res.status(404).json({ error: 'Media not found' });

      const filePath = item.filePath ?? item.filepath ?? '';
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Source file not found' });
      }

      outputDir = await startHlsJob(id, filePath);
    }

    const segPath = path.join(outputDir, segment);
    const exists = await waitForSegment(segPath);

    if (!exists) {
      return res.status(404).json({ error: 'Segment not ready' });
    }

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(segPath).pipe(res);

  } catch (err) {
    console.error('[hls] segment error:', err);
    res.status(500).json({ error: 'Segment error', message: String(err) });
  }
}
