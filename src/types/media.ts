export interface MediaEnrichment {
  // AI-generated deep categorization
  tags: string[];               // e.g. ["heist", "time-travel", "unreliable narrator"]
  mood: string[];               // e.g. ["tense", "funny", "heartwarming"]
  themes: string[];             // e.g. ["redemption", "family", "identity"]
  pacing: 'slow' | 'moderate' | 'fast' | 'varied';
  audienceAge: 'kids' | 'family' | 'teens' | 'adults' | 'mature';
  contentWarnings: string[];    // e.g. ["violence", "strong language"]
  aiSummary: string;            // 2-sentence punchy description
  whyWatch: string;             // 1-sentence hook
  similarTitles: string[];      // titles from OMDB/AI knowledge (not library IDs)
  enrichedAt: string;           // ISO timestamp
  enrichmentVersion: number;    // bump when schema changes
}

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
  transcoding?: boolean;
  transcodeWarning?: string;
  transcodeError?: string;
  // Offline upload flags
  needsMetadata?: boolean;       // true = uploaded offline, no OMDB data yet
  metadataAvailable?: boolean;   // false = server had no internet during upload
  // AI enrichment (populated after upload wizard runs)
  enrichment?: MediaEnrichment;
  enriching?: boolean;          // true while wizard is running
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
