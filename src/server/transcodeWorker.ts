/**
 * FFmpeg transcode worker.
 * Converts any video to H.264/AAC MP4 with +faststart for zero-latency seeking.
 * Parses FFmpeg stderr progress lines and broadcasts to SSE subscribers.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { updateJob, broadcast, getJob } from './transcodeStore.js';

const UPLOADS_DIR = path.resolve('./uploads');

/**
 * Parse FFmpeg progress line:
 * frame=  120 fps= 24 q=28.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.2x
 */
function parseProgress(line: string, durationSecs: number): {
  progress: number;
  fps: number;
  speed: string;
  eta: number;
} | null {
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+x)/);

  if (!timeMatch) return null;

  const h = parseInt(timeMatch[1]);
  const m = parseInt(timeMatch[2]);
  const s = parseInt(timeMatch[3]);
  const currentSecs = h * 3600 + m * 60 + s;

  const progress = durationSecs > 0
    ? Math.min(99, Math.round((currentSecs / durationSecs) * 100))
    : 0;

  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
  const speed = speedMatch ? speedMatch[1] : '?x';
  const speedNum = parseFloat(speed) || 1;
  const remaining = durationSecs > 0
    ? Math.round((durationSecs - currentSecs) / speedNum)
    : 0;

  return { progress, fps, speed, eta: remaining };
}

/**
 * Get video duration in seconds using ffprobe.
 */
async function getDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    const probe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ]);
    let out = '';
    probe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    probe.on('close', () => {
      try {
        const json = JSON.parse(out);
        resolve(parseFloat(json.format?.duration || '0'));
      } catch {
        resolve(0);
      }
    });
    probe.on('error', () => resolve(0));
  });
}

/**
 * Check if a file is already browser-compatible H.264 MP4.
 * If so, we skip transcoding (just copy + faststart remux, which is near-instant).
 */
async function getVideoCodec(filePath: string): Promise<string> {
  return new Promise(resolve => {
    const probe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'v:0',
      filePath,
    ]);
    let out = '';
    probe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    probe.on('close', () => {
      try {
        const json = JSON.parse(out);
        resolve(json.streams?.[0]?.codec_name || 'unknown');
      } catch {
        resolve('unknown');
      }
    });
    probe.on('error', () => resolve('unknown'));
  });
}

/**
 * Check how many audio streams a file has.
 * Returns 0 if none — we must omit -c:a args entirely or FFmpeg errors.
 */
async function getAudioStreamCount(filePath: string): Promise<number> {
  return new Promise(resolve => {
    const probe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a',
      filePath,
    ]);
    let out = '';
    probe.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    probe.on('close', () => {
      try {
        const json = JSON.parse(out);
        resolve((json.streams as unknown[])?.length ?? 0);
      } catch {
        resolve(0);
      }
    });
    probe.on('error', () => resolve(0));
  });
}

export async function transcodeFile(
  mediaId: string,
  inputFilename: string,
  outputFilename: string,
): Promise<void> {
  const inputPath = path.join(UPLOADS_DIR, inputFilename);
  const outputPath = path.join(UPLOADS_DIR, outputFilename);

  updateJob(mediaId, { status: 'transcoding', startedAt: Date.now() });
  broadcast(mediaId, getJob(mediaId)!);

  // Get duration for progress calculation
  const duration = await getDuration(inputPath);

  // Check if already H.264 — if so, do a fast remux instead of full re-encode
  const codec = await getVideoCodec(inputPath);
  const isH264 = codec === 'h264';

  // Check for audio streams — files with no audio need different FFmpeg args
  // (passing -c:a aac on a file with no audio causes FFmpeg to error out)
  const audioStreams = await getAudioStreamCount(inputPath);
  const hasAudio = audioStreams > 0;

  // Audio args — omit entirely if no audio track present
  const audioArgs: string[] = hasAudio
    ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']
    : ['-an']; // -an = no audio output (avoids "no audio stream" error)

  const ffmpegArgs = isH264
    ? [
        '-i', inputPath,
        '-c:v', 'copy',          // Copy video stream (no re-encode)
        ...audioArgs,
        '-movflags', '+faststart', // Move moov atom to front
        '-y',                    // Overwrite output
        outputPath,
      ]
    : [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-crf', '18',            // Near-lossless quality (18=excellent, 23=default)
        '-preset', 'fast',       // Fast preset — good balance on home server
        '-profile:v', 'high',
        '-level', '4.1',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ];

  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ffmpegArgs);

    let stderrBuf = '';

    ff.stderr.on('data', (data: Buffer) => {
      stderrBuf += data.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseProgress(line, duration);
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
      if (code === 0) {
        // Delete original file to save space (only if different from output)
        if (inputFilename !== outputFilename && fs.existsSync(inputPath)) {
          try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
        }
        updateJob(mediaId, {
          status: 'done',
          progress: 100,
          finishedAt: Date.now(),
        });
        broadcast(mediaId, getJob(mediaId)!);
        resolve();
      } else {
        const errMsg = `FFmpeg exited with code ${code}`;
        updateJob(mediaId, { status: 'error', error: errMsg });
        broadcast(mediaId, getJob(mediaId)!);
        reject(new Error(errMsg));
      }
    });

    ff.on('error', err => {
      // FFmpeg not installed
      const msg = err.message.includes('ENOENT')
        ? 'FFmpeg not found. Install FFmpeg on your server: sudo apt install ffmpeg'
        : err.message;
      updateJob(mediaId, { status: 'error', error: msg });
      broadcast(mediaId, getJob(mediaId)!);
      reject(new Error(msg));
    });
  });
}
