/**
 * useTasteScores
 *
 * Fetches and caches taste scores for the current library.
 * Returns a map of mediaId → score (0–100) and the top recommendations.
 *
 * Scores are recomputed server-side on demand and cached in the DB.
 * The hook re-fetches whenever the library changes (debounced 2s).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaItem } from '@/types/media';

export interface TasteScore {
  id:    string;
  score: number;
}

export interface TasteRecommendation {
  mediaId:    string;
  mediaTitle: string;
  score:      number;
}

export function useTasteScores(library: MediaItem[], profileId = 'default') {
  const [scores,          setScores]          = useState<Map<string, number>>(new Map());
  const [recommendations, setRecommendations] = useState<TasteRecommendation[]>([]);
  const [loading,         setLoading]         = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchScores = useCallback(async () => {
    if (library.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/taste/scores', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          library: library.map(m => ({
            id:           m.id,
            title:        m.title,
            type:         m.type,
            genres:       m.genre ?? [],
            director:     m.director ?? '',
            actors:       m.actors   ?? '',
            year:         m.year     ?? '',
            imdbRating:   m.imdbRating ?? '',
            watchProgress: m.watchProgress ?? 0,
          })),
          profileId,
          limit: 12,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as {
        recommendations: TasteRecommendation[];
        allScores: TasteScore[];
      };
      const map = new Map<string, number>();
      for (const s of data.allScores) map.set(s.id, s.score);
      setScores(map);
      setRecommendations(data.recommendations);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [library, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchScores, 2000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchScores]);

  const getScore = useCallback((mediaId: string) => scores.get(mediaId) ?? null, [scores]);

  return { scores, recommendations, loading, getScore, refresh: fetchScores };
}
