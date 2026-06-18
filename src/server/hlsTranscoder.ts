/**
 * hlsTranscoder — on-the-fly HLS transcoding for browser-incompatible codecs.
 *
 * When a browser requests a video that uses HEVC/H.265, AV1, VP9, or any
 * other codec the browser can't decode natively, this module:
 *
 *  1. Spawns FFmpeg to transcode the source file to HLS (H.264 + AAC)
 *  2. Writes segments to os.tmpdir()/homestream-hls/<mediaId>/
 *  3. Serves the .m3u8 playlist and .ts segments via /api/hls/:id/*
 *  4. Cleans up segments after 30 minutes of inactivity
 *
 * Seeking works because HLS segments are pre-generated — the browser
 * requests the segment containing the desired timestamp directly.
 *
 * Segment duration: 6 seconds — good balance of seek latency vs. file count.
 * Preset: ultrafast — prioritises low startup latency over compression ratio.
 * CRF: 23 — good quality, reasonable file size.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectHwEncoder } from './hwEncoderDetect.js';
import { logCrash } from './crashLogger.js';

// ── Binary resolution (lazy, cached) ─────────────────────────────────────────
let _ffmpeg: string | null = null;
let _ffprobe: string | null = null;

function resolveFfmpeg(): string {
  if (_ffmpeg) return _ffmpeg;
  if (process.env.FFMPEG_PATH) { _ffmpeg = process.env.FFMPEG_PATH; return _ffmpeg; }
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) { _ffmpeg = p; return _ffmpeg; }
  } catch { /* not installed */ }
  _ffmpeg = 'ffmpeg';
  return _ffmpeg;
}

