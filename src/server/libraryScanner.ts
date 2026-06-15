import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { readConfig } from './configStore.js';
import { buildMediaItem } from './mediaUtils.js';
import { probeFile } from './probeCache.js';

export async function scanLibrary() {
  console.log('[scanner] Starting safe rescan of library...');
  const cfg = readConfig();
  const LIBRARY_ROOT = cfg.libraryDir || path.resolve(process.cwd(), 'library');

  if (!fs.existsSync(LIBRARY_ROOT)) {
    console.warn(`[scanner] Library directory does not exist: ${LIBRARY_ROOT}`);
    return { success: false, error: 'Library directory does not exist' };
  }

  const currentLibrary = readLibrary<any>();
  const existingPaths = new Set(currentLibrary.map(m => m.filePath || m.filepath));

  let addedCount = 0;

  async function scanDir(dir: string, category: 'movies' | 'tv') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath, category);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm', '.flv'];
      if (!allowed.includes(ext)) continue;

      if (existingPaths.has(fullPath)) {
        continue;
      }

      console.log(`[scanner] Found new file: ${entry.name}. Probing...`);
      const probe = await probeFile(fullPath);

      // Extract basic title: strip extension, convert underscores/dots to spaces
      const cleanTitle = entry.name
        .replace(/\.[^.]+$/, '')
        .replace(/[\._]/g, ' ')
        .replace(/\b(19|20)\d{2}\b/g, '')
        .trim();

      const finalSize = fs.statSync(fullPath).size;

      // Construct media item using buildMediaItem (same as upload / watcher)
      const mediaItem = {
        ...buildMediaItem({
          id: randomUUID(),
          filename: entry.name,
          originalFilename: entry.name,
          filePath: fullPath,
          fileSize: finalSize,
          omdb: null, // Scanner is fast, background enrichment will pick it up
          extractedTitle: cleanTitle,
          extractedYear: 'Unknown',
          transcoding: false,
          importedFrom: 'existing_scan',
        }),
        type: category === 'movies' ? ('movie' as const) : ('series' as const),
        category: category === 'movies' ? 'Movies' : 'TV Shows',
      };

      // Add extra details from probe
      if (probe.codec !== 'unknown') {
        (mediaItem as any).quality = probe.height ? `${probe.height}p` : 'Unknown';
        (mediaItem as any).resolution = probe.height ? `${probe.width}x${probe.height}` : undefined;
        (mediaItem as any).duration = probe.durationSecs || undefined;
      }

      try {
        await writeLibrary(lib => {
          lib.unshift(mediaItem);
          return lib;
        });
        console.log(`[scanner] ✓ Added to library: ${cleanTitle}`);
        addedCount++;
      } catch (err) {
        console.error(`[scanner] Failed to save ${entry.name} to library:`, err);
      }
    }
  }

  try {
    await scanDir(path.join(LIBRARY_ROOT, 'movies'), 'movies');
    await scanDir(path.join(LIBRARY_ROOT, 'tv'), 'tv');

    console.log(`[scanner] Rescan complete. Added ${addedCount} new items.`);
    return { success: true, added: addedCount };
  } catch (err) {
    console.error('[scanner] Fatal scanner error:', err);
    return { success: false, error: (err as Error).message };
  }
}
