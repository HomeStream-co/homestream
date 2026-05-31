import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { captionsDir } from '../../../../dataDir.js';

/**
 * GET /api/captions/:id/:lang
 *
 * Serves a WebVTT subtitle file for the given media item and language.
 * Caption files are stored in captionsDir() — on cloud this is
 * /shared-storage/public/assets/captions; on Electron it is inside
 * the user-data directory.
 *
 * If no file exists, returns an empty (but valid) WebVTT document so the
 * browser <track> element doesn't throw a network error.
 *
 * NOTE: This endpoint is intentionally unauthenticated. Browser <track>
 * elements cannot send credentials (cookies or Authorization headers), so
 * requireAuth would always return 401 and subtitles would never load.
 * The VTT files contain only subtitle text — no sensitive media data.
 */
export default async function handler(req: Request, res: Response) {
  const { id, lang } = req.params;

  // Validate lang to prevent path traversal
  if (!['en', 'es'].includes(lang)) {
    res.status(400).send('Unsupported language');
    return;
  }

  // Validate id — alphanumeric + hyphens only
  if (!/^[\w-]+$/.test(id)) {
    res.status(400).send('Invalid id');
    return;
  }

  const captionPath = path.join(captionsDir(), id, `${lang}.vtt`);

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (fs.existsSync(captionPath)) {
      res.sendFile(captionPath);
    } else {
      // Return a valid empty VTT so the browser doesn't log a parse error
      res.send('WEBVTT\n\n');
    }
  } catch (err) {
    // Fallback — only send if headers haven't been flushed yet
    if (!res.headersSent) {
      res.send('WEBVTT\n\n');
    }
    console.error(`[captions] Error serving ${captionPath}:`, String(err));
  }
}
