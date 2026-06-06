/** Stub — replace with full type when you send the types file */
export interface MediaItem {
  id: string;
  title: string;
  type: 'movie' | 'show' | 'episode' | string;
  poster?: string;
  backdrop?: string;
  year?: number;
  duration?: number;
  totalSeconds?: number;
  genre?: string[];
  rating?: string;
  overview?: string;
  watchProgress?: number;
  lastWatchedAt?: string;
  tmdbId?: number;
  [key: string]: unknown;
}