function resolveFfprobe(): string {
  if (_ffprobe) return _ffprobe;
  if (process.env.FFMPEG_PATH) {
    const dir = path.dirname(process.env.FFMPEG_PATH);
    const ext = process.platform === 'win32' ? '.exe' : '';
    const platform = process.platform;
    const arch = process.arch;
    const candidate2 = path.join(dir, '..', 'ffprobe-bin', platform, arch, `ffprobe${ext}`);
    if (fs.existsSync(candidate2)) { _ffprobe = candidate2; return _ffprobe; }
    const candidate = path.join(dir, `ffprobe${ext}`);
    if (fs.existsSync(candidate)) { _ffprobe = candidate; return _ffprobe; }
  }
  try {
    const req = createRequire(import.meta.url);
    const ffprobeStatic = req('ffprobe-static') as { path: string } | null;
    if (ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)) {
      _ffprobe = ffprobeStatic.path;
      return _ffprobe;
    }
  } catch { /* not installed */ }
  try {
    const req = createRequire(import.meta.url);
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

const FFMPEG  = () => resolveFfmpeg();
const FFPROBE = () => resolveFfprobe();

// ── Config ────────────────────────────────────────────────────────────────────

const HLS_BASE_DIR = path.join(os.tmpdir(), 'homestream-hls');
const SEGMENT_DURATION = 6;       // seconds per .ts segment
const CLEANUP_IDLE_MS  = 30 * 60 * 1000; // 30 min inactivity → cleanup

// ── State ─────────────────────────────────────────────────────────────────────

interface HlsJob {
  mediaId: string;
  outputDir: string;
  process: ChildProcess | null;
  ready: boolean;
  waiters: Array<() => void>;
  lastAccess: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  encoderLabel: string;
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

const BROWSER_SAFE_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1', 'theora']);

export async function probeCodec(filePath: string): Promise<CodecInfo> {
  const ffprobeResult = await new Promise<CodecInfo | null>(resolve => {
    const timer = setTimeout(() => {
      probe.kill('SIGTERM');
      console.warn(`[hls] ffprobe timed out for ${path.basename(filePath)}`);
      resolve(null);
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
    probe.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { resolve(null); return; }
      try {
        const json = JSON.parse(out) as { streams?: Array<{ codec_name?: string }> };
        const codec = json.streams?.[0]?.codec_name ?? 'unknown';
        const needsTranscode = !BROWSER_SAFE_CODECS.has(codec);
        resolve({ codec, needsTranscode });
      } catch {
        resolve(null);
      }
    });
    probe.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

  if (ffprobeResult && ffprobeResult.codec !== 'unknown') {
    return ffprobeResult;
  }

  console.log(`[hls] ffprobe failed for ${path.basename(filePath)} — trying ffmpeg fallback`);
  return new Promise(resolve => {
    const proc = spawn(FFMPEG(), ['-i', filePath]);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      const videoStreamMatch = stderr.match(/Stream #\d+:\d+.*Video:\s*([a-zA-Z0-9_-]+)/);
      const codec = videoStreamMatch ? videoStreamMatch[1].toLowerCase() : 'unknown';
      const needsTranscode = !BROWSER_SAFE_CODECS.has(codec);
      resolve({ codec, needsTranscode });
    });

    proc.on('error', () => {
      resolve({ codec: 'unknown', needsTranscode: true });
    });
  });
}

// ── HW Video Args Builder ─────────────────────────────────────────────────────

export function buildHwVideoArgs(encoder: string): string[] {
  switch (encoder) {
    case 'h264_vaapi':
      return ['-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-qp', '22'];
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23'];
    case 'h264_videotoolbox':
      return ['-c:v', 'h264_videotoolbox', '-q:v', '65'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-global_quality', '23', '-preset', 'medium'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-qp_i', '22', '-qp_p', '22'];
    default:
      return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '4', '-vf', "scale=w='min(1920,iw)':h=-2"];
  }
}

// ── HLS job management ────────────────────────────────────────────────────────

export async function startHlsJob(mediaId: string, sourceFilePath: string): Promise<string> {
  const existing = jobs.get(mediaId);
  if (existing) {
    touchJob(mediaId);
    if (existing.ready) return existing.outputDir;
    await new Promise<void>(resolve => existing.waiters.push(resolve));
    return existing.outputDir;
  }

  const outputDir = jobDir(mediaId);
  fs.mkdirSync(outputDir, { recursive: true });

  const job: HlsJob = {
    mediaId,
    outputDir,
    process: null,
    ready: false,
    waiters: [],
    lastAccess: Date.now(),
    cleanupTimer: null,
    encoderLabel: 'Software (libx264)',
  };
  jobs.set(mediaId, job);
  const hw = await detectHwEncoder();
  console.log(`[hls] Hardware detection results: ${JSON.stringify(hw)}`);

  // DEBUG MODE: Temporarily force software transcode to isolate HW encoder issues
  let success = await runTranscode(job, sourceFilePath, false);

  if (success) {
    touchJob(mediaId);
  } else {
    // If failed, delete the job from the map so the next play attempt can start fresh
    jobs.delete(mediaId);
    // Unblock any waiters with failure (they will try direct stream or show error)
    job.waiters.forEach(r => r());
    job.waiters = [];
  }

  return outputDir;
}

async function runTranscode(job: HlsJob, sourceFilePath: string, useHw: boolean): Promise<boolean> {
  const outputDir = job.outputDir;
  const playlistPath = path.join(outputDir, 'index.m3u8');

  const videoArgs = [
    '-c:v', 'libx264',
    '-preset', 'ultrafast',        // Force ultrafast for low CPU usage & speed
    '-crf', '23',
    '-threads', '4',               // Cap CPU usage
    '-vf', "scale=w='min(1920,iw)':h=-2" // Cap resolution to 1080p max to prevent 4K CPU chokes
  ];

  job.encoderLabel = 'Software (libx264) - Debug Mode';

  const args = [
    '-loglevel', 'verbose',           // Verbose logs for troubleshooting
    '-y',
    '-i', sourceFilePath,
    '-map', '0:v:0',                 // Map first video track only
    '-map', '0:a:0',                 // Map first audio track only
    '-sn',                           // Disable subtitle stream mapping in HLS container (fixes crash on custom subs)
    '-dn',                           // Disable data stream mapping (fixes DV metadata crash)
    '-pix_fmt', 'yuv420p',           // Force 8-bit output color format compatibility
    ...videoArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-hls_time', String(SEGMENT_DURATION),
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(outputDir, 'segment_%05d.ts'),
    '-start_number', '0',
    '-f', 'hls',
    playlistPath,
  ];

  console.log(`[hls] 🚀 DEBUG MODE - Starting software transcode for ${job.mediaId}`);
  console.log(`[hls] Command: ffmpeg ${args.join(' ')}`);

  const ff = spawn(FFMPEG(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  job.process = ff;

  const stderrBuffer: string[] = [];

  ff.stderr.on('data', (data: Buffer) => {
    const log = data.toString().trim();
    if (log) {
      console.log(`[hls][${job.mediaId}] ${log}`);
      stderrBuffer.push(log);
      if (stderrBuffer.length > 50) {
        stderrBuffer.shift();
      }
    }
  });

  let checkInterval: ReturnType<typeof setInterval>;
  let timeoutTimer: ReturnType<typeof setTimeout>;

  return new Promise<boolean>(resolve => {
    let resolved = false;

    const doResolve = (val: boolean) => {
      if (resolved) return;
      resolved = true;
      clearInterval(checkInterval);
      clearTimeout(timeoutTimer);
      if (!val) {
        console.error(`[hls] ❌ FAILED to generate manifest for ${job.mediaId}`);
        const logContent = stderrBuffer.join('\n');
        logCrash(
          'manual',
          new Error(`FFmpeg exited or timed out without HLS manifest.\nEncoder: ${job.encoderLabel}\nLast logs:\n${logContent}`),
          `HLS Transcode: ${job.mediaId}`
        );
        // Kill the process if we are resolving with failure (e.g. timeout) to release lock on output files
        try { ff.kill('SIGKILL'); } catch {}
      }
      resolve(val);
    };

    checkInterval = setInterval(() => {
      if (fs.existsSync(playlistPath) && !job.ready) {
        try {
          const content = fs.readFileSync(playlistPath, 'utf8');
          if (content.includes('.ts')) {
            job.ready = true;
            console.log(`[hls] ✅ SUCCESS: Manifest ready for ${job.mediaId}`);
            
            // Unblock any waiters on the job object
            job.waiters.forEach(r => r());
            job.waiters = [];
            
            doResolve(true);
          }
        } catch (e) {}
      }
    }, 500);

    ff.on('close', (code) => {
      clearInterval(checkInterval);
      console.log(`[hls] FFmpeg exited with code ${code} for ${job.mediaId}`);
      doResolve(job.ready || code === 0);
    });

    timeoutTimer = setTimeout(() => {
      if (!job.ready) {
        console.error(`[hls] Timeout waiting for manifest: ${job.mediaId}`);
        doResolve(false);
      }
    }, 35000);
  });
}

export function getHlsJobDir(mediaId: string): string | null {
  const job = jobs.get(mediaId);
  if (!job) return null;
  touchJob(mediaId);
  return job.outputDir;
}

export function getHlsEncoderLabel(mediaId: string): string | null {
  return jobs.get(mediaId)?.encoderLabel ?? null;
}

export function isHlsJobReady(mediaId: string): boolean {
  return jobs.get(mediaId)?.ready ?? false;
}

export function stopAllHlsJobs(): void {
  for (const mediaId of jobs.keys()) cleanupJob(mediaId);
}

fs.mkdirSync(HLS_BASE_DIR, { recursive: true });

export { HLS_BASE_DIR };
