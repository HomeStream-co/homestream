/**
 * POST /api/captions/:id/upload
 *
 * Accepts a user-supplied .srt or .vtt subtitle file and saves it as the
 * canonical WebVTT track for the given language.
 *
 * Form fields:
 *   subtitle  — the file (multipart/form-data)
 *   lang      — "en" | "es"  (defaults to "en")
 *
 * Storage path:
 *   /shared-storage/public/assets/captions/<id>/<lang>.vtt
 *
 * Response:
 *   { success: true, lang: "en", message: "..." }
 *   { success: false, error: "..." }
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { readLibrary, writeLibrary } from '../../../../libraryStore.js';
import { requireAuth } from '../../../../authMiddleware.js';

// ── Multer — memory storage so we can inspect before writing ─────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.srt', '.vtt'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .srt and .vtt files are accepted'));
    }
  },
});

// ── SRT → VTT conversion (same logic as fetch endpoint) ──────────────────────

function srtToVtt(srt: string): string {
  const vtt = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/<[^>]+>/g, '');
  return `WEBVTT\n\n${vtt.trim()}\n`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(req: Request, res: Response) {
  if (!requireAuth(req, res)) return;
  // Run multer middleware inline
  upload.single('subtitle')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }

    const { id } = req.params;
    const lang = (req.body?.lang as string | undefined) ?? 'en';

    if (!['en', 'es'].includes(lang)) {
      res.status(400).json({ success: false, error: 'lang must be "en" or "es"' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: 'No subtitle file provided' });
      return;
    }

    // Verify the media item exists
    const library = readLibrary();
    const itemExists = library.some((m) => (m as { id: string }).id === id);
    if (!itemExists) {
      res.status(404).json({ success: false, error: 'Media item not found' });
      return;
    }

    try {
      // Ensure caption directory exists
      const captionDir = path.join('/shared-storage/public/assets/captions', id);
      fs.mkdirSync(captionDir, { recursive: true });

      const vttPath = path.join(captionDir, `${lang}.vtt`);

      // Convert SRT → VTT if needed; keep VTT as-is
      const ext = path.extname(req.file.originalname).toLowerCase();
      const rawText = req.file.buffer.toString('utf8');
      const vttContent = ext === '.srt' ? srtToVtt(rawText) : rawText;

      // Basic VTT validation — must start with WEBVTT after conversion
      if (!vttContent.trimStart().startsWith('WEBVTT')) {
        res.status(400).json({ success: false, error: 'File does not appear to be valid SRT or VTT' });
        return;
      }

      fs.writeFileSync(vttPath, vttContent, 'utf8');
      console.log(`[captions] User uploaded ${lang} subtitles for item ${id} (${req.file.originalname})`);

      // Persist caption status to the library item using the write queue
      await writeLibrary(lib => {
        const idx = lib.findIndex((m) => (m as { id: string }).id === id);
        if (idx !== -1) {
          const it = lib[idx] as Record<string, unknown>;
          const existing = (it.captions as Record<string, string> | undefined) ?? {};
          lib[idx] = { ...it, captions: { ...existing, [lang]: 'downloaded' } };
        }
        return lib;
      });

      res.json({
        success: true,
        lang,
        message: `${lang.toUpperCase()} subtitles saved successfully`,
      });
    } catch (writeErr) {
      console.error('[captions] Upload write error:', writeErr);
      res.status(500).json({ success: false, error: 'Failed to save subtitle file' });
    }
  });
}
