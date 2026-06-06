/**
 * usePlayerState — stub types exported for player sub-components.
 * Replace with the full hook when you send src/hooks/usePlayerState.ts.
 */

export type CcLang = 'off' | 'en' | 'es';

export interface AudioTrack {
  index: number;
  label: string;
  language?: string;
  codec?: string;
  channels?: number;
}

export interface CastInfo {
  active: boolean;
  deviceName?: string;
  state?: string;
}

export type TvControl =
  | 'play' | 'rewind' | 'forward' | 'mute' | 'volume'
  | 'seek' | 'speed' | 'cc' | 'fullscreen' | 'cast';
