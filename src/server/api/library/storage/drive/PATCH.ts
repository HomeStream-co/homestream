/**
 * PATCH /api/library/storage/drive
 *
 * Change the active media directory (storage device).
 * Body: { mediaDir: string }
 *
 * - Validates the path exists (or creates it)
 * - Writes mediaDir, downloadsDir, libraryDir to config
 * - Does NOT move existing files — user is responsible for that
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readConfig, writeConfig } from '../../../../configStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;

  const { mediaDir } = req.body as { mediaDir?: unknown };

  if (!mediaDir || typeof mediaDir !== 'string' || !mediaDir.trim()) {
    res.status(400).json({ error: 'mediaDir is required' });
    return;
  }

  const dir = mediaDir.trim();

  // Basic path safety — no shell metacharacters
  if (/[`$|;&<>(){}!]/.test(dir)) {
    res.status(400).json({ error: 'Invalid path characters' });
    return;
  }

  try {
    // Create the directory if it doesn't exist yet
    fs.mkdirSync(dir, { recursive: true });

    const downloadsDir = path.join(dir, 'downloads');
    const libraryDir   = path.join(dir, 'library');
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.mkdirSync(libraryDir,   { recursive: true });

    writeConfig({ mediaDir: dir, downloadsDir, libraryDir });

    const cfg = readConfig();
    res.json({
      ok: true,
      mediaDir: cfg.mediaDir,
      downloadsDir: cfg.downloadsDir,
      libraryDir: cfg.libraryDir,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set media directory', message: String(err) });
  }
}
