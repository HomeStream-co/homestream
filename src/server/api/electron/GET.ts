/**
 * GET /api/electron
 *
 * Returns platform info injected by the Electron main process.
 * Used by the setup wizard to show the correct default media directory
 * for the user's OS (Windows vs macOS vs Linux).
 *
 * When running outside Electron (cloud/dev), returns sensible defaults.
 *
 * Intentionally open (no auth) — needed by the setup wizard before a
 * password is configured. Returns only OS platform and a suggested path.
 *
 * no-try/catch: intentional — reads env vars and calls os.homedir() +
 * path.join(), both of which are synchronous and never throw.
 */
import type { Request, Response } from 'express';
import os from 'os';
import path from 'path';

export default function handler(_req: Request, res: Response) {
  const platform = process.env.HOMESTREAM_PLATFORM ?? process.platform;

  // If Electron injected a default, use it directly.
  // Otherwise derive a sensible default from the OS.
  let defaultMediaDir = process.env.HOMESTREAM_DEFAULT_MEDIA_DIR;
  if (!defaultMediaDir) {
    if (platform === 'win32') {
      defaultMediaDir = path.join(os.homedir(), 'Videos', 'HomeStream');
    } else if (platform === 'darwin') {
      defaultMediaDir = path.join(os.homedir(), 'Movies', 'HomeStream');
    } else {
      defaultMediaDir = path.join(os.homedir(), 'media', 'HomeStream');
    }
  }

  res.json({
    platform,
    isElectron: !!process.env.ELECTRON,
    defaultMediaDir,
  });
}
