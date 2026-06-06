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

/**
 * Full ISO 639-1 two-letter language codes.
 * Kept as a Set for O(1) lookup. Covers every language OpenSubtitles serves.
 * The path traversal guard below uses this — any value not in this set is
 * rejected before it ever reaches path.join().
 */
const VALID_LANG_CODES = new Set([
  'aa','ab','ae','af','ak','am','an','ar','as','av','ay','az',
  'ba','be','bg','bh','bi','bm','bn','bo','br','bs',
  'ca','ce','ch','co','cr','cs','cu','cv','cy',
  'da','de','dv','dz',
  'ee','el','en','eo','es','et','eu',
  'fa','ff','fi','fj','fo','fr','fy',
  'ga','gd','gl','gn','gu','gv',
  'ha','he','hi','ho','hr','ht','hu','hy',
  'hz',
  'ia','id','ie','ig','ii','ik','io','is','it','iu',
  'ja','jv',
  'ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky',
  'la','lb','lg','li','ln','lo','lt','lu','lv',
  'mg','mh','mi','mk','ml','mn','mr','ms','mt','my',
  'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny',
  'oc','oj','om','or','os',
  'pa','pi','pl','ps','pt',
  'qu',
  'rm','rn','ro','ru','rw',
  'sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw',
  'ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty',
  'ug','uk','ur','uz',
  'va','ve','vi','vo',
  'wa','wo',
  'xh',
  'yi','yo',
  'za','zh','zu',
]);

export default async function handler(req: Request, res: Response) {
  const { id, lang } = req.params;

  // Validate lang against the full ISO 639-1 whitelist to prevent path traversal.
  // Any value not in the set (e.g. "../../../etc/passwd") is rejected here
  // before it ever reaches path.join().
  if (!VALID_LANG_CODES.has(lang)) {
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
