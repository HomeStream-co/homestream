/**
 * postDownloadPipeline — shared post-download processing
 *
 * Called by EVERY download backend (Real-Debrid, qBittorrent) once a file
 * lands on disk.  Runs the same pipeline that WebTorrent used to run inline:
 *
 *   1. Determine the best category for the content (movies / tv / anime / other)
 *   2. Fetch OMDB metadata
 *   3. Register a transcode job
 *   4. Write the item to the library (transcoding: true)
 *   5. Run FFmpeg transcode
 *   6. Update the library item with final path + size
 *   7. Kick off background enrichment + caption fetch
 *
 * Category logic:
 *   - type === 'series'                       → "TV Shows"
 *   - genre includes "Animation" + "Japan"    → "Anime"  (Nyaa downloads)
 *   - genre includes "Animation"              → "Animation"
 *   - genre includes "Documentary"            → "Documentaries"
 *   - otherwise                               → "Movies"
 *
 * This module has NO knowledge of how the file was obtained — it only cares
 * about what to do with it once it exists on disk.
 */

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { readLibrary, writeLibrary } from './libraryStore.js';
import { createJob } from './transcodeStore.js';
import { transcodeFile } from './transcodeWorker.js';
import { fetchOMDB } from './mediaUtils.js';
import { runEnrichmentInBackground, runCaptionFetchInBackground } from './mediaUtils.js';
import { upsertJob, getPersistedJob } from './downloadJobStore.js';
import { readConfig } from './configStore.js';
import { deleteTorrent } from './qbittorrentClient.js';

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

