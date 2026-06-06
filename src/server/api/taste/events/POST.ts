/**
 * POST /api/taste/events
 *
 * Record a watch event. Called by the player on play, pause, skip, complete,
 * and when the user rates or thumbs a title.
 *
 * After recording, asynchronously recomputes the taste score for this item
 * so the "You'd probably like" shelf stays fresh.
 */
import type { Request, Response } from 'express';
import { recordWatchEvent, recomputeTasteScores } from '../../../tasteEngine.js';
import type { WatchEventInput } from '../../../tasteEngine.js';

export default async function handler(req: Request, res: Response) {
  try {
    const body = req.body as WatchEventInput & { library?: { id: string; title: string; type: string; genres: string[]; director: string; actors: string; year: string; imdbRating: string; watchProgress: number }[] };

    if (!body.mediaId || !body.eventType) {
      return res.status(400).json({ error: 'mediaId and eventType are required' });
    }

    await recordWatchEvent({
      profileId:    body.profileId ?? 'default',
      mediaId:      body.mediaId,
      mediaTitle:   body.mediaTitle   ?? '',
      mediaType:    body.mediaType    ?? 'movie',
      genres:       body.genres       ?? [],
      director:     body.director     ?? '',
      actors:       body.actors       ?? '',
      year:         body.year         ?? '',
      imdbRating:   body.imdbRating   ?? '',
      eventType:    body.eventType,
      progressPct:  body.progressPct  ?? 0,
      watchedSecs:  body.watchedSecs  ?? 0,
      durationSecs: body.durationSecs ?? 0,
      userRating:   body.userRating,
    });

    // Async score recompute — don't block the response
    if (body.library && body.library.length > 0) {
      setImmediate(() => {
        recomputeTasteScores(body.library!, body.profileId ?? 'default').catch(console.error);
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[taste/events] POST error:', error);
    res.status(500).json({ error: 'Failed to record event', message: String(error) });
  }
}
