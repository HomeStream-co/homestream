import type { Request, Response } from 'express';
import { deleteTorrent, isReachable } from '../../../../qbittorrentClient.js';
import { requireAuth } from '../../../../authMiddleware.js';
import { getPersistedJob, deleteJob } from '../../../../downloadJobStore.js';

/**
 * DELETE /api/stremio/downloads/:hash
 *
 * Remove a download from the queue.
 *
 * Handles two backends:
 *   1. Real-Debrid jobs  — identified by jobId prefix "rd-" OR by looking up
 *      the persisted job store. Removes the job record from disk; the actual
 *      RD torrent is already on RD's servers and cannot be cancelled mid-flight,
 *      but the local job entry (and its progress display) is cleared.
 *   2. qBittorrent       — delegates to the qBit REST API.
 *
 * Query param: ?deleteFiles=true  — also delete downloaded files from disk
 *              (qBit only; RD files are written to the media folder and are
 *               managed by the library, not this endpoint)
 */
export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { hash } = req.params as { hash: string };
  const deleteFiles = req.query.deleteFiles === 'true';

  if (!hash) {
    return res.status(400).json({ error: 'hash is required' });
  }

  // ── Real-Debrid job? ───────────────────────────────────────────────────────
  // Check the persisted job store first. If the jobId matches an RD job,
  // delete it from the store and return — no need to touch qBit.
  const persistedJob = getPersistedJob(hash);
  if (persistedJob && persistedJob.backend === 'real-debrid') {
    deleteJob(hash);
    return res.json({ ok: true, jobId: hash, backend: 'real-debrid' });
  }

  // Also handle the "rd-" prefix pattern as a safety net for jobs that may
  // not be in the store yet (e.g. race between upsert and delete).
  if (hash.startsWith('rd-')) {
    deleteJob(hash); // no-op if not found — safe
    return res.json({ ok: true, jobId: hash, backend: 'real-debrid' });
  }

  // ── qBittorrent job ────────────────────────────────────────────────────────
  const online = await isReachable();
  if (!online) {
    return res.status(503).json({ error: 'qBittorrent is not reachable' });
  }

  try {
    await deleteTorrent(hash, deleteFiles);
    // FIX (🔴): Previously only called deleteTorrent() but never removed the
    // job from the persisted store. After deletion the job would reappear on
    // the Downloads page on the next poll/refresh because the store still had
    // it. Now we always clean up the persisted record too.
    deleteJob(hash);
    res.json({ ok: true, hash, deleteFiles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete torrent', message: String(err) });
  }
}
