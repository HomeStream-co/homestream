/**
 * GET /api/health/full
 *
 * Returns a full subsystem health report used by the Debug Panel.
 * Checks: library, config, qBittorrent, TMDB, Ollama (if configured),
 *         disk space (media dir), and active torrent jobs.
 *
 * Designed to be fast — all checks run in parallel with short timeouts.
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { readConfig } from '../../../configStore.js';
import { readLibrary } from '../../../libraryStore.js';
import { isReachable as qbitReachable } from '../../../qbittorrentClient.js';
import { getAllJobs, type TorrentJob } from '../../../torrentManager.js';
import { requireAuth } from '../../../authMiddleware.js';

export type SubsystemStatus = 'ok' | 'warn' | 'error' | 'unknown';

export interface SubsystemCheck {
  name: string;
  status: SubsystemStatus;
  message: string;
  detail?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkLibrary(): Promise<SubsystemCheck> {
  try {
    const lib = readLibrary();
    const stuck = lib.filter(m => m.transcoding === true).length;
    if (stuck > 0) {
      return { name: 'Media Library', status: 'warn', message: `${lib.length} titles — ${stuck} stuck transcoding`, detail: 'Use "Clear Stuck Transcodes" to fix' };
    }
    return { name: 'Media Library', status: 'ok', message: `${lib.length} titles loaded` };
  } catch (err) {
    return { name: 'Media Library', status: 'error', message: 'Failed to read library', detail: String(err) };
  }
}

async function checkConfig(): Promise<SubsystemCheck> {
  try {
    const cfg = readConfig();
    const missing: string[] = [];
    if (!cfg.mediaDir) missing.push('mediaDir');
    if (!cfg.omdbApiKey) missing.push('OMDB key');
    if (!cfg.tmdbApiKey) missing.push('TMDB key');
    if (cfg.aiProvider === 'gemini' && !cfg.googleAiApiKey) missing.push('Gemini key');

    if (!cfg.setupComplete) return { name: 'Configuration', status: 'warn', message: 'Setup not completed', detail: 'Run the setup wizard' };
    if (missing.length > 0) return { name: 'Configuration', status: 'warn', message: `Missing: ${missing.join(', ')}` };

    const dirOk = cfg.mediaDir && fs.existsSync(cfg.mediaDir);
    if (!dirOk) return { name: 'Configuration', status: 'error', message: `Media dir not found: ${cfg.mediaDir}` };

    return { name: 'Configuration', status: 'ok', message: `Media dir: ${cfg.mediaDir}` };
  } catch (err) {
    return { name: 'Configuration', status: 'error', message: 'Failed to read config', detail: String(err) };
  }
}

async function checkQbit(): Promise<SubsystemCheck> {
  try {
    const cfg = readConfig();
    if (!cfg.qbitUrl) return { name: 'qBittorrent', status: 'unknown', message: 'Not configured' };

    const ok = await checkWithTimeout(() => qbitReachable(), 4000, false);
    if (ok) return { name: 'qBittorrent', status: 'ok', message: `Connected at ${cfg.qbitUrl}` };
    return { name: 'qBittorrent', status: 'warn', message: 'Unreachable — WebTorrent fallback active', detail: cfg.qbitUrl };
  } catch (err) {
    return { name: 'qBittorrent', status: 'error', message: 'Check failed', detail: String(err) };
  }
}

async function checkTMDB(): Promise<SubsystemCheck> {
  try {
    const cfg = readConfig();
    if (!cfg.tmdbApiKey) return { name: 'TMDB', status: 'warn', message: 'No API key — Discover page disabled' };

    const res = await checkWithTimeout(
      () => fetch('https://api.themoviedb.org/3/configuration', {
        headers: { Authorization: `Bearer ${cfg.tmdbApiKey}` },
        signal: AbortSignal.timeout(5000),
      }).then(r => r.status),
      6000,
      0,
    );

    if (res === 200) return { name: 'TMDB', status: 'ok', message: 'API reachable' };
    if (res === 401) return { name: 'TMDB', status: 'error', message: 'Invalid API key (401)' };
    if (res === 0) return { name: 'TMDB', status: 'warn', message: 'Timeout — using cached data' };
    return { name: 'TMDB', status: 'warn', message: `HTTP ${res}` };
  } catch (err) {
    return { name: 'TMDB', status: 'warn', message: 'Unreachable', detail: String(err) };
  }
}

async function checkOllama(): Promise<SubsystemCheck> {
  try {
    const cfg = readConfig();
    if (cfg.aiProvider !== 'ollama') return { name: 'Ollama', status: 'unknown', message: 'Not selected as AI provider' };
    if (!cfg.ollamaUrl) return { name: 'Ollama', status: 'warn', message: 'No Ollama URL configured' };

    const res = await checkWithTimeout(
      () => fetch(`${cfg.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) }).then(r => r.json() as Promise<{ models?: { name: string }[] }>),
      5000,
      null as null,
    );

    if (!res) return { name: 'Ollama', status: 'warn', message: `Unreachable at ${cfg.ollamaUrl}` };
    const models = res.models?.map(m => m.name) ?? [];
    const modelOk = models.some(n => n.startsWith(cfg.ollamaModel || 'llama3'));
    if (!modelOk) return { name: 'Ollama', status: 'warn', message: `Running but "${cfg.ollamaModel}" not installed`, detail: `Available: ${models.slice(0, 3).join(', ') || 'none'}` };
    return { name: 'Ollama', status: 'ok', message: `${cfg.ollamaModel} ready` };
  } catch (err) {
    return { name: 'Ollama', status: 'error', message: 'Check failed', detail: String(err) };
  }
}

async function checkTorrentio(): Promise<SubsystemCheck> {
  try {
    const res = await checkWithTimeout(
      () => fetch('https://torrentio.strem.fun/manifest.json', { signal: AbortSignal.timeout(5000) }).then(r => r.status),
      6000,
      0,
    );
    if (res === 200) return { name: 'Torrentio', status: 'ok', message: 'Reachable' };
    if (res === 0) return { name: 'Torrentio', status: 'warn', message: 'Timeout — downloads may be slow' };
    return { name: 'Torrentio', status: 'warn', message: `HTTP ${res}` };
  } catch {
    return { name: 'Torrentio', status: 'warn', message: 'Unreachable — torrent search unavailable' };
  }
}

async function checkDownloadJobs(): Promise<SubsystemCheck> {
  try {
    const jobs = getAllJobs();
    const active = jobs.filter((j: TorrentJob) => j.status === 'downloading').length;
    const errored = jobs.filter((j: TorrentJob) => j.status === 'error').length;
    const stuck = jobs.filter((j: TorrentJob) => j.status === 'queued' && Date.now() - new Date(j.addedAt).getTime() > 30 * 60 * 1000).length;

    if (errored > 0) return { name: 'Download Queue', status: 'warn', message: `${active} active, ${errored} errored`, detail: 'Check Downloads page' };
    if (stuck > 0) return { name: 'Download Queue', status: 'warn', message: `${stuck} jobs stuck in queue >30min` };
    if (active > 0) return { name: 'Download Queue', status: 'ok', message: `${active} active download${active > 1 ? 's' : ''}` };
    return { name: 'Download Queue', status: 'ok', message: 'Idle' };
  } catch (err) {
    return { name: 'Download Queue', status: 'error', message: 'Failed to read jobs', detail: String(err) };
  }
}

/**
 * Detect the FFmpeg binary path using the same resolution logic as hlsTranscoder.
 * Returns the path if found, or null if not available.
 */
function resolveFfmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) return p;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

async function checkFfmpeg(): Promise<SubsystemCheck> {
  return new Promise(resolve => {
    const bin = resolveFfmpegBin();
    const proc = spawn(bin, ['-version'], { stdio: 'pipe' });
    let output = '';

    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ name: 'FFmpeg', status: 'warn', message: 'Version check timed out', detail: `Binary: ${bin}` });
    }, 5000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/i);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        resolve({ name: 'FFmpeg', status: 'ok', message: `v${version} — transcoding ready`, detail: `Binary: ${bin}` });
      } else {
        resolve({
          name: 'FFmpeg',
          status: 'error',
          message: 'FFmpeg not found — transcoding and HLS playback will fail',
          detail: `Install FFmpeg or set FFMPEG_PATH. Tried: ${bin}`,
        });
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({
        name: 'FFmpeg',
        status: 'error',
        message: 'FFmpeg not found — transcoding and HLS playback will fail',
        detail: `Install FFmpeg or set FFMPEG_PATH. Tried: ${bin}`,
      });
    });
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const [library, config, qbit, tmdb, ollama, torrentio, downloads, ffmpeg] = await Promise.all([
    checkLibrary(),
    checkConfig(),
    checkQbit(),
    checkTMDB(),
    checkOllama(),
    checkTorrentio(),
    checkDownloadJobs(),
    checkFfmpeg(),
  ]);

  const checks: SubsystemCheck[] = [library, config, qbit, tmdb, ollama, torrentio, downloads, ffmpeg];

  const overall: SubsystemStatus =
    checks.some(c => c.status === 'error') ? 'error' :
    checks.some(c => c.status === 'warn') ? 'warn' : 'ok';

  res.json({
    overall,
    checks,
    timestamp: new Date().toISOString(),
  });
}
