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

export interface ProfileProgressEntry {
  progress: number;
  watchedSeconds?: number;
  totalSeconds?: number;
  lastWatchedAt?: string;
  watchedAt?: string;
}

export interface MediaItem {
  id: string;
  /** Explicit IMDB ID (e.g. "tt1234567"). Falls back to `id` for legacy items. */
  imdbId?: string;
  filename: string;
  originalFilename?: string;
  filepath: string;
  title: string;
  year: string;
  genre: string[];
  plot: string;
  director: string;
  actors: string | string[];  // string[] when parsed from array sources, comma-separated string from OMDB
  imdbRating: string;
  poster: string;
  type: 'movie' | 'series';
  runtime?: string;
  rated?: string;
  addedAt: string;
  watchProgress: number;         // 0–100 percentage
  watchedSeconds?: number;       // raw seconds for precision resume
  totalSeconds?: number;         // total duration in seconds
  lastWatchedAt?: string;        // ISO — used to sort Continue Watching row
  watchedAt?: string;            // ISO — set when progress reaches 95%+
  fileSize?: number;
  transcoding?: boolean;
  transcodeWarning?: string;
  transcodeError?: string;
  // Offline upload flags
  needsMetadata?: boolean;       // true = uploaded offline, no OMDB data yet
  metadataAvailable?: boolean;   // false = server had no internet during upload
  // Transcode size savings (populated after transcode completes)
  originalSize?: number;        // original file size in bytes before transcode
  savedBytes?: number;          // bytes saved vs original (0 if output was larger)
  transcodeStrategy?: 'remux' | 'encode_h264' | 'skipped';
  // AI enrichment (populated after upload wizard runs)
  enrichment?: MediaEnrichment;
  ccStatus?: 'none' | 'fetching' | 'available' | 'failed';
  enriching?: boolean;          // true while wizard is running
  // Closed caption availability (populated after caption fetch)
  captions?: {
    en?: 'downloaded' | 'stub' | 'exists';
    es?: 'downloaded' | 'stub' | 'exists';
  };
  // Per-profile watch progress — keyed by profileId ("adult" | "kids")
  // Top-level watchProgress / watchedSeconds / lastWatchedAt mirror the adult profile
  // for backwards compatibility with Jellyfin API and legacy code.
  profileProgress?: Record<string, ProfileProgressEntry>;
  // TV show episode tracking
  totalSeasons?: number;
  episodes?: Episode[];
  // For series items that represent a single episode, the season/episode number
  // is stored directly on the item (populated by postDownloadPipeline)
  season?: number;
  episode?: number;
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