function moveFile(src: string, dest: string): void {
  if (src === dest) return;
  if (!fs.existsSync(src)) return;
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  try {
    fs.renameSync(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
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

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runPostDownloadPipeline(params: PostDownloadParams): Promise<void> {
  const {
    filePath, title, quality, type, season, episode,
    imdbId, poster, year, jobId, backend,
  } = params;

  if (!fs.existsSync(filePath)) {
    console.error(`[pipeline] File not found: ${filePath}`);
    const existing = getPersistedJob(jobId);
    if (existing) upsertJob({ ...existing, status: 'error' });
    return;
  }

  const mediaId = randomUUID();
  const filename = path.basename(filePath);

  // ── 1. Mark job as transcoding ──
  const existingJob = getPersistedJob(jobId);
  if (existingJob) upsertJob({ ...existingJob, status: 'transcoding' });

  // ── 2. Fetch OMDB metadata ──
  const lookupTitle = type === 'series'
    ? title.replace(/\s+S\d{2}E\d{2}$/i, '').trim()
    : title;
  const omdb = await fetchOMDB(lookupTitle, year);

  const genres: string[] = omdb?.Genre
    ? omdb.Genre.split(',').map((g: string) => g.trim()).filter(Boolean)
    : ['Unknown'];

  const category = resolveCategory(type, genres, title);

  const episodeLabel = type === 'series' && season != null && episode != null
    ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
    : '';

  const fileSize = fs.statSync(filePath).size;

  const cfg = readConfig();
  const targetDir = cfg.libraryDir || path.dirname(filePath);

  // ── DEDUP CHECK: prevent double-entry if pipeline fires twice for same content ──
  const currentLib = readLibrary<{ id: string; imdbId?: string; title?: string; year?: string; transcoding?: boolean }>();
  const resolvedTitle = omdb?.Title || title;
  const resolvedYear = omdb?.Year || year;
  const dup = currentLib.find(m => {
    if (m.transcoding) return false; // never match an in-progress item
    if (imdbId && m.imdbId && m.imdbId === imdbId) return true;
    // fallback: same title + year
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

  if (cfg.autoTranscode === false) {
    // Skip transcoding — move file to targetDir and add to library
    const finalPath = path.join(targetDir, filename);
    try {
      moveFile(filePath, finalPath);
    } catch (moveErr) {
      console.error(`[pipeline] Failed to move file to targetDir:`, moveErr);
    }

    const mediaItem: Record<string, unknown> = {
      id: mediaId,
      filename,
      originalFilename: filename,
      filepath: finalPath,
      filePath: finalPath,
      title: omdb?.Title || title,
      year: omdb?.Year || year || 'Unknown',
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
      fileSize,
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
    };

    await writeLibrary(lib => {
      lib.unshift(mediaItem);
      return lib;
    });

    console.log(`[pipeline] Added "${title}" to library (no transcode, category: ${category})`);

    const doneJob = getPersistedJob(jobId);
    if (doneJob) upsertJob({ ...doneJob, status: 'done', progress: 100, completedAt: new Date().toISOString() });

    // Clean up torrent from qBittorrent
    if (backend === 'qbittorrent' && doneJob?.infoHash) {
      try {
        console.log(`[pipeline] Auto-removing torrent ${doneJob.infoHash} from qBittorrent`);
        await deleteTorrent(doneJob.infoHash, true);
      } catch (err) {
        console.error(`[pipeline] Failed to auto-remove torrent ${doneJob.infoHash} from qBittorrent:`, err);
      }
    }

    runEnrichmentInBackground(mediaId).catch(() => {});
    runCaptionFetchInBackground(mediaId).catch(() => {});
    return;
  }

  const outputFilename = filename.replace(/\.[^.]+$/, '') + '_tc.mp4';
  const outputPath = path.join(targetDir, outputFilename);

  // ── 3. Build initial library item (transcoding: true) ──
  const mediaItem: Record<string, unknown> = {
    id: mediaId,
    filename,
    originalFilename: filename,
    filepath: filePath,
    filePath,
    title: omdb?.Title || title,
    year: omdb?.Year || year || 'Unknown',
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
    fileSize,
    originalSize: fileSize,
    transcoding: true,
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
  };

  // ── 4. Register transcode job + write to library ──
  createJob(mediaId, filename, outputFilename);

  await writeLibrary(lib => {
    lib.unshift(mediaItem);
    return lib;
  });

  console.log(`[pipeline] Added "${title}" to library (category: ${category}, transcoding…)`);

  // ── 5. Transcode ──
  try {
    const result = await transcodeFile(mediaId, filePath, outputPath);
    const finalPath = path.join(targetDir, result.outputFilename);

    if (result.outputFilename === filename) {
      // Reverted to original — move original to targetDir
      console.log(`[pipeline] Reverted to original, moving file to targetDir: ${filePath} -> ${finalPath}`);
      moveFile(filePath, finalPath);
    }

    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
      if (idx !== -1) {
        const item = lib[idx] as Record<string, unknown>;
        item.transcoding = false;
        item.filename = result.outputFilename;
        item.filepath = finalPath;
        item.filePath = finalPath;
        item.fileSize = result.finalSize;
        item.originalSize = result.originalSize;
        item.savedBytes = result.savedBytes;
        item.transcodeStrategy = result.strategy;
      }
      return lib;
    });

    console.log(`[pipeline] ✓ Transcode complete for "${title}" — saved ${Math.round((result.savedBytes ?? 0) / 1e6)} MB`);
  } catch (transcodeErr) {
    console.error(`[pipeline] Transcode failed for "${title}":`, transcodeErr);
    // Keep the item in the library with the original file — still playable
    const finalPath = path.join(targetDir, filename);
    try {
      console.log(`[pipeline] Transcode failed, moving original to targetDir: ${filePath} -> ${finalPath}`);
      moveFile(filePath, finalPath);
    } catch (moveErr) {
      console.error(`[pipeline] Failed to move original file to targetDir after transcode failure:`, moveErr);
    }

    await writeLibrary(lib => {
      const idx = lib.findIndex(m => (m as { id: string }).id === mediaId);
      if (idx !== -1) {
        const item = lib[idx] as Record<string, unknown>;
        item.transcoding = false;
        item.filepath = finalPath;
        item.filePath = finalPath;
      }
      return lib;
    });
  }

  // ── 6. Mark job done ──
  const doneJob = getPersistedJob(jobId);
  if (doneJob) upsertJob({ ...doneJob, status: 'done', progress: 100, completedAt: new Date().toISOString() });

  // ── 7. Clean up torrent from qBittorrent ──
  if (backend === 'qbittorrent' && doneJob?.infoHash) {
    try {
      console.log(`[pipeline] Auto-removing torrent ${doneJob.infoHash} from qBittorrent`);
      await deleteTorrent(doneJob.infoHash, true);
    } catch (err) {
      console.error(`[pipeline] Failed to auto-remove torrent ${doneJob.infoHash} from qBittorrent:`, err);
    }
  }

  // ── 8. Background enrichment + captions ──
  runEnrichmentInBackground(mediaId).catch(() => {});
  runCaptionFetchInBackground(mediaId).catch(() => {});
}
