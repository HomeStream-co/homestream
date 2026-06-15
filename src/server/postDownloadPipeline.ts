/**
 * postDownloadPipeline — shared post-download processing
 *
 * Called by EVERY download backend (Real-Debrid, qBittorrent) once a file
 * lands on disk. Runs the full pipeline:
 *
 *   1. Fetch OMDB metadata
 *   2. Determine category (Movies / TV Shows / Anime / Animation / Documentaries)
 *   3. Transcode the file (or copy as-is if autoTranscode === false)
 *   4. Move final file to library/<category-subfolder>/
 *   5. Add item to library with correct path (only AFTER file is in place)
 *   6. Delete source file from downloads folder
 *   7. Mark job done + remove torrent from qBittorrent
 *   8. Kick off background enrichment + caption fetch
 *
 * File organisation:
 *   library/
 *     movies/       ← Movies, Animation, Documentaries, Anime
 *     tv/           ← TV Shows
 *
 * NOTE: Items are NOT added to the library while transcoding — they only
 * appear once the file is fully ready to play. This prevents "stuck"
 * Optimizing… cards and "Media not found" errors.
 */

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { transcodeFile } from './transcodeWorker.js';
import { fetchOMDB } from './mediaUtils.js';
import { runEnrichmentInBackground, runCaptionFetchInBackground } from './mediaUtils.js';
import { upsertJob, getPersistedJob } from './downloadJobStore.js';
import { readConfig } from './configStore.js';
import { deleteTorrent, pauseTorrent } from './qbittorrentClient.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostDownloadParams {
  /** Absolute path to the downloaded video file */
  filePath: string;
  /** Human-readable title (e.g. "Breaking Bad S01E01") */
  title: string;
  /** Quality string from the stream picker (e.g. "1080p BluRay") */
  quality: string;
  /** movie or series */
  type: 'movie' | 'series';
  /** Season number (series only) */
  season?: number;
  /** Episode number (series only) */
  episode?: number;
  /** IMDB ID — used for OMDB lookup */
  imdbId?: string;
  /** Poster URL from TMDB/Cinemeta — used as fallback if OMDB has none */
  poster?: string;
  /** Release year — improves OMDB match accuracy */
  year?: string;
  /** Download job ID — updated to 'transcoding' then 'done' / 'error' */
  jobId: string;
  /** Which backend produced this file */
  backend: 'real-debrid' | 'qbittorrent';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function moveFile(src: string, dest: string, retries = 5): Promise<void> {
  if (src === dest) return;
  if (!fs.existsSync(src)) return;
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      fs.renameSync(src, dest);
      console.log(`[pipeline] ✓ Moved: ${src} → ${dest}`);
      return;
    } catch (err: any) {
      const code = err.code;
      if ((code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') && attempt < retries) {
        console.warn(`[pipeline] ⚠️ File locked (attempt ${attempt + 1}/${retries + 1}), waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(1.5, attempt)));
        continue;
      }
      if (code === 'EXDEV' || (code === 'EBUSY' && attempt === retries)) {
        console.log(`[pipeline] 🔄 Falling back to copy+delete for ${src}`);
        fs.copyFileSync(src, dest);
        try {
          fs.unlinkSync(src);
        } catch (e) {
          console.warn('[pipeline] Could not delete original after copy:', e);
        }
        console.log(`[pipeline] ✓ Copied: ${src} → ${dest}`);
        return;
      }
      throw err;
    }
  }
}

/**
 * Produce a clean, filesystem-safe filename from an OMDB title + year.
 * Falls back to the original basename if no OMDB data.
 * Strips timestamp prefixes like "1781549335871-".
 */
function cleanFilename(omdbTitle: string | undefined, omdbYear: string | undefined, originalBasename: string, ext: string): string {
  if (omdbTitle) {
    const safeName = omdbTitle
      .replace(/[<>:"/\\|?*]+/g, '')   // strip illegal chars
      .replace(/\s+/g, '_')             // spaces → underscores
      .replace(/_+/g, '_')              // collapse multiple underscores
      .trim();
    const yearPart = omdbYear ? `_${omdbYear}` : '';
    return `${safeName}${yearPart}${ext}`;
  }
  // Strip leading timestamp prefix (e.g. "1781549335871-")
  return originalBasename.replace(/^\d{13}-/, '');
}

// ── Category resolver ─────────────────────────────────────────────────────────

function resolveCategory(
  type: 'movie' | 'series',
  genres: string[],
  title: string,
): string {
  if (type === 'series') return 'TV Shows';

  const g = genres.map(x => x.toLowerCase());

  // Anime heuristic: Animation + Japanese keywords in title or genre
  const isAnime =
    g.includes('animation') &&
    (title.toLowerCase().match(/\b(anime|manga|shonen|shojo|seinen|isekai|mecha|naruto|bleach|one piece|dragon ball|attack on titan|demon slayer|jujutsu|chainsaw|spy x|my hero)\b/) != null ||
     g.includes('japan'));

  if (isAnime) return 'Anime';
  if (g.includes('animation')) return 'Animation';
  if (g.includes('documentary')) return 'Documentaries';
  return 'Movies';
}

/** Map a category string to the correct library subfolder name */
function categorySubfolder(category: string): string {
  return category === 'TV Shows' ? 'tv' : 'movies';
}

function resolveVideoFile(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const videoExtensions = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm', '.flv']);
      let largestFile = '';
      let largestSize = 0;

      const scan = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (videoExtensions.has(ext)) {
              const fsize = fs.statSync(fullPath).size;
              if (fsize > largestSize) {
                largestSize = fsize;
                largestFile = fullPath;
              }
            }
          }
        }
      };

      scan(filePath);
      if (largestFile) {
        console.log(`[pipeline] Resolved directory ${filePath} to video file: ${largestFile}`);
        return largestFile;
      }
    }
  } catch (err) {
    console.error(`[pipeline] Error resolving video file:`, err);
  }
  return filePath;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPostDownloadPipeline(params: PostDownloadParams): Promise<void> {
  const {
    filePath: initialFilePath, title, quality, type, season, episode,
    imdbId, poster, year, jobId, backend,
  } = params;

  if (!fs.existsSync(initialFilePath)) {
    console.error(`[pipeline] File not found: ${initialFilePath}`);
    const existing = getPersistedJob(jobId);
    if (existing) upsertJob({ ...existing, status: 'error' });
    return;
  }

  const filePath = resolveVideoFile(initialFilePath);
  const mediaId = randomUUID();
  const srcFilename = path.basename(filePath);
  const srcExt      = path.extname(srcFilename).toLowerCase();

  // ── 1. Mark job as transcoding ──
  const existingJob = getPersistedJob(jobId);
  if (existingJob) upsertJob({ ...existingJob, status: 'transcoding' });

  // ── Pause qBit torrent immediately to release file lock ──
  if (backend === 'qbittorrent' && existingJob?.infoHash) {
    try {
      console.log(`[pipeline] Pausing torrent ${existingJob.infoHash} to release file lock...`);
      await pauseTorrent(existingJob.infoHash);
      // Brief settle to let qBit release locks
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (pauseErr) {
      console.warn(`[pipeline] Failed to pause torrent ${existingJob.infoHash}:`, pauseErr);
    }
  }

  // ── 2. Fetch OMDB metadata ──
  const lookupTitle = type === 'series'
    ? title.replace(/\s+S\d{2}E\d{2}$/i, '').trim()
    : title;
  const omdb = await fetchOMDB(lookupTitle, year);

  const genres: string[] = omdb?.Genre
    ? omdb.Genre.split(',').map((g: string) => g.trim()).filter(Boolean)
    : ['Unknown'];

  const category   = resolveCategory(type, genres, title);
  const subfolder  = categorySubfolder(category);

  const episodeLabel = type === 'series' && season != null && episode != null
    ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
    : '';

  const fileSize = fs.statSync(filePath).size;

  const cfg        = readConfig();
  const libraryDir = cfg.libraryDir || path.dirname(filePath);
  const targetDir  = path.join(libraryDir, subfolder);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // ── DEDUP CHECK: prevent double-entry if pipeline fires twice ──
  const resolvedTitle = omdb?.Title || title;
  const resolvedYear  = omdb?.Year  || year;
  const currentLib = readLibrary<{ id: string; imdbId?: string; title?: string; year?: string; transcoding?: boolean }>();
  const dup = currentLib.find(m => {
    if (m.transcoding) return false;
    if (imdbId && m.imdbId && m.imdbId === imdbId) return true;
    return m.title === resolvedTitle && m.year === resolvedYear;
  });
  if (dup) {
    console.log(`[pipeline] Dedup — "${resolvedTitle}" already in library (id=${dup.id}). Skipping re-add.`);
    const doneJob = getPersistedJob(jobId);
    if (doneJob) upsertJob({ ...doneJob, status: 'done', progress: 100, completedAt: new Date().toISOString() });
    if (backend === 'qbittorrent' && doneJob?.infoHash) {
      deleteTorrent(doneJob.infoHash, true).catch(() => {});
    }
    return;
  }

  // ── 3. Helper to build the library media item ──
  const buildItem = (finalPath: string, finalFilename: string, finalSize: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: mediaId,
    filename: finalFilename,
    originalFilename: srcFilename,
    filepath: finalPath,
    filePath: finalPath,
    title: resolvedTitle,
    year: resolvedYear || 'Unknown',
    genre: genres,
    plot: omdb?.Plot || '',
    director: omdb?.Director || '',
    actors: omdb?.Actors || '',
    imdbRating: omdb?.imdbRating || 'N/A',
    poster: (omdb?.Poster && omdb.Poster !== 'N/A') ? omdb.Poster : (poster || ''),
    type,
    runtime: omdb?.Runtime || 'Unknown',
    rated: omdb?.Rated && omdb.Rated !== 'N/A' ? omdb.Rated.trim() : 'NR',
    addedAt: new Date().toISOString(),
    watchProgress: 0,
    fileSize: finalSize,
    originalSize: fileSize,
    transcoding: false,
    needsMetadata: !omdb,
    metadataAvailable: !!omdb,
    imdbId: imdbId || '',
    season,
    episode,
    episodeLabel,
    category,
    downloadedVia: backend,
    quality,
    ccStatus: 'none',
    enriching: false,
    ...extra,
  });

  // ── 4. No-transcode path ──
  if (cfg.autoTranscode === false) {
    const destFilename = cleanFilename(omdb?.Title, omdb?.Year, srcFilename, srcExt);
    const destPath     = path.join(targetDir, destFilename);
    try {
      await moveFile(filePath, destPath);
    } catch (moveErr) {
      console.error(`[pipeline] Failed to move file to ${targetDir}:`, moveErr);
    }

    if (!fs.existsSync(destPath)) {
      console.error(`[pipeline] File missing after move attempt: ${destPath}`);
      const doneJob = getPersistedJob(jobId);
      if (doneJob) upsertJob({ ...doneJob, status: 'error' });
      return;
    }

    const finalSize = fs.statSync(destPath).size;
    const mediaItem = buildItem(destPath, destFilename, finalSize);

    await writeLibrary(lib => { lib.unshift(mediaItem); return lib; });
    console.log(`[pipeline] ✓ Added "${resolvedTitle}" → ${destPath}`);

    const doneJob = getPersistedJob(jobId);
    if (doneJob) upsertJob({ ...doneJob, status: 'done', progress: 100, completedAt: new Date().toISOString() });

    if (backend === 'qbittorrent' && doneJob?.infoHash) {
      await deleteTorrent(doneJob.infoHash, true).catch(err =>
        console.error(`[pipeline] Failed to remove torrent ${doneJob.infoHash}:`, err));
    }

    runEnrichmentInBackground(mediaId).catch(() => {});
    runCaptionFetchInBackground(mediaId).catch(() => {});
    return;
  }

  // ── 5. Transcode path ──
  // Output goes to targetDir with a clean filename
  const tcBasename   = cleanFilename(omdb?.Title, omdb?.Year, srcFilename, '').replace(/\.[^.]*$/, '');
  const tcFilename   = `${tcBasename}_tc.mp4`;
  const outputPath   = path.join(targetDir, tcFilename);

  console.log(`[pipeline] Transcoding "${resolvedTitle}" → ${outputPath}`);

  let finalPath     = outputPath;
  let finalFilename = tcFilename;
  let finalSize     = fileSize;
  let tcExtra: Record<string, unknown> = {};

  try {
    const result = await transcodeFile(mediaId, filePath, outputPath);
    finalSize = result.finalSize;
    tcExtra = {
      savedBytes: result.savedBytes,
      transcodeStrategy: result.strategy,
      originalSize: result.originalSize,
    };

    if (result.outputFilename !== path.basename(outputPath)) {
      // Transcode reverted to original (output was larger) — move original to targetDir
      finalFilename = cleanFilename(omdb?.Title, omdb?.Year, srcFilename, srcExt);
      finalPath     = path.join(targetDir, finalFilename);
      console.log(`[pipeline] Reverted to original, moving: ${filePath} → ${finalPath}`);
      await moveFile(filePath, finalPath);
    }
    // The _tc.mp4 is already at outputPath — no move needed
    console.log(`[pipeline] ✓ Transcode complete for "${resolvedTitle}" — saved ${Math.round((result.savedBytes ?? 0) / 1e6)} MB`);
  } catch (transcodeErr) {
    console.error(`[pipeline] Transcode failed for "${resolvedTitle}":`, transcodeErr);
    // Move original to targetDir so it's still playable
    finalFilename = cleanFilename(omdb?.Title, omdb?.Year, srcFilename, srcExt);
    finalPath     = path.join(targetDir, finalFilename);
    try {
      await moveFile(filePath, finalPath);
    } catch (moveErr) {
      console.error(`[pipeline] Also failed to move original:`, moveErr);
    }
    tcExtra = { transcodeError: String(transcodeErr) };
  }

  // ── 6. Delete source file from downloads (if it still exists and isn't the final file) ──
  if (fs.existsSync(filePath) && filePath !== finalPath) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[pipeline] Deleted source from downloads: ${filePath}`);
    } catch (delErr) {
      console.warn(`[pipeline] Could not delete source file: ${filePath}`, delErr);
    }
  }

  // ── 7. Verify final file exists before adding to library ──
  if (!fs.existsSync(finalPath)) {
    console.error(`[pipeline] Final file missing after processing: ${finalPath}. NOT adding to library.`);
    const errJob = getPersistedJob(jobId);
    if (errJob) upsertJob({ ...errJob, status: 'error' });
    return;
  }

  finalSize = fs.statSync(finalPath).size;

  // ── 8. Add to library (only now — file is confirmed in place) ──
  const mediaItem = buildItem(finalPath, finalFilename, finalSize, tcExtra);
  await writeLibrary(lib => { lib.unshift(mediaItem); return lib; });
  console.log(`[pipeline] ✓ Added "${resolvedTitle}" to library → ${finalPath}`);

  // ── 9. Mark job done ──
  const doneJob = getPersistedJob(jobId);
  if (doneJob) upsertJob({ ...doneJob, status: 'done', progress: 100, completedAt: new Date().toISOString() });

  // ── 10. Remove torrent from qBittorrent ──
  if (backend === 'qbittorrent' && doneJob?.infoHash) {
    await deleteTorrent(doneJob.infoHash, true).catch(err =>
      console.error(`[pipeline] Failed to remove torrent ${doneJob.infoHash}:`, err));
  }

  // ── 11. Background enrichment + captions ──
  runEnrichmentInBackground(mediaId).catch(() => {});
  runCaptionFetchInBackground(mediaId).catch(() => {});
}
