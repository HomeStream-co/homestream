/**
 * POST /api/security/scan
 * On-demand scan of a file already on disk (post-download verification).
 * Body: { filePath: string, infoHash?: string, title?: string }
 */
import type { Request, Response } from 'express';
import { runPostDownloadScan } from '../../../security/threatScanner.js';

export default function handler(req: Request, res: Response) {
  const { filePath, infoHash, title } = req.body as {
    filePath?: string;
    infoHash?: string;
    title?: string;
  };

  if (!filePath) {
    res.status(400).json({ error: 'filePath is required' });
    return;
  }

  const result = runPostDownloadScan({ filePath, infoHash, title });
  res.json(result);
}
