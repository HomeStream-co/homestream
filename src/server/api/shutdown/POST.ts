/**
 * POST /api/shutdown
 *
 * Graceful shutdown endpoint called by the Electron main process before
 * killing the server child process. Gives the server a chance to:
 *   1. Stop all active HLS transcoding jobs
 *   2. Clean up /tmp/homestream-hls/ segments
 *   3. Flush any pending writes
 *
 * POST (not GET) to prevent CSRF — a malicious page cannot trigger shutdown
 * via <img src="/api/shutdown"> or similar cross-origin GET requests.
 *
 * This is needed on Windows because SIGTERM is mapped to an immediate kill
 * (no graceful shutdown signal), so we use HTTP instead.
 *
 * Only accessible from localhost — not exposed to the network.
 */
import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  // Only allow from localhost
  const ip = req.socket.remoteAddress ?? '';
  if (!ip.includes('127.0.0.1') && !ip.includes('::1') && !ip.includes('localhost')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Acknowledge immediately so Electron doesn't time out
  res.json({ ok: true, message: 'Shutting down gracefully' });

  // Flush any pending debounced progress writes so the last seek position
  // is never lost when the server shuts down mid-playback.
  try {
    const { flushProgressWrites } = await import('../../api/media/[id]/progress/PATCH.js');
    await flushProgressWrites();
    console.log('[shutdown] Flushed pending progress writes');
  } catch (err) {
    console.warn('[shutdown] Progress flush failed (non-fatal):', err);
  }

  // Clean up HLS temp segments
  try {
    const { stopAllHlsJobs, HLS_BASE_DIR } = await import('../../hlsTranscoder.js');
    stopAllHlsJobs();
    const fs = await import('node:fs');
    if (fs.existsSync(HLS_BASE_DIR)) {
      fs.rmSync(HLS_BASE_DIR, { recursive: true, force: true });
      console.log('[shutdown] Cleaned up HLS temp segments');
    }
  } catch (err) {
    console.warn('[shutdown] HLS cleanup failed (non-fatal):', err);
  }

  // Give response time to flush, then exit
  setTimeout(() => process.exit(0), 500);
}
