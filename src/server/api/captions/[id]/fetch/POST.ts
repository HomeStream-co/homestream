import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { readLibrary } from '../../../../libraryStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

/**
 * POST /api/captions/:id/fetch
 *
 * Downloads English and Spanish WebVTT subtitle files for a media item
 * and saves them to persistent storage so they're available offline.
 *
 * Storage path:
 *   /shared-storage/public/assets/captions/<id>/en.vtt
 *   /shared-storage/public/assets/captions/<id>/es.vtt
 *
 * Subtitle source: OpenSubtitles REST API v1 (no API key required for basic use).
 * Falls back to a minimal stub VTT if the title can't be found or we're offline.
 *
 * Response:
 *   { success: true, langs: { en: 'downloaded'|'stub'|'exists', es: 'downloaded'|'stub'|'exists' } }
 */

// Read version from package.json so the User-Agent always matches the release
function getVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../../../../package.json') as { version?: string };
    return pkg.version ?? '1.0';
  } catch { return '1.0'; }
}

const OS_API = 'https://rest.opensubtitles.org/search';
const USER_AGENT = `HomeStream v${getVersion()}`;

interface SubResult {
  SubDownloadLink?: string;
  SubFormat?: string;
  LanguageName?: string;
  IDSubtitleFile?: string;
}

type LangStatus = 'downloaded' | 'stub' | 'exists' | 'error';

async function downloadSrt(downloadUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Convert SRT subtitle text to WebVTT format.
 * SRT timestamps: 00:00:01,000 --> 00:00:04,000
 * VTT timestamps: 00:00:01.000 --> 00:00:04.000
 */
function srtToVtt(srt: string): string {
  const vtt = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace SRT comma decimal separator with VTT dot
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Strip HTML tags that some SRT files include
    .replace(/<[^>]+>/g, '');
  return `WEBVTT\n\n${vtt.trim()}\n`;
}

/** Minimal stub VTT — valid but empty, so the browser track element doesn't error */
function stubVtt(lang: string): string {
  const label = lang === 'en' ? 'English' : 'Español';
  return `WEBVTT\nNOTE No ${label} subtitles found for this title.\n\n`;
}

export default async function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  const { id } = req.params;

  // Look up the media item to get its IMDB ID and title
  const library = readLibrary();
  const item = library.find((m) => (m as { id: string }).id === id) as
    | { id: string; title: string; year?: string; imdbRating?: string }
    | undefined;

  if (!item) {
    res.status(404).json({ error: 'Media item not found' });
    return;
  }

  // Ensure caption directory exists
  const captionDir = path.join('/shared-storage/public/assets/captions', id);
  fs.mkdirSync(captionDir, { recursive: true });

  const langs: Record<string, LangStatus> = { en: 'stub', es: 'stub' };

  // ── Try to find IMDB ID from the item's metadata ──
  // The OMDB response stores it as imdbID on the raw data but we only persist
  // imdbRating. We'll search OpenSubtitles by title+year as a fallback.
  const titleQuery = encodeURIComponent(item.title);
  const yearQuery = (item as { year?: string }).year
    ? `&year=${(item as { year?: string }).year}`
    : '';

  for (const [lang, osLang] of [['en', 'eng'], ['es', 'spa']] as const) {
    const vttPath = path.join(captionDir, `${lang}.vtt`);

    // Skip if already downloaded
    if (fs.existsSync(vttPath)) {
      langs[lang] = 'exists';
      continue;
    }

    try {
      // Search by title (OpenSubtitles REST v1 — no auth needed for basic search)
      const searchUrl = `${OS_API}/query-${titleQuery}${yearQuery}/sublanguageid-${osLang}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      let results: SubResult[] = [];
      try {
        const searchRes = await fetch(searchUrl, {
          headers: { 'User-Agent': USER_AGENT, 'X-User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (searchRes.ok) {
          results = await searchRes.json() as SubResult[];
        }
      } catch {
        clearTimeout(timeout);
      }

      // Pick the first SRT result (most compatible)
      const srtResult = results.find(r => r.SubFormat?.toLowerCase() === 'srt' && r.SubDownloadLink);
      const anyResult = results.find(r => r.SubDownloadLink);
      const best = srtResult || anyResult;

      if (best?.SubDownloadLink) {
        const rawText = await downloadSrt(best.SubDownloadLink);
        if (rawText) {
          // Convert SRT → VTT (OpenSubtitles serves SRT even from the download link)
          const vttContent = srtToVtt(rawText);
          fs.writeFileSync(vttPath, vttContent, 'utf8');
          langs[lang] = 'downloaded';
          console.log(`[captions] Downloaded ${lang} subtitles for "${item.title}"`);
          continue;
        }
      }

      // Nothing found — write a stub so the player doesn't get a 404
      fs.writeFileSync(vttPath, stubVtt(lang), 'utf8');
      langs[lang] = 'stub';
      console.log(`[captions] No ${lang} subtitles found for "${item.title}" — wrote stub`);

    } catch (err) {
      console.error(`[captions] Error fetching ${lang} for ${id}:`, err);
      // Write stub on error
      try { fs.writeFileSync(vttPath, stubVtt(lang), 'utf8'); } catch { /* ignore */ }
      langs[lang] = 'error';
    }
  }

  res.json({
    success: true,
    langs,
    message: Object.values(langs).some(s => s === 'downloaded')
      ? 'Subtitles downloaded and saved for offline use'
      : 'No subtitles found — stubs saved (CC button will show but no text)',
  });
}
