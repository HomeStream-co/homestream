/**
 * Probe Cache — in-memory cache for ffprobe results
 *
 * ffprobe takes ~200-500ms per file. This cache stores results keyed by
 * filePath + mtime so we never probe the same unchanged file twice.
 *
 * Cache is invalidated automatically when the file's mtime changes
 * (e.g. after transcoding completes).
 *
 * Max 500 entries — LRU eviction keeps memory bounded.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Resolve ffprobe binary: prefer FFMPEG_PATH env var (Electron sets this),
// then look for ffprobe alongside the bundled ffmpeg-static binary,
// then fall back to system 'ffprobe' on PATH.
function resolveFfprobe(): string {
  if (process.env.FFMPEG_PATH) {
    const dir = path.dirname(process.env.FFMPEG_PATH);
    const ext = process.platform === 'win32' ? '.exe' : '';
    const candidate = path.join(dir, `ffprobe${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
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

const FFPROBE = resolveFfprobe();

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  bitrateBps: number;
  durationSecs: number;
  fileSizeBytes: number;
  audioStreams: number;
  audioTracks: Array<{
    index: number;
    streamIndex: number;
    language: string;
    label: string;
    codec: string;
    channels: number;
    isDefault: boolean;
  }>;
  subtitleTracks: Array<{
    index: number;
    streamIndex: number;
    language: string;
    label: string;
    codec: string;
    isDefault: boolean;
    isForced: boolean;
  }>;
}

interface CacheEntry {
  result: ProbeResult;
  mtime: number;
  lastAccess: number;
}

const MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function evictLRU() {
  if (cache.size < MAX_ENTRIES) return;
  let oldest = Infinity;
  let oldestKey = '';
  for (const [key, entry] of cache) {
    if (entry.lastAccess < oldest) {
      oldest = entry.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

const LANG_NAMES: Record<string, string> = {
  eng: 'English', jpn: 'Japanese', spa: 'Spanish', fre: 'French',
  fra: 'French', ger: 'German', deu: 'German', ita: 'Italian',
  por: 'Portuguese', rus: 'Russian', chi: 'Chinese', zho: 'Chinese',
  kor: 'Korean', ara: 'Arabic', hin: 'Hindi', und: 'Unknown',
};

function langLabel(code?: string): string {
  if (!code) return 'Unknown';
  return LANG_NAMES[code.toLowerCase().slice(0, 3)] ?? code.toUpperCase();
}

function runProbe(filePath: string): Promise<ProbeResult> {
  return new Promise(resolve => {
    const proc = spawn(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });

    proc.on('close', () => {
      try {
        const json = JSON.parse(out) as {
          format?: { duration?: string; bit_rate?: string; size?: string };
          streams?: Array<{
            index: number;
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
            bit_rate?: string;
            channels?: number;
            tags?: { language?: string; title?: string; LANGUAGE?: string; TITLE?: string };
            disposition?: { default?: number; forced?: number };
          }>;
        };

        const streams = json.streams ?? [];
        const videoStream = streams.find(s => s.codec_type === 'video');

        let audioIdx = 0;
        let subIdx = 0;

        const audioTracks = streams
          .filter(s => s.codec_type === 'audio')
          .map(s => {
            const lang = s.tags?.language ?? s.tags?.LANGUAGE;
            const title = s.tags?.title ?? s.tags?.TITLE;
            const label = title ? `${title} (${langLabel(lang)})` : langLabel(lang);
            return {
              index: audioIdx++,
              streamIndex: s.index,
              language: lang ?? 'und',
              label,
              codec: s.codec_name ?? 'unknown',
              channels: s.channels ?? 2,
              isDefault: s.disposition?.default === 1,
            };
          });

        const subtitleTracks = streams
          .filter(s => s.codec_type === 'subtitle')
          .map(s => {
            const lang = s.tags?.language ?? s.tags?.LANGUAGE;
            const title = s.tags?.title ?? s.tags?.TITLE;
            const label = title ? `${title} (${langLabel(lang)})` : langLabel(lang);
            return {
              index: subIdx++,
              streamIndex: s.index,
              language: lang ?? 'und',
              label,
              codec: s.codec_name ?? 'unknown',
              isDefault: s.disposition?.default === 1,
              isForced: s.disposition?.forced === 1,
            };
          });

        resolve({
          codec: videoStream?.codec_name ?? 'unknown',
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          bitrateBps: parseInt(videoStream?.bit_rate ?? json.format?.bit_rate ?? '0', 10) || 0,
          audioStreams: audioTracks.length,
          durationSecs: parseFloat(json.format?.duration ?? '0') || 0,
          fileSizeBytes: parseInt(json.format?.size ?? '0', 10) || 0,
          audioTracks,
          subtitleTracks,
        });
      } catch {
        resolve({
          codec: 'unknown', width: 0, height: 0, bitrateBps: 0,
          audioStreams: 0, durationSecs: 0, fileSizeBytes: 0,
          audioTracks: [], subtitleTracks: [],
        });
      }
    });

    proc.on('error', () => {
      resolve({
        codec: 'unknown', width: 0, height: 0, bitrateBps: 0,
        audioStreams: 0, durationSecs: 0, fileSizeBytes: 0,
        audioTracks: [], subtitleTracks: [],
      });
    });
  });
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;
    const cached = cache.get(filePath);

    if (cached && cached.mtime === mtime) {
      cached.lastAccess = Date.now();
      return cached.result;
    }

    evictLRU();
    const result = await runProbe(filePath);
    cache.set(filePath, { result, mtime, lastAccess: Date.now() });
    return result;
  } catch {
    return runProbe(filePath);
  }
}

export function invalidateProbeCache(filePath: string): void {
  cache.delete(filePath);
}

export function getProbeCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_ENTRIES };
}
