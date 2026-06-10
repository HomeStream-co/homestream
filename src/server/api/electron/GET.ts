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
 */
import type { Request, Response } from 'express';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

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

  // On Windows, enumerate available fixed drives so the setup wizard can
  // offer a drive selector (D:, E:, etc.) instead of hard-coding C:.
  let availableDrives: { path: string; freeSpaceGB?: number }[] = [];
  if (platform === 'win32') {
    try {
      const out = execSync(
        'wmic logicaldisk where "DriveType=3" get DeviceID,FreeSpace /value',
        { encoding: 'utf8', timeout: 3000 }
      );
      const lines = out.split('\\n').map(l => l.trim()).filter(Boolean);
      let currentDevice = '';
      let currentFreeSpace: number | undefined = undefined;
      for (const line of lines) {
        if (line.startsWith('DeviceID=')) {
          if (currentDevice) {
            availableDrives.push({ path: currentDevice + '\\\\', freeSpaceGB: currentFreeSpace });
          }
          currentDevice = line.split('=')[1];
          currentFreeSpace = undefined;
        } else if (line.startsWith('FreeSpace=')) {
          const bytes = parseInt(line.split('=')[1], 10);
          if (!isNaN(bytes)) {
            currentFreeSpace = Math.round(bytes / 1024 / 1024 / 1024);
          }
        }
      }
      if (currentDevice) {
        availableDrives.push({ path: currentDevice + '\\\\', freeSpaceGB: currentFreeSpace });
      }
    } catch {
      // WMIC unavailable — leave empty, wizard falls back to text input only
    }
  }

  res.json({
    platform,
    isElectron: !!process.env.ELECTRON,
    defaultMediaDir,
    availableDrives,   // e.g. ["C:\\", "D:\\", "E:\\"] — empty on non-Windows
  });
}
