/**
 * POST /api/library/scan
 *
 * Triggers a manual re-scan of the configured media directory.
 * Finds video files not yet in the library and imports them with
 * OMDB metadata, AI enrichment, and caption fetch.
 *
 * Returns: { added: number, skipped: number, errors: string[] }
 */

import type { Request, Response } from 'express';
import { readConfig } from '../../../configStore.js';
import { scanExistingMedia, importExistingMedia } from '../../../existingMediaScanner.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(_req: Request, res: Response) {
  try {
    const cfg = readConfig();
    if (!cfg.mediaDir) {
      return res.status(400).json({ error: 'Media directory not configured. Run the setup wizard first.' });
    }

    // 1. Find new files
    const scanResult = scanExistingMedia(cfg.mediaDir);

    if (scanResult.files.length === 0) {
      return res.json({ added: 0, skipped: scanResult.skipped, errors: [] });
    }

    // 2. Import them
    const importResult = await importExistingMedia(scanResult.files);

    res.json({
      added: importResult.imported,
      skipped: scanResult.skipped,
      errors: importResult.failed > 0 ? [`${importResult.failed} file(s) failed to import`] : [],
      titles: importResult.titles,
    });
  } catch (err) {
    res.status(500).json({ error: 'Scan failed', message: String(err) });
  }
}
