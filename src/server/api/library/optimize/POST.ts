import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readLibrary, writeLibrary } from '../../../libraryStore.js';
import { dataPath } from '../../../dataDir.js';
import { runEnrichmentInBackground } from '../../../mediaUtils.js';
import { requireAuth } from '../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  // We return immediately to not block the UI, and process in the background.
  res.json({ success: true, message: 'Optimization started in background' });

  // Fire and forget with better structure
  queueOptimizationJob().catch(err => {
    console.error('[optimize] Bulk job failed:', err);
  });
}

// Separate function for the background task
async function queueOptimizationJob() {
  const postersDir = path.join(dataPath(), 'posters');
  if (!fs.existsSync(postersDir)) {
    fs.mkdirSync(postersDir, { recursive: true });
  }

  const library = await readLibrary();
  let changed = false;

  for (const item of library) {
    let itemChanged = false;

    try {
      // 1. Trigger AI Enrichment if missing
      if (!item.genre || item.genre.length === 0 || !item.themes || item.themes.length === 0) {
        console.log(`[optimize] Triggering enrichment for: ${item.title}`);
        runEnrichmentInBackground(item.id).catch(e => console.error('[optimize] Enrichment error:', e));
      }

      // 2. Download and optimize poster locally
      if (item.poster && item.poster.startsWith('http')) {
        const ext = item.poster.toLowerCase().endsWith('.png') ? '.png' : '.jpg';
        const fileName = `${item.id}${ext}`;
        const localPath = path.join(postersDir, fileName);

        // Prevent duplicate downloads
        if (!fs.existsSync(localPath)) {
          console.log(`[optimize] Downloading poster for: ${item.title}`);
          const imgRes = await fetch(item.poster);
          
          if (imgRes.ok && imgRes.body) {
            // Stream the download directly to disk
            const fileStream = fs.createWriteStream(localPath);
            const reader = imgRes.body.getReader();
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fileStream.write(Buffer.from(value));
              }
              fileStream.end();
            };
            await pump();

            item.poster = `/posters/${fileName}`;
            itemChanged = true;
            console.log(`[optimize] Saved poster locally for: ${item.title}`);
          } else {
            console.warn(`[optimize] Failed to download poster for ${item.title}: Status ${imgRes.status}`);
          }
        } else {
           // File exists locally but DB still has HTTP link, just update DB
           item.poster = `/posters/${fileName}`;
           itemChanged = true;
        }
      }
    } catch (err) {
      console.warn(`[optimize] Failed processing ${item.title}:`, err);
    }

    if (itemChanged) {
      changed = true;
    }
  }

  if (changed) {
    // Re-read before writing to prevent race conditions during long jobs
    const currentLibrary = await readLibrary();
    const updatedLibrary = currentLibrary.map(currentItem => {
      const optimizedItem = library.find(i => i.id === currentItem.id);
      if (optimizedItem && optimizedItem.poster !== currentItem.poster) {
         return { ...currentItem, poster: optimizedItem.poster };
      }
      return currentItem;
    });

    await writeLibrary(updatedLibrary);
    console.log('[optimize] Library updated with local posters.');
  } else {
    console.log('[optimize] No poster updates needed.');
  }
}
