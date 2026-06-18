/**
 * POST /api/library/optimize
 * Safe bulk poster download + metadata enrichment
 */
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../../authMiddleware.js';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { runEnrichmentInBackground } from '../../../mediaUtils.js';
import { dataDir } from '../../../dataDir.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  res.json({ success: true, message: 'Optimization started in background...' });

  // Run in background
  (async () => {
    try {
      let library = readLibrary<any>();
      const postersDir = path.join(dataDir(), 'posters');
      if (!fs.existsSync(postersDir)) {
        fs.mkdirSync(postersDir, { recursive: true });
      }

      let modified = false;

      for (const item of library) {
        try {
          // === Poster Download ===
          if (item.poster && item.poster.startsWith('http')) {
            const ext = item.poster.toLowerCase().endsWith('.png') ? '.png' : '.jpg';
            const filename = `${item.id}${ext}`;
            const localPath = path.join(postersDir, filename);

            if (!fs.existsSync(localPath)) {
              console.log(`[optimize] Downloading poster: ${item.title}`);
              const response = await fetch(item.poster, { 
                signal: AbortSignal.timeout(15000) 
              });

              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                fs.writeFileSync(localPath, buffer);
                item.poster = `/posters/${filename}`;
                modified = true;
              }
            } else {
              // Update URL to local even if already downloaded
              item.poster = `/posters/${filename}`;
              modified = true;
            }
          }

          // === Metadata Enrichment ===
          if (!item.genre?.length || !item.plot) {
            console.log(`[optimize] Triggering enrichment for: ${item.title}`);
            runEnrichmentInBackground(item.id).catch(console.warn);
          }
        } catch (err) {
          console.warn(`[optimize] Skipped ${item.title}:`, err);
        }
      }

      if (modified) {
        await writeLibrary(() => library);   // Safe functional update
        console.log('[optimize] ✅ Library updated with local posters');
      }

      console.log('[optimize] Bulk optimization completed successfully');
    } catch (err) {
      console.error('[optimize] Critical error:', err);
    }
  })();
}
