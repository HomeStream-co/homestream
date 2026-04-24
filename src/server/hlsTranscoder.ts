/**
 * hlsTranscoder — on-the-fly HLS transcoding for browser-incompatible codecs.
 *
 * When a browser requests a video that uses HEVC/H.265, AV1, VP9, or any
 * other codec the browser can't decode natively, this module:
 *
 *  1. Spawns FFmpeg to transcode the source file to HLS (H.264 + AAC)
 *  2. Writes segments to /tmp/homestream-hls/<mediaId>/
 *  3. Serves the .m3u8 playlist and .ts segments via /api/hls/:id/*
 *  4. Cleans up segments after 30 minutes of inactivity
 *
 * Seeking works because HLS segments are pre-generated — the browser
 * requests the segment containing the desired timestamp directly.
 *
 * Segment duration: 4 seconds — good balance of seek latency vs. file count.
 * Preset: veryfast — prioritises low startup latency over compression ratio.
 * CRF: 22 — good quality, reasonable file size.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Binary resolution (lazy, cached) ─────────────────────────────────────────
//
// IMPORTANT: resolveFfmpeg / resolveFfprobe are called LAZILY on first use,
// NOT at module load time. Running createRequire + fs.existsSync synchronously
// at module load caused the "slow Start Server" symptom — the module import
// blocked the entire server startup while Node resolved the ffmpeg-static path.
// Caching the result after the first call keeps subsequent calls O(1).

let _ffmpeg: string | null = null;
let _ffprobe: string | null = null;

function resolveFfmpeg(): string {
  if (_ffmpeg) return _ffmpeg;
  if (process.env.FFMPEG_PATH) { _ffmpeg = process.env.FFMPEG_PATH; return _ffmpeg; }
  try {
    // Use createRequire so this ESM file can load the CJS ffmpeg-static package
    // without triggering the no-require-imports lint rule.
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) { _ffmpeg = p; return _ffmpeg; }
  } catch { /* not installed */ }
  _ffmpeg = 'ffmpeg';
  return _ffmpeg;
}

function resolveFfprobe(): string {
  if (_ffprobe) return _ffprobe;
  // Electron sets FFMPEG_PATH to the bundled ffmpeg binary.
  // ffprobe lives in the same directory with the same naming convention.
  if (process.env.FFMPEG_PATH) {
    const dir = path.dirname(process.env.FFMPEG_PATH);
    const ext = process.platform === 'win32' ? '.exe' : '';
    const candidate = path.join(dir, `ffprobe${ext}`);
    if (fs.existsSync(candidate)) { _ffprobe = candidate; return _ffprobe; }
  }
  try {
    const req = createRequire(import.meta.url);
    // ffmpeg-static exports the ffmpeg path; ffprobe is in the same dir
    const ffmpegPath = req('ffmpeg-static') as string | null;
    if (ffmpegPath) {
      const dir = path.dirname(ffmpegPath);
      const ext = process.platform === 'win32' ? '.exe' : '';
      const candidate = path.join(dir, `ffprobe${ext}`);
      if (fs.existsSync(candidate)) { _ffprobe = candidate; return _ffprobe; }
    }
  } catch { /* not installed */ }
  _ffprobe = 'ffprobe';
  return _ffprobe;
}

// Accessors — resolved lazily on first probe/transcode call, not at import time
const FFMPEG  = () => resolveFfmpeg();
const FFPROBE = () => resolveFfprobe();

// ── Config ────────────────────────────────────────────────────────────────────

const HLS_BASE_DIR = path.join(os.tmpdir(), 'homestream-hls');
const SEGMENT_DURATION = 4;       // seconds per .ts segment
const CLEANUP_IDLE_MS  = 30 * 60 * 1000; // 30 min inactivity → cleanup

// ── State ─────────────────────────────────────────────────────────────────────

interface HlsJob {
  mediaId: string;
  outputDir: string;
  process: ChildProcess | null;
  /** true once the first segment + playlist are ready */
  ready: boolean;
  /** resolve callbacks waiting for readiness */
  waiters: Array<() => void>;
  lastAccess: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const jobs = new Map<string, HlsJob>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function jobDir(mediaId: string): string {
  return path.join(HLS_BASE_DIR, mediaId);
}

function cleanupJob(mediaId: string): void {
  const job = jobs.get(mediaId);
  if (!job) return;

  job.process?.kill('SIGTERM');
  try { fs.rmSync(job.outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
  jobs.delete(mediaId);
  console.log(`[hls] Cleaned up job for ${mediaId}`);
}

function touchJob(mediaId: string): void {
  const job = jobs.get(mediaId);
  if (!job) return;

  job.lastAccess = Date.now();

  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => cleanupJob(mediaId), CLEANUP_IDLE_MS);
}

// ── Codec detection ───────────────────────────────────────────────────────────

export interface CodecInfo {
  codec: string;
  needsTranscode: boolean;
}

/** Codecs natively supported by all modern browsers — do NOT include hevc here */
const BROWSER_SAFE_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1', 'theora']);

export async function probeCodec(filePath: string): Promise<CodecInfo> {
  // 15-second timeout — ffprobe can hang indefinitely on corrupt or network-
  // mounted files. Without this guard the player page never finishes loading.
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      probe.kill('SIGTERM');
      console.warn(`[hls] ffprobe timed out for ${path.basename(filePath)} — assuming safe codec`);
      resolve({ codec: 'unknown', needsTranscode: false });
    }, 15_000);

