export interface MediaItem {
  id: string;
  filename: string;
  originalFilename?: string;
  filepath: string;
  title: string;
  year: string;
  genre: string[];
  plot: string;
  director: string;
  actors: string;
  imdbRating: string;
  poster: string;
  type: 'movie' | 'series';
  runtime?: string;
  rated?: string;
  addedAt: string;
  watchProgress: number;
  fileSize?: number;
  // TV show episode tracking
  totalSeasons?: number;
  episodes?: Episode[];
}

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  watched: boolean;
  watchedAt?: string;
  runtime?: string;
  plot?: string;
}

export interface Season {
  number: number;
  episodes: Episode[];
  watchedCount: number;
  totalCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: MediaItem[];
  timestamp: Date;
}
