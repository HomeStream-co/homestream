/**
 * dataDir — resolves the correct persistent data directory for all stores.
 *
 * Priority order:
 *  1. HOMESTREAM_DATA env var — set by Electron main.js to app.getPath('userData')
 *     so all user data lands in %APPDATA%\HomeStream (Windows) or
 *     ~/Library/Application Support/HomeStream (macOS) etc.
 *  2. /private — cloud/container environment (Airo platform)
 *  3. process.cwd() — plain local dev / npm run dev
 *
 * All stores import this single function so the logic lives in one place.
 */

import fs from 'fs';
import path from 'path';

let _cached: string | null = null;

export function dataDir(): string {
  if (_cached) return _cached;

  // 1. Electron injects this so data goes to the OS user-data folder
  if (process.env.HOMESTREAM_DATA) {
    const dir = process.env.HOMESTREAM_DATA;
    fs.mkdirSync(dir, { recursive: true });
    _cached = dir;
    return dir;
  }

  // 2. Cloud container
  if (fs.existsSync('/private')) {
    _cached = '/private';
    return '/private';
  }

  // 3. Local dev — store next to where the server is run from
  const dir = path.resolve(process.cwd(), 'homestream-data');
  fs.mkdirSync(dir, { recursive: true });
  _cached = dir;
  return dir;
}

/** Convenience: resolve a filename inside the data directory */
export function dataPath(filename: string): string {
  return path.join(dataDir(), filename);
}

/**
 * captionsDir — resolves the correct directory for WebVTT caption files.
 *
 * On the Airo cloud platform, captions are stored under /shared-storage so
 * they are web-accessible via the static asset server.
 * On Electron (desktop), they live inside the user-data directory alongside
 * all other HomeStream data — the Express server serves them via the
 * /api/captions/:id/:lang endpoint, so they don't need to be web-accessible.
 */
export function captionsDir(): string {
  // Cloud: use shared-storage so the static asset server can serve them
  if (fs.existsSync('/shared-storage/public/assets')) {
    return '/shared-storage/public/assets/captions';
  }
  // Electron / local dev: store inside the data directory
  const dir = path.join(dataDir(), 'captions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
