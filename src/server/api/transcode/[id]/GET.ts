/**
 * GET /api/transcode/:id
 * Server-Sent Events stream for transcode job progress.
 * Client connects once and receives real-time updates until job completes.
 */
import type { Request, Response } from 'express';
import { getJob, subscribe } from '../../../transcodeStore.js';
import { requireAuth } from '../../../authMiddleware.js';

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { id } = req.params;

  const job = getJob(id);
  if (!job) {
    return res.status(404).json({ error: 'Transcode job not found' });
  }

  // If already done/error/skipped — respond with JSON immediately (no SSE needed)
  if (job.status === 'done' || job.status === 'error' || job.status === 'skipped') {
    return res.json(job);
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  // Subscribe to future updates
  const unsubscribe = subscribe(id, (data: string) => {
    res.write(data);

    // Parse to check if terminal state — close SSE when done
    try {
      const parsed = JSON.parse(data.replace('data: ', '').trim());
      if (parsed.status === 'done' || parsed.status === 'error' || parsed.status === 'skipped') {
        res.end();
      }
    } catch { /* ignore */ }
  });

  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
  });
}
