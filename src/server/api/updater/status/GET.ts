/**
 * GET /api/updater/status
 *
 * Returns the current auto-updater state so the React app can show the
 * UpdateBanner without needing Electron IPC (which only works in the
 * control-panel BrowserWindow, not in the system browser where the app runs).
 *
 * The Electron main process writes its updater state into this in-memory
 * store via the shared `updaterBridge` module.  When running outside
 * Electron (dev server, browser preview) the endpoint returns { state: 'idle' }
 * so the banner stays hidden.
 *
 * Open endpoint — no auth required (update state is not sensitive).
 */
import type { Request, Response } from 'express';
import { getUpdaterStatus } from '../../../updaterBridge.js';

export default function handler(_req: Request, res: Response) {
  res.json(getUpdaterStatus());
}
