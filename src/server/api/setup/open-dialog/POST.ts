/**
 * POST /api/setup/open-dialog
 *
 * Triggers Electron's showOpenDialog (folder picker) when running inside
 * the Electron shell. Returns { supported: false } in all other environments
 * so the UI can fall back to the tree browser gracefully.
 *
 * Intentionally open (no auth) — needed before a password is configured.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  // Electron injects the dialog bridge via process.env.ELECTRON and a global
  // __electronDialog helper set up in the main process preload.
  const isElectron = !!process.env.ELECTRON;

  if (!isElectron) {
    return res.json({ supported: false });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialog = (global as any).__electronDialog;
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return res.json({ supported: false });
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Media Folder',
    });

    if (result.canceled || !result.filePaths?.length) {
      return res.json({ supported: true, canceled: true });
    }

    return res.json({ supported: true, canceled: false, path: result.filePaths[0] });
  } catch {
    return res.json({ supported: false });
  }
}
