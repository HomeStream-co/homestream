/**
 * hwEncoderDetect — Hardware H.264 encoder detection for FFmpeg.
 *
 * Probes for GPU-accelerated encoders in priority order:
 *   1. NVENC  (NVIDIA)       — h264_nvenc   — Linux / Windows
 *   2. VAAPI  (Intel/AMD)    — h264_vaapi   — Linux only
 *   3. VideoToolbox (Apple)  — h264_videotoolbox — macOS only
 *   4. QSV    (Intel Quick Sync) — h264_qsv — Linux / Windows
 *   5. AMF    (AMD)          — h264_amf     — Windows only
 *
 * Detection strategy:
 *   Run `ffmpeg -f lavfi -i nullsrc -t 0.1 -c:v <encoder> -f null -` with a
 *   2-second timeout. If FFmpeg exits 0, the encoder is available.
 *   Results are cached for the lifetime of the process (encoders don't appear
 *   or disappear at runtime).
 *
 * VAAPI additionally requires a render node — we check /dev/dri/renderD128
 *   (the standard path on most Linux distros) before probing.
 *
 * The result is exported as a singleton promise so all callers share one
 * detection run regardless of how many HLS jobs start concurrently.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HwEncoder =
  | 'h264_nvenc'
  | 'h264_vaapi'
  | 'h264_videotoolbox'
  | 'h264_qsv'
  | 'h264_amf'
  | null;

export interface HwEncoderResult {
  /** The best available hardware encoder, or null if none found */
  encoder: HwEncoder;
  /** Human-readable label for UI display */
  label: string;
  /** Extra FFmpeg args required by this encoder (e.g. VAAPI device init) */
  extraArgs: string[];
}

// ── FFmpeg binary resolution ──────────────────────────────────────────────────

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) return p;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

// ── Probe a single encoder ────────────────────────────────────────────────────

/**
 * Returns true if FFmpeg can successfully use the given encoder.
 * Runs a 0.1-second null encode with a 2-second wall-clock timeout.
 */
function probeEncoder(ffmpeg: string, encoder: string, extraArgs: string[] = []): Promise<boolean> {
  return new Promise(resolve => {
    const args = [
      ...extraArgs,
      '-f', 'lavfi',
      '-i', 'nullsrc=s=128x72',
      '-t', '0.1',
      '-c:v', encoder,
      '-f', 'null',
      '-',
    ];

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; proc.kill('SIGTERM'); resolve(false); }
    }, 2_000);

    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'ignore'] });

    proc.on('close', code => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(code === 0);
      }
    });

    proc.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(false); }
    });
  });
}

// ── Candidate list ────────────────────────────────────────────────────────────

interface Candidate {
  encoder: HwEncoder;
  label: string;
  /** Platform guard — skip probe entirely if this returns false */
  platformOk: () => boolean;
  /** Extra args to pass to FFmpeg when probing AND when encoding */
  extraArgs: string[];
}

const VAAPI_DEVICE = '/dev/dri/renderD128';

const CANDIDATES: Candidate[] = [
  {
    encoder: 'h264_nvenc',
    label: 'NVIDIA NVENC',
    platformOk: () => process.platform !== 'darwin',
    extraArgs: [],
  },
  {
    encoder: 'h264_videotoolbox',
    label: 'Apple VideoToolbox',
    platformOk: () => process.platform === 'darwin',
    extraArgs: [],
  },
  {
    encoder: 'h264_vaapi',
    label: 'Intel/AMD VAAPI',
    platformOk: () => process.platform === 'linux' && fs.existsSync(VAAPI_DEVICE),
    extraArgs: ['-vaapi_device', VAAPI_DEVICE, '-vf', 'format=nv12,hwupload'],
  },
  {
    encoder: 'h264_qsv',
    label: 'Intel Quick Sync',
    platformOk: () => process.platform !== 'darwin',
    extraArgs: [],
  },
  {
    encoder: 'h264_amf',
    label: 'AMD AMF',
    platformOk: () => process.platform === 'win32',
    extraArgs: [],
  },
];

// ── Detection (cached singleton) ──────────────────────────────────────────────

let _cached: Promise<HwEncoderResult> | null = null;

/**
 * Detect the best available hardware H.264 encoder.
 * Result is cached — safe to call from multiple concurrent HLS jobs.
 *
 * @param forceRefresh  Pass true in tests to bypass the cache.
 */
export function detectHwEncoder(forceRefresh = false): Promise<HwEncoderResult> {
  if (_cached && !forceRefresh) return _cached;

  _cached = (async (): Promise<HwEncoderResult> => {
    const ffmpeg = resolveFfmpeg();

    for (const candidate of CANDIDATES) {
      if (!candidate.platformOk()) continue;

      const ok = await probeEncoder(ffmpeg, candidate.encoder!, candidate.extraArgs);
      if (ok) {
        console.log(`[hwEncoder] Detected: ${candidate.label} (${candidate.encoder})`);
        return {
          encoder: candidate.encoder,
          label: candidate.label,
          extraArgs: candidate.extraArgs,
        };
      }
    }

    console.log('[hwEncoder] No hardware encoder found — using software libx264');
    return { encoder: null, label: 'Software (libx264)', extraArgs: [] };
  })();

  return _cached;
}

/**
 * Return the cached result synchronously, or null if detection hasn't run yet.
 * Used by the settings API to report encoder status without triggering a probe.
 */
export function getCachedHwEncoder(): HwEncoderResult | null {
  // We can't synchronously unwrap a Promise, so we store the resolved value
  // separately once the promise settles.
  return _resolvedCache;
}

let _resolvedCache: HwEncoderResult | null = null;

// Warm the cache shortly after module load so the result is ready by the
// time the first HLS job starts. Deferred by 10 s so the server finishes
// startup and begins accepting requests before FFmpeg probes run.
// On Windows, child_process.spawn() can block the event loop briefly while
// Defender scans the executable — running probes at module-load time would
// stall request handling during the critical startup window.
setTimeout(() => {
  detectHwEncoder().then(result => { _resolvedCache = result; }).catch(() => {});
}, 10_000);
