import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../../authMiddleware.js';

/**
 * GET /api/captions/:id/:lang
 *
 * Serves a WebVTT subtitle file for the given media item and language.
 * Caption files are expected at:
 *   /shared-storage/public/assets/captions/<id>/<lang>.vtt
 *   e.g. /shared-storage/public/assets/captions/abc123/en.vtt
 *
 * If no file exists, returns an empty (but valid) WebVTT document so the
 * browser <track> element doesn't throw a network error.
 */
export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { id, lang } = req.params;

  // Validate lang to prevent path traversal
  if (!['en', 'es'].includes(lang)) {
    res.status(400).send('Unsupported language');
    return;
  }

  const captionPath = path.join(
    '/shared-storage/public/assets/captions',
    id,
    `${lang}.vtt`,
  );

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
    // Fallback — never leave the browser hanging on a broken <track>
    res.send('WEBVTT\n\n');
    console.error(`[captions] Error serving ${captionPath}:`, String(err));
  }
}