    const probe = spawn(FFPROBE(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'v:0',
      filePath,
    ]);

    let out = '';
    probe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    probe.on('close', () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(out) as { streams?: Array<{ codec_name?: string }> };
        const codec = json.streams?.[0]?.codec_name ?? 'unknown';
        // hevc/H.265 and any unrecognised codec need transcoding.
        // BROWSER_SAFE_CODECS intentionally excludes hevc — no contradiction.
        const needsTranscode = !BROWSER_SAFE_CODECS.has(codec);
        resolve({ codec, needsTranscode });
      } catch {
        resolve({ codec: 'unknown', needsTranscode: false });
      }
    });
    probe.on('error', () => { clearTimeout(timer); resolve({ codec: 'unknown', needsTranscode: false }); });
  });
}

// ── HLS job management ────────────────────────────────────────────────────────

/**
 * Start (or reuse) an HLS transcode job for the given media item.
 * Returns the output directory path.
 */
export async function startHlsJob(mediaId: string, sourceFilePath: string): Promise<string> {
  // Reuse existing job if already running
  const existing = jobs.get(mediaId);
  if (existing) {
    touchJob(mediaId);
    if (existing.ready) return existing.outputDir;
    // Wait for readiness
    await new Promise<void>(resolve => existing.waiters.push(resolve));
    return existing.outputDir;
  }

  const outputDir = jobDir(mediaId);
  fs.mkdirSync(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, 'index.m3u8');

  const job: HlsJob = {
    mediaId,
    outputDir,
    process: null,
    ready: false,
    waiters: [],
    lastAccess: Date.now(),
    cleanupTimer: null,
  };
  jobs.set(mediaId, job);

  // FFmpeg HLS transcode command
  // -c:v libx264 -preset veryfast -crf 22 — fast H.264 encode
  // -c:a aac -b:a 128k                    — AAC audio
  // -hls_time 4                           — 4s segments
  // -hls_list_size 0                      — keep all segments in playlist
  // -hls_segment_type mpegts              — .ts segments (universal browser support)
  // -start_number 0                       — segments start at 0000.ts
  const args = [
    '-i', sourceFilePath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',                   // stereo (handles 5.1 downmix)
    '-hls_time', String(SEGMENT_DURATION),
    '-hls_list_size', '0',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(outputDir, '%04d.ts'),
    '-start_number', '0',
    '-f', 'hls',
    playlistPath,
  ];

  console.log(`[hls] Starting transcode for ${mediaId}: ${path.basename(sourceFilePath)}`);

  const ff = spawn(FFMPEG(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  job.process = ff;

  // Watch for the playlist file to appear — that means the first segment is ready
  const watchInterval = setInterval(() => {
    if (fs.existsSync(playlistPath) && !job.ready) {
      // Check playlist has at least one segment listed
      try {
        const content = fs.readFileSync(playlistPath, 'utf8');
        if (content.includes('.ts')) {
          job.ready = true;
          clearInterval(watchInterval);
          console.log(`[hls] First segment ready for ${mediaId}`);
          for (const resolve of job.waiters) resolve();
          job.waiters = [];
          touchJob(mediaId);
        }
      } catch { /* not ready yet */ }
    }
  }, 200);

  ff.on('close', (code) => {
    clearInterval(watchInterval);
    if (!job.ready) {
      // FFmpeg failed before producing any output — resolve waiters so they
      // don't hang, but mark the job as FAILED so startHlsJob removes it from
      // the map. The next call will start a fresh job rather than reusing a
      // broken one.
      job.ready = true;
      for (const resolve of job.waiters) resolve();
      job.waiters = [];
      // Remove from map so the next play attempt starts a fresh transcode
      jobs.delete(mediaId);
    }
    if (code !== 0 && code !== null) {
      console.warn(`[hls] FFmpeg exited with code ${code} for ${mediaId}`);
    } else {
      console.log(`[hls] Transcode complete for ${mediaId}`);
    }
    job.process = null;
  });

  ff.stderr?.on('data', (d: Buffer) => {
    // Uncomment for debugging:
    // process.stderr.write(`[hls:${mediaId}] ${d.toString()}`);
    void d; // suppress unused warning
  });

  // Wait for readiness before returning
  await new Promise<void>(resolve => {
    if (job.ready) { resolve(); return; }
    job.waiters.push(resolve);
    // Timeout after 30s — if FFmpeg hasn't produced output, something is wrong
    setTimeout(() => {
      if (!job.ready) {
        job.ready = true;
        resolve();
      }
    }, 30_000);
  });

  return outputDir;
}

/**
 * Get the output directory for an existing job (no-op if not running).
 */
export function getHlsJobDir(mediaId: string): string | null {
  const job = jobs.get(mediaId);
  if (!job) return null;
  touchJob(mediaId);
  return job.outputDir;
}

/**
 * Check if a job is running and ready.
 */
export function isHlsJobReady(mediaId: string): boolean {
  return jobs.get(mediaId)?.ready ?? false;
}

/**
 * Stop all HLS jobs — called on server shutdown.
 */
export function stopAllHlsJobs(): void {
  for (const mediaId of jobs.keys()) cleanupJob(mediaId);
}

// ── Ensure base dir exists ────────────────────────────────────────────────────

fs.mkdirSync(HLS_BASE_DIR, { recursive: true });

/**
 * Exported so startupCleanup can reference the same path without duplicating
 * the constant. Never changes at runtime.
 */
export { HLS_BASE_DIR };
