/**
 * usePlayerState — all player state and refs in one place.
 *
 * Extracted from player.tsx to keep the page component focused on
 * composition rather than state management.
 *
 * Returns every piece of state and every ref the player needs, plus
 * derived helpers (showActionToast, resetControlsTimer).
 */

import { useState, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioTrack {
  index: number;
  streamIndex: number;
  language: string;
  label: string;
  codec: string;
  channels: number;
  isDefault: boolean;
}

export type TvControl =
  | 'back' | 'rewind' | 'play' | 'forward'
  | 'mute' | 'volume' | 'seek'
  | 'speed' | 'cc' | 'fullscreen' | 'cast';

export const TV_CONTROLS: TvControl[] = [
  'back', 'rewind', 'play', 'forward',
  'mute', 'volume', 'seek',
  'speed', 'cc', 'fullscreen', 'cast',
];

export type CcLang = 'off' | 'en' | 'es';

export interface CastInfo {
  active: boolean;
  deviceName?: string;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePlayerState() {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const watchCompleteTriggered = useRef(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const resumeApplied = useRef(false);
  const resumeBannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seekBarRef = useRef<HTMLInputElement>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const thumbVideoSrcRef = useRef<string>('');
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const doubleTapCountRef = useRef<{ side: 'forward' | 'back'; count: number }>({ side: 'forward', count: 0 });

  // ── Playback state ────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPiP, setIsPiP] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(60);
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showCcMenu, setShowCcMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // ── Seek flash ────────────────────────────────────────────────────────────
  const [seekFlash, setSeekFlash] = useState<'forward' | 'back' | null>(null);
  const [seekFlashCount, setSeekFlashCount] = useState(0);

  // ── Seek hover thumbnail ──────────────────────────────────────────────────
  const [seekHover, setSeekHover] = useState<{ x: number; time: number; dataUrl: string } | null>(null);

  // ── Closed captions ───────────────────────────────────────────────────────
  const [ccLang, setCcLang] = useState<CcLang>('off');
  const [ccFontSize, setCcFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [ccBgOpacity, setCcBgOpacity] = useState<'none' | 'low' | 'high'>('low');

  // ── TV D-pad ──────────────────────────────────────────────────────────────
  const [tvFocus, setTvFocus] = useState<TvControl | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // ── Audio tracks ──────────────────────────────────────────────────────────
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState(0);

  // ── AI enrichment ─────────────────────────────────────────────────────────
  const [enrichRunning, setEnrichRunning] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // ── Cast ──────────────────────────────────────────────────────────────────
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showActionToast = useCallback((msg: string) => {
    setActionToast(msg);
    clearTimeout(actionToastTimer.current);
    actionToastTimer.current = setTimeout(() => setActionToast(null), 1800);
  }, []);

  const resetControlsTimer = useCallback((isPlaying: boolean) => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, []);

  return {
    // Refs
    videoRef, containerRef, controlsTimerRef, autoplayTimerRef,
    watchCompleteTriggered, fadeIntervalRef, resumeApplied, resumeBannerTimer,
    seekBarRef, thumbCanvasRef, thumbVideoRef, thumbVideoSrcRef,
    doubleTapTimerRef, doubleTapCountRef,
    // Playback
    playing, setPlaying,
    currentTime, setCurrentTime,
    duration, setDuration,
    volume, setVolume,
    muted, setMuted,
    fullscreen, setFullscreen,
    buffered, setBuffered,
    playbackRate, setPlaybackRate,
    videoLoading, setVideoLoading,
    videoError, setVideoError,
    isPiP, setIsPiP,
    // UI
    showControls, setShowControls,
    showInfo, setShowInfo,
    showEndOverlay, setShowEndOverlay,
    autoplayCountdown, setAutoplayCountdown,
    autoplayCancelled, setAutoplayCancelled,
    showSkipIntro, setShowSkipIntro,
    showResumeBanner, setShowResumeBanner,
    showShortcuts, setShowShortcuts,
    showSpeedMenu, setShowSpeedMenu,
    showCcMenu, setShowCcMenu,
    showAudioMenu, setShowAudioMenu,
    // Seek flash
    seekFlash, setSeekFlash,
    seekFlashCount, setSeekFlashCount,
    // Seek hover
    seekHover, setSeekHover,
    // CC
    ccLang, setCcLang,
    ccFontSize, setCcFontSize,
    ccBgOpacity, setCcBgOpacity,
    // TV D-pad
    tvFocus, setTvFocus,
    actionToast, setActionToast,
    // Audio
    audioTracks, setAudioTracks,
    activeAudioTrack, setActiveAudioTrack,
    // AI
    enrichRunning, setEnrichRunning,
    enrichError, setEnrichError,
    // Cast
    castInfo, setCastInfo,
    // Helpers
    showActionToast,
    resetControlsTimer,
  };
}

export type PlayerState = ReturnType<typeof usePlayerState>;
