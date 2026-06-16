import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { dataPath } from './dataDir.js';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { readConfig } from './configStore.js';
import { randomUUID } from 'crypto';
import { findExistingMediaIndex } from './mediaUtils.js';

function getFfprobeInfo(filePath: string) {
  try {
    const output = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { timeout: 15000 }
    ).toString();
    return JSON.parse(output);
  } catch (e) {
    console.warn(`[scanner] ffprobe failed for ${path.basename(filePath)}`);
    return {};
  }
}

function parseBasicTitle(filename: string) {
  return filename
    .replace(/\.\w+$/, '')
    .replace(/[\._]/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .trim();
}

export async function scanLibrary() {
  console.log('[scanner] Starting safe rescan...');
  const config = readConfig();
  const libraryRoot = config.libraryDir || dataPath('library');
  console.log(`[scanner] Using library root: ${libraryRoot}`);

  const currentLibrary = readLibrary();
  const existingPaths = new Set(
    currentLibrary.flatMap((m: any) => [
      (m.filePath || '').replace(/\\/g, '/'),
      (m.filepath || '').replace(/\\/g, '/'),
    ].filter(Boolean))
  );

  let addedCount = 0;

  const scanDir = async (dir: string, category: 'movies' | 'tv') => {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDir(fullPath, category);
        continue;
      }

      if (!/\.(mp4|mkv|avi|mov|wmv|m4v)$/i.test(entry.name)) continue;

      const relativePath = path.relative(libraryRoot, fullPath).replace(/\\/g, '/');
      const absPath = fullPath.replace(/\\/g, '/');

      if (existingPaths.has(absPath) || existingPaths.has(relativePath)) continue;

      const probe = getFfprobeInfo(fullPath);
      const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video') || {};
      const format = probe.format || {};

      const title = parseBasicTitle(entry.name);
      const finalSize = fs.statSync(fullPath).size;

      const mediaItem = {
        id: randomUUID(),
        filename: entry.name,
        originalFilename: entry.name,
        filepath: absPath,
        filePath: absPath,
        title,
        type: category === 'movies' ? 'movie' : 'series',
        category: category === 'movies' ? 'Movies' : 'TV Shows',
        year: 'Unknown',
        genre: [],                  // will be enriched later
        plot: '',
        director: '',
        actors: '',
        imdbRating: 'N/A',
        poster: '',
        runtime: 'Unknown',
        rated: 'NR',                // safe default for parental gate
        quality: videoStream.height ? `${Math.round(videoStream.height / 100) * 100}p` : 'Unknown',
        resolution: videoStream.height ? `${videoStream.width}x${videoStream.height}` : undefined,
        duration: parseFloat(format.duration) || undefined,
        codec: videoStream.codec_name,
        fileSize: finalSize,
        originalSize: finalSize,
        addedAt: new Date().toISOString(),
        watchProgress: 0,
        transcoding: false,
        needsMetadata: true,
        metadataAvailable: false,
        ccStatus: 'none',
        enriching: false,
        downloadedVia: 'manual-scan',
      };

      try {
        await writeLibrary((lib: any[]) => {
          const existingIndex = findExistingMediaIndex(lib, mediaItem);
          
          if (existingIndex >= 0) {
            console.log(`[scanner] 🔄 Updating existing: ${title}`);
            lib[existingIndex] = {
              ...lib[existingIndex],
              ...mediaItem,
              addedAt: lib[existingIndex].addedAt || new Date().toISOString()
            };
          } else {
            console.log(`[scanner] ✓ Added: ${title}`);
            lib.unshift(mediaItem);
            addedCount++;
          }
          return lib;
        });
      } catch (err) {
        console.error(`[scanner] Failed to add ${entry.name}:`, err);
      }
    }
  };

  try {
    await scanDir(path.join(libraryRoot, 'movies'), 'movies');
    await scanDir(path.join(libraryRoot, 'tv'), 'tv');

    console.log(`[scanner] Rescan complete. Added ${addedCount} new items.`);
    return { success: true, added: addedCount };
  } catch (err: any) {
    console.error('[scanner] Fatal error:', err);
    return { success: false, error: err.message };
  }
}
