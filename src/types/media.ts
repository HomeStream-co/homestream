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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: MediaItem[];
  timestamp: Date;
}
