import type { Request, Response } from 'express';
import { getAllJobs } from '../../../torrentManager.js';

/**
 * GET /api/stremio/downloads
 *
 * Returns all torrent download jobs (active + completed + errored).
 * The UI polls this every 2 seconds to show live progress.
 */
export default async function handler(_req: Request, res: Response) {
  const jobs = getAllJobs();
  res.json({ jobs });
}
