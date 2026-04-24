/**
 * Shared types and utilities for the Remote page and its sub-tab components.
 */

/**
 * Returns an Authorization header object for fetch calls made from the phone
 * remote. The phone stores the session token in localStorage (it can't set
 * httpOnly cookies cross-origin). The server's requireAuth middleware accepts
 * both cookie and Bearer token.
 */
export function remoteAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('hs_token') ?? '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export type RemoteTab = 'remote' | 'browse' | 'search' | 'ai' | 'downloads' | 'cast';

export interface LibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  poster?: string;
  year?: string;
  imdbRating?: string;
  genre?: string[];
  watchProgress?: number; // 0-1
}

export interface SubtitleTrack {
  index: number;
  label: string;
  language: string;
}

export interface CastSessionInfo {
  active: boolean;
  deviceName?: string;
  isPaused?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}

export interface PlayerState {
  type: 'state';
  mediaId: string;
  title: string;
  poster?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitle?: number; // -1 = off
  cast?: CastSessionInfo;
}

export type ConnStatus = 'connecting' | 'connected' | 'disconnected' | 'no_screen';

export interface DownloadJob {
  hash: string;
  name: string;
  status: 'downloading' | 'seeding' | 'paused' | 'error' | 'queued' | 'completed';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  eta: number;
  size: number;
  mediaId?: string;
}

export interface TMDBSearchResult {
  id: number;
  title: string;
  type: 'movie' | 'series';
  year?: string;
  poster?: string;
  overview?: string;
  rating?: number;
}
