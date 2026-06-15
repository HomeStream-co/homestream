/**
 * FFmpeg transcode worker — Smart Storage-Saving Edition
 *
 * Strategy mirrors what HandBrake does with "RF" (Constant Rate Factor) mode:
 * instead of targeting a fixed bitrate (which wastes space on simple scenes),
 * CRF lets the encoder use exactly as many bits as the content needs.
 *
 * Decision tree (runs before every encode):
 *
 *  1. SKIP  — already H.264 MP4 AND file is already small (< 8 MB/min).
 *             Just remux (+faststart). Fastest path, no quality loss.
 *
 *  2. REMUX — already H.264 but in a non-MP4 container (MKV, AVI, etc.)
 *             OR H.264 MP4 that is large (high-bitrate source).
 *             Copy video stream, re-encode audio to AAC, add faststart.
 *             Near-instant, no quality loss.
 *
 *  3. ENCODE_H264 — any other codec (HEVC, AV1, VP9, MPEG-2, etc.)
 *             Re-encode to H.264 with CRF targeting:
 *               • SD  (≤ 720p)  → CRF 22  (HandBrake RF 22 equivalent)
 *               • HD  (≤ 1080p) → CRF 20  (HandBrake RF 20 equivalent)
 *               • UHD (4K+)     → CRF 18  (HandBrake RF 18 equivalent)
 *             Preset: "medium" — better compression than "fast" at the cost
 *             of ~2× encode time. Still very fast on modern CPUs.
 *
 *  4. POST-ENCODE SIZE CHECK — if the output is larger than the input
 *     (can happen with already-well-compressed sources), discard the output
 *     and keep the original. Never make files bigger.
 *
 * Returns a TranscodeResult with before/after sizes so the UI can show
 * a "Saved X MB" badge on the library card.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { updateJob, broadcast, getJob } from './transcodeStore.js';
import { dataDir } from './dataDir.js';
import { detectHwEncoder } from './hwEncoderDetect.js';
import { readConfig } from './configStore.js';

const activeTranscodes = new Map<string, any>();

export function killTranscode(mediaId: string): boolean {
  const proc = activeTranscodes.get(mediaId);
  if (proc) {
    console.log(`[transcode] Killing transcode process for mediaId=${mediaId}`);
    try {
      proc.kill('SIGKILL');
    } catch (err) {
      console.error(`[transcode] Failed to kill transcode process:`, err);
    }
    activeTranscodes.delete(mediaId);
    return true;
  }
  return false;
}

// Uploads live inside the data directory so they are writable in packaged
// Electron on Linux (AppImage mounts read-only; process.cwd() is not writable).
const UPLOADS_DIR = path.join(dataDir(), 'uploads');

// Resolve FFmpeg binary: prefer FFMPEG_PATH env var (set by Electron when
// bundling ffmpeg-static), then try ffmpeg-static directly, then fall back
// to a system 'ffmpeg' on PATH.
function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) return p;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

// Resolve ffprobe binary: same directory as ffmpeg.
function resolveFfprobe(): string {
  if (process.env.FFMPEG_PATH) {
    const dir = path.dirname(process.env.FFMPEG_PATH);
    const ext = process.platform === 'win32' ? '.exe' : '';
    const platform = process.platform;
    const arch = process.arch;
    // Check local package directory layout first
    const candidate2 = path.join(dir, '..', 'ffprobe-bin', platform, arch, `ffprobe${ext}`);
    if (fs.existsSync(candidate2)) return candidate2;
    // Fallback to same folder
    const candidate = path.join(dir, `ffprobe${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  // Try loading ffprobe-static first
  try {
    const req = createRequire(import.meta.url);
    const ffprobeStatic = req('ffprobe-static') as { path: string } | null;
    if (ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)) {
      return ffprobeStatic.path;
    }
  } catch { /* not installed */ }
  // Legacy fallback (same folder as ffmpeg-static)
  try {
    const req = createRequire(import.meta.url);
    const ffmpegPath = req('ffmpeg-static') as string | null;
    if (ffmpegPath) {
      const dir = path.dirname(ffmpegPath);
      const ext = process.platform === 'win32' ? '.exe' : '';
      const candidate = path.join(dir, `ffprobe${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* not installed */ }
  return 'ffprobe';
}

const FFMPEG = resolveFfmpeg();
const FFPROBE = resolveFfprobe();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscodeResult {
  /** Final filename that should be served (may be input if encode was skipped/reverted) */
  outputFilename: string;
  /** Original file size in bytes */
  originalSize: number;
  /** Final file size in bytes */
  finalSize: number;
  /** Bytes saved (negative = output was larger, reverted to original) */
  savedBytes: number;
  /** Human-readable strategy that was used */
  strategy: 'remux' | 'encode_h264' | 'skipped';
}

interface VideoInfo {
  codec: string;          // e.g. 'h264', 'hevc', 'av1', 'vp9', 'mpeg2video'
  width: number;
  height: number;
  bitrateBps: number;     // video stream bitrate in bits/sec (0 = unknown)
  audioStreams: number;
  durationSecs: number;
  fileSizeBytes: number;
}

type EncodeStrategy = 'remux' | 'encode_h264' | 'skip_remux_only';

// ─── ffprobe helpers ──────────────────────────────────────────────────────────

/**
 * Single ffprobe call that returns everything we need to make a strategy decision.
 */
async function probeFile(filePath: string): Promise<VideoInfo> {
  const ffprobeResult = await new Promise<VideoInfo | null>(resolve => {
    const probe = spawn(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const timer = setTimeout(() => {
      console.log(`[transcode] ffprobe timed out for ${filePath}`);
      try {
        probe.kill('SIGKILL');
      } catch {}
      resolve(null);
    }, 15000);

    let out = '';
    probe.stdout.on('data', (d: Buffer) => { out += d.toString(); });

    probe.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { resolve(null); return; }
      try {
        const json = JSON.parse(out) as {
          format?: { duration?: string; bit_rate?: string; size?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
            bit_rate?: string;
          }>;
        };

        const videoStream = json.streams?.find(s => s.codec_type === 'video');
        const audioStreams = json.streams?.filter(s => s.codec_type === 'audio').length ?? 0;

        resolve({
          codec: videoStream?.codec_name ?? 'unknown',
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          bitrateBps: parseInt(videoStream?.bit_rate ?? json.format?.bit_rate ?? '0', 10) || 0,
          audioStreams,
          durationSecs: parseFloat(json.format?.duration ?? '0') || 0,
          fileSizeBytes: parseInt(json.format?.size ?? '0', 10) || 0,
        });
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

  // Fallback to ffmpeg -i parsing if ffprobe is missing or fails
  console.log(`[transcode] ffprobe failed for ${path.basename(filePath)} — trying ffmpeg fallback`);
  return new Promise(resolve => {
    const proc = spawn(FFMPEG, ['-nostdin', '-i', filePath]);

    const timer = setTimeout(() => {
      console.log(`[transcode] fallback ffmpeg timed out for ${filePath}`);
      try {
        proc.kill('SIGKILL');
      } catch {}
      resolve({ codec: 'unknown', width: 0, height: 0, bitrateBps: 0, audioStreams: 0, durationSecs: 0, fileSizeBytes: 0 });
    }, 15000);

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      clearTimeout(timer);
      const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      let durationSecs = 0;
      if (durationMatch) {
        durationSecs = parseInt(durationMatch[1], 10) * 3600
          + parseInt(durationMatch[2], 10) * 60
          + parseInt(durationMatch[3], 10)
          + parseFloat(`0.${durationMatch[4]}`);
      }

      const videoStreamMatch = stderr.match(/Stream #\d+:\d+.*Video:\s*([a-zA-Z0-9_-]+)/);
      const codec = videoStreamMatch ? videoStreamMatch[1].toLowerCase() : 'unknown';

      let width = 0, height = 0;
      const resMatch = stderr.match(/Stream #\d+:\d+.*Video:.*?\s*(\d{3,5})x(\d{3,5})/);
      if (resMatch) {
        width = parseInt(resMatch[1], 10);
        height = parseInt(resMatch[2], 10);
      }

      const audioMatches = stderr.match(/Stream #\d+:\d+.*Audio:/g);
      const audioStreams = audioMatches ? audioMatches.length : 0;

      let fileSizeBytes = 0;
      try { fileSizeBytes = fs.statSync(filePath).size; } catch { /* ignore */ }

      resolve({
        codec,
        width,
        height,
        bitrateBps: 0,
        audioStreams,
        durationSecs,
        fileSizeBytes,
      });
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ codec: 'unknown', width: 0, height: 0, bitrateBps: 0, audioStreams: 0, durationSecs: 0, fileSizeBytes: 0 });
    });
  });
}

// ─── Strategy engine ──────────────────────────────────────────────────────────

/**
 * Decide what to do with this file.
 *
 * "skip_remux_only" = already H.264 MP4, already efficient — just add faststart.
 * "remux"           = already H.264 but wrong container or high-bitrate MP4.
 * "encode_h264"     = needs full re-encode (HEVC, AV1, VP9, MPEG-2, etc.)
 */
function transcodeStrategy(info: VideoInfo, inputFilename: string): EncodeStrategy {
  const isH264 = info.codec === 'h264';
  const isMp4Container = inputFilename.toLowerCase().endsWith('.mp4');

  if (!isH264) return 'encode_h264';

  // H.264 in a non-MP4 container → remux (copy video, re-encode audio, add faststart)
  if (!isMp4Container) return 'remux';

  // H.264 MP4 — check if it's already efficient
  // "Efficient" = bitrate under ~8 Mbps for HD or file is small relative to duration
  // If bitrate is unknown (0), fall back to remux to be safe (adds faststart at minimum)
  const mbps = info.bitrateBps / 1_000_000;
  const isAlreadyEfficient = mbps > 0 && mbps < 8;

  return isAlreadyEfficient ? 'skip_remux_only' : 'remux';
}

/**
 * Pick CRF value based on resolution, adjusted by quality preset.
 * Lower CRF = better quality + larger file.
 * These values mirror HandBrake's default RF presets.
 *
 * Preset offsets:
 *   fast      → +4  (smaller files, slightly softer)
 *   balanced  → ±0  (default)
 *   quality   → -3  (larger files, sharper)
 *   lossless  → 0   (CRF 0 = mathematically lossless for libx264)
 */
function crfForResolution(height: number, preset: string = 'balanced'): number {
  let base: number;
  if (height <= 480)  base = 23;
  else if (height <= 720)  base = 22;
  else if (height <= 1080) base = 20;
  else base = 18;

  if (preset === 'lossless') return 0;
  if (preset === 'fast')    return Math.min(51, base + 4);
  if (preset === 'quality') return Math.max(0, base - 3);
  return base; // balanced
}

// ─── Progress parser ──────────────────────────────────────────────────────────

function parseProgress(line: string, durationSecs: number): {
  progress: number; fps: number; speed: string; eta: number;
} | null {
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  const fpsMatch  = line.match(/fps=\s*([\d.]+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+x)/);

  if (!timeMatch) return null;

  const currentSecs = parseInt(timeMatch[1]) * 3600
    + parseInt(timeMatch[2]) * 60
    + parseInt(timeMatch[3]);

  const progress = durationSecs > 0
    ? Math.min(99, Math.round((currentSecs / durationSecs) * 100))
    : 0;

  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
  const speed = speedMatch ? speedMatch[1] : '?x';
  const speedNum = parseFloat(speed) || 1;
  const eta = durationSecs > 0 ? Math.round((durationSecs - currentSecs) / speedNum) : 0;

  return { progress, fps, speed, eta };
}

// ─── FFmpeg runner ────────────────────────────────────────────────────────────

function runFFmpeg(args: string[], mediaId: string, durationSecs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finalArgs = args.includes('-nostdin') ? args : ['-nostdin', ...args];
    const ff = spawn(FFMPEG, finalArgs);
    activeTranscodes.set(mediaId, ff);
    let stderrBuf = '';

    ff.stderr.on('data', (data: Buffer) => {
      stderrBuf += data.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseProgress(line, durationSecs);
        if (parsed) {
          updateJob(mediaId, {
            progress: parsed.progress,
            fps: parsed.fps,
            speed: parsed.speed,
            eta: parsed.eta,
          });
          broadcast(mediaId, getJob(mediaId)!);
        }
      }
    });

    ff.on('close', code => {
      activeTranscodes.delete(mediaId);
      if (code === 0) { resolve(); }
      else { reject(new Error(`FFmpeg exited with code ${code}`)); }
    });

    ff.on('error', err => {
      activeTranscodes.delete(mediaId);
      const msg = err.message.includes('ENOENT')
        ? `FFmpeg not found at "${FFMPEG}". The bundled ffmpeg-static binary may be missing — try reinstalling HomeStream.`
        : err.message;
      reject(new Error(msg));
    });
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Transcode a video file to H.264 MP4.
 *
 * @param mediaId       Library item ID (for progress tracking)
 * @param inputPath     ABSOLUTE path to the source file
 * @param outputPath    ABSOLUTE path for the transcoded output
 */
export async function transcodeFile(
  mediaId: string,
  inputPath: string,
  outputPath: string,
): Promise<TranscodeResult> {
  // Resolve to absolute paths — support both absolute and uploads-relative inputs
  const resolvedInput  = path.isAbsolute(inputPath)  ? inputPath  : path.join(UPLOADS_DIR, inputPath);
  const resolvedOutput = path.isAbsolute(outputPath) ? outputPath : path.join(UPLOADS_DIR, outputPath);

  updateJob(mediaId, { status: 'transcoding', startedAt: Date.now() });
  broadcast(mediaId, getJob(mediaId)!);

  // ── 1. Probe the input file ──────────────────────────────────────────────
  const info = await probeFile(resolvedInput);
  const originalSize = info.fileSizeBytes || (() => {
    try { return fs.statSync(resolvedInput).size; } catch { return 0; }
  })();

  // ── 2. Decide strategy ───────────────────────────────────────────────────
  const strategy = transcodeStrategy(info, path.basename(resolvedInput));

  // ── 3. Detect hardware encoder (cached) ─────────────────────────────────
  const hw = await detectHwEncoder();
  const encoderLabel = hw.label;
  updateJob(mediaId, { encoderLabel });
  broadcast(mediaId, getJob(mediaId)!);

  console.log(
    `[transcode] ${path.basename(resolvedInput)} → strategy=${strategy} ` +
    `codec=${info.codec} res=${info.width}x${info.height} ` +
    `bitrate=${(info.bitrateBps / 1_000_000).toFixed(1)}Mbps ` +
    `size=${(originalSize / 1_048_576).toFixed(1)}MB ` +
    `encoder=${encoderLabel}`
  );

  // ── 4. Audio args (shared across all paths) ──────────────────────────────
  const audioArgs: string[] = info.audioStreams > 0
    ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']
    : ['-an'];

  // ── 5. Build FFmpeg args based on strategy ───────────────────────────────
  let ffmpegArgs: string[];

  if (strategy === 'skip_remux_only' || strategy === 'remux') {
    // Copy video stream — just fix container and audio codec
    ffmpegArgs = [
      '-i', resolvedInput,
      '-c:v', 'copy',
      ...audioArgs,
      '-movflags', '+faststart',
      '-y',
      resolvedOutput,
    ];
  } else {
    // Full re-encode — use hardware encoder if available, else libx264
    const transcodePreset = readConfig().transcodePreset ?? 'balanced';
    const crf = crfForResolution(info.height, transcodePreset);

    if (hw.encoder === 'h264_nvenc') {
      console.log(`[transcode] Using NVENC hardware encode for ${info.height}p`);
      ffmpegArgs = [
        '-i', resolvedInput,
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-cq', String(crf),
        '-profile:v', 'high',
        '-pix_fmt', 'yuv420p',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    } else if (hw.encoder === 'h264_vaapi') {
      console.log(`[transcode] Using VAAPI hardware encode for ${info.height}p`);
      ffmpegArgs = [
        '-vaapi_device', '/dev/dri/renderD128',
        '-i', resolvedInput,
        '-vf', 'format=nv12,hwupload',
        '-c:v', 'h264_vaapi',
        '-qp', String(crf),
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    } else if (hw.encoder === 'h264_videotoolbox') {
      console.log(`[transcode] Using VideoToolbox hardware encode for ${info.height}p`);
      ffmpegArgs = [
        '-i', resolvedInput,
        '-c:v', 'h264_videotoolbox',
        '-q:v', String(Math.max(20, 100 - crf * 3)),
        '-profile:v', 'high',
        '-pix_fmt', 'yuv420p',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    } else if (hw.encoder === 'h264_qsv') {
      console.log(`[transcode] Using QSV hardware encode for ${info.height}p`);
      ffmpegArgs = [
        '-i', resolvedInput,
        '-c:v', 'h264_qsv',
        '-global_quality', String(crf),
        '-preset', 'medium',
        '-pix_fmt', 'yuv420p',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    } else if (hw.encoder === 'h264_amf') {
      console.log(`[transcode] Using AMF hardware encode for ${info.height}p`);
      ffmpegArgs = [
        '-i', resolvedInput,
        '-c:v', 'h264_amf',
        '-quality', 'balanced',
        '-qp_i', String(crf),
        '-qp_p', String(crf),
        '-pix_fmt', 'yuv420p',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    } else {
      // Software libx264 fallback
      console.log(`[transcode] Using software libx264 CRF=${crf} for ${info.height}p`);
      ffmpegArgs = [
        '-i', resolvedInput,
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', 'medium',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        resolvedOutput,
      ];
    }
  }

  // ── 5. Run FFmpeg ────────────────────────────────────────────────────────
  try {
    await runFFmpeg(ffmpegArgs, mediaId, info.durationSecs);
  } catch (err) {
    updateJob(mediaId, { status: 'error', error: (err as Error).message });
    broadcast(mediaId, getJob(mediaId)!);
    throw err;
  }

  // ── 6. Post-encode size check ────────────────────────────────────────────
  // If the output is larger than the input (can happen with already-compressed
  // sources), discard the output and keep the original. Never make files bigger.
  const outputSize = fs.existsSync(resolvedOutput) ? fs.statSync(resolvedOutput).size : 0;
  const savedBytes = originalSize - outputSize;
  const outputIsLarger = outputSize > 0 && outputSize >= originalSize;

  let finalFilename = path.basename(resolvedOutput);
  let finalSize = outputSize;

  if (outputIsLarger) {
    console.log(
      `[transcode] Output (${(outputSize / 1_048_576).toFixed(1)}MB) ≥ input ` +
      `(${(originalSize / 1_048_576).toFixed(1)}MB) — reverting to original`
    );
    // Delete the larger output, keep original
    try { fs.unlinkSync(resolvedOutput); } catch { /* ignore */ }
    finalFilename = path.basename(resolvedInput);
    finalSize = originalSize;
  } else {
    // Output is smaller — delete original to free space (only if different file)
    if (resolvedInput !== resolvedOutput && fs.existsSync(resolvedInput)) {
      try { fs.unlinkSync(resolvedInput); } catch { /* ignore */ }
    }
    const pct = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;
    console.log(
      `[transcode] Done. ${(originalSize / 1_048_576).toFixed(1)}MB → ` +
      `${(outputSize / 1_048_576).toFixed(1)}MB (saved ${pct}%)`
    );
  }

  updateJob(mediaId, { status: 'done', progress: 100, finishedAt: Date.now() });
  broadcast(mediaId, getJob(mediaId)!);

  return {
    outputFilename: finalFilename,
    originalSize,
    finalSize,
    savedBytes: outputIsLarger ? 0 : savedBytes,
    strategy: strategy === 'skip_remux_only' ? 'remux' : strategy,
  };
}
