/**
 * startupMediaSync — runs once after the server is ready.
 *
 * Two jobs:
 *
 * 1. PRE-DOWNLOADED MEDIA SCAN
 *    Walks the configured mediaDir and imports any video files not already in
 *    the library. This handles the case where HomeStream is installed on a
 *    device that already has media on disk (NAS, RAID, external drive, etc.).
 *    Each new file gets OMDB metadata, AI enrichment, and CC auto-fetch.
 *
 * 2. MISSING CAPTIONS BACKFILL
 *    Scans the existing library for items that have no EN or ES caption files
 *    on disk and queues a background CC fetch for each one. This ensures that
 *    items imported before the CC pipeline was in place (or items whose CC
 *    fetch failed previously) eventually get subtitles.
 *
 * Both jobs are fire-and-forget — they never block the server from starting
 * and never throw to the caller.
 */

import fs from 'fs';
import path from 'path';
import { readConfig } from './configStore.js';
import { readLibrary } from './libraryStore.js';
import { scanExistingMedia, importExistingMedia } from './existingMediaScanner.js';
import { runCaptionFetchInBackground } from './mediaUtils.js';
import { captionsDir } from './dataDir.js';

// ── Job 1: pre-downloaded media scan ─────────────────────────────────────────

async function scanPredownloadedMedia(): Promise<void> {
  try {
    const cfg = readConfig();
    if (!cfg.mediaDir) {
      console.log('[startup-sync] No mediaDir configured — skipping pre-download scan');
      return;
    }

    if (!fs.existsSync(cfg.mediaDir)) {
      console.log(`[startup-sync] mediaDir not found on disk: ${cfg.mediaDir} — skipping`);
      return;
    }

    const scanResult = scanExistingMedia(cfg.mediaDir);

    if (scanResult.files.length === 0) {
      console.log(`[startup-sync] Pre-download scan: 0 new files (${scanResult.skipped} already in library)`);
      return;
    }

    console.log(`[startup-sync] Pre-download scan: found ${scanResult.files.length} new file(s) — importing…`);

    const result = await importExistingMedia(scanResult.files, (done, total, title) => {
      console.log(`[startup-sync] Imported ${done}/${total}: "${title}"`);
    });

    console.log(
      `[startup-sync] Pre-download scan complete — imported: ${result.imported}, failed: ${result.failed}`,
    );
  } catch (err) {
    console.error('[startup-sync] Pre-download scan error:', err);
  }
}

// ── Job 2: missing captions backfill ─────────────────────────────────────────

async function backfillMissingCaptions(): Promise<void> {
  try {
    // Wait a bit so the library is fully loaded and the server is warm
    await new Promise(r => setTimeout(r, 5_000));

    const library = readLibrary<{
      id: string;
      title: string;
      transcoding?: boolean;
      transcodeError?: string;
    }>();

    const ccDir = captionsDir();
    const missing: string[] = [];

    for (const item of library) {
      // Skip items still being processed
      if (item.transcoding) continue;
      if (item.transcodeError) continue;

      const itemCaptionDir = path.join(ccDir, item.id);
      const enPath = path.join(itemCaptionDir, 'en.vtt');
      const esPath = path.join(itemCaptionDir, 'es.vtt');

      // Only queue if at least one language is missing entirely
      // (stubs are fine — they mean we already tried and found nothing)
      const enMissing = !fs.existsSync(enPath);
      const esMissing = !fs.existsSync(esPath);

      if (enMissing || esMissing) {
        missing.push(item.id);
      }
    }

    if (missing.length === 0) {
      console.log('[startup-sync] Caption backfill: all items already have CC files');
      return;
    }

    console.log(`[startup-sync] Caption backfill: ${missing.length} item(s) missing EN/ES captions — queuing…`);

    // Stagger fetches so we don't hammer OpenSubtitles on a large library
    for (let i = 0; i < missing.length; i++) {
      const delay = i * 2_500; // 2.5s between each fetch
      setTimeout(() => {
        runCaptionFetchInBackground(missing[i]).catch(() => {});
      }, delay);
    }

    console.log(`[startup-sync] Caption backfill queued — will complete over ~${Math.round((missing.length * 2.5) / 60)} min`);
  } catch (err) {
    console.error('[startup-sync] Caption backfill error:', err);
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Call this once after the HTTP server is listening.
 * Both jobs run in the background — this function returns immediately.
 */
export function runStartupMediaSync(): void {
  // Small delay so the server finishes its own startup logging first
  setTimeout(() => {
    scanPredownloadedMedia().catch(() => {});
    backfillMissingCaptions().catch(() => {});
  }, 2_000);
}
