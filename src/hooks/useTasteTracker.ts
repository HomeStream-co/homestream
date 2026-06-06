/**
 * useTasteTracker
 *
 * Drop this hook into the player. It fires watch events to /api/taste/events
 * at the right moments so the taste engine can learn from actual behaviour.
 *
 * Usage:
 *   const { recordEvent, recordRating } = useTasteTracker(mediaItem);
 *
 *   // In player — call on play/pause/skip/complete:
 *   recordEvent('play',     progressPct, watchedSecs, durationSecs);
 *   recordEvent('complete', 100,         durationSecs, durationSecs);
 *   recordEvent('skip',     progressPct, watchedSecs, durationSecs);
 *
 *   // When user rates:
 *   recordRating(8.5);
 *   recordEvent('thumbs_up');
 */
import { useCallback, useRef } from 'react';

export interface TrackedMediaItem {
  id:         string;
  title:      string;
  type:       string;
  genre?:     string[];
  genres?:    string[];
  director?:  string;
  actors?:    string;
  year?:      string;
  imdbRating?: string;
}

type EventType = 'play' | 'pause' | 'skip' | 'complete' | 'rate' | 'thumbs_up' | 'thumbs_down';

export function useTasteTracker(item: TrackedMediaItem | null, profileId = 'default') {
  const lastEventRef = useRef<{ type: EventType; pct: number; ts: number } | null>(null);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await fetch('/api/taste/events', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
      });
    } catch { /* non-critical — taste tracking is best-effort */ }
  }, []);

  const recordEvent = useCallback((
    eventType:    EventType,
    progressPct:  number = 0,
    watchedSecs:  number = 0,
    durationSecs: number = 0,
  ) => {
    if (!item) return;

    // Debounce duplicate events within 2 seconds
    const now = Date.now();
    const last = lastEventRef.current;
    if (last && last.type === eventType && Math.abs(last.pct - progressPct) < 1 && now - last.ts < 2000) return;
    lastEventRef.current = { type: eventType, pct: progressPct, ts: now };

    send({
      profileId,
      mediaId:      item.id,
      mediaTitle:   item.title,
      mediaType:    item.type === 'series' ? 'series' : 'movie',
      genres:       item.genres ?? item.genre ?? [],
      director:     item.director ?? '',
      actors:       item.actors   ?? '',
      year:         item.year     ?? '',
      imdbRating:   item.imdbRating ?? '',
      eventType,
      progressPct,
      watchedSecs,
      durationSecs,
    });
  }, [item, profileId, send]);

  const recordRating = useCallback((rating: number) => {
    if (!item) return;
    send({
      profileId,
      mediaId:      item.id,
      mediaTitle:   item.title,
      mediaType:    item.type === 'series' ? 'series' : 'movie',
      genres:       item.genres ?? item.genre ?? [],
      director:     item.director ?? '',
      actors:       item.actors   ?? '',
      year:         item.year     ?? '',
      imdbRating:   item.imdbRating ?? '',
      eventType:    'rate',
      progressPct:  0,
      userRating:   rating,
    });
  }, [item, profileId, send]);

  const recordThumb = useCallback((up: boolean) => {
    if (!item) return;
    send({
      profileId,
      mediaId:      item.id,
      mediaTitle:   item.title,
      mediaType:    item.type === 'series' ? 'series' : 'movie',
      genres:       item.genres ?? item.genre ?? [],
      director:     item.director ?? '',
      actors:       item.actors   ?? '',
      year:         item.year     ?? '',
      imdbRating:   item.imdbRating ?? '',
      eventType:    up ? 'thumbs_up' : 'thumbs_down',
      progressPct:  0,
    });
  }, [item, profileId, send]);

  return { recordEvent, recordRating, recordThumb };
}
