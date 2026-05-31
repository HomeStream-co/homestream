/**
 * ChromecastButton
 *
 * Integrates Google Cast SDK v3 for Chromecast support.
 *
 * Features:
 *  - Loads Cast SDK once, initialises with Default Media Receiver (CC1AD845)
 *  - Shows cast button when a Chromecast is available on the network
 *  - On click: requests a cast session and loads the video URL
 *  - Cast control panel: play/pause, seek bar, volume slider, stop
 *  - Volume passthrough: slider controls actual Chromecast/TV volume via HDMI-CEC
 *  - Session persistence: rejoins an existing cast session on remount
 *  - Syncs currentTime prop so seeking the main player updates the cast position
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tv2, Loader2, X, Play, Pause, Square, Volume2, VolumeX } from 'lucide-react';
import { useLanUrl } from '@/hooks/useLanUrl';

// ── Cast SDK type stubs ───────────────────────────────────────────────────────

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: {
      framework: {
        CastContext: {
          getInstance(): CastContext;
        };
        CastContextEventType: { SESSION_STATE_CHANGED: string };
        SessionState: {
          SESSION_STARTED: string;
          SESSION_ENDED: string;
          SESSION_RESUMED: string;
        };
        RemotePlayerEventType: {
          IS_CONNECTED_CHANGED: string;
          IS_PAUSED_CHANGED: string;
          CURRENT_TIME_CHANGED: string;
          DURATION_CHANGED: string;
          VOLUME_LEVEL_CHANGED: string;
          IS_MUTED_CHANGED: string;
        };
        RemotePlayer: new () => RemotePlayer;
        RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController;
      };
    };
    chrome?: {
      cast: {
        media: {
          MediaInfo: new (url: string, contentType: string) => MediaInfo;
          GenericMediaMetadata: new () => GenericMediaMetadata;
          MetadataType: { GENERIC: number };
          LoadRequest: new (mediaInfo: MediaInfo) => LoadRequest;
        };
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        ReceiverAvailability: { AVAILABLE: string };
      };
    };
  }
}

interface CastContext {
  setOptions(options: object): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
  addEventListener(type: string, handler: (e: { sessionState: string }) => void): void;
}

interface CastSession {
  loadMedia(request: LoadRequest): Promise<void>;
  getMediaSession(): MediaSession | null;
  setVolume(volume: CastVolume, successCb: () => void, errorCb: () => void): void;
}

interface CastVolume {
  level?: number;
  muted?: boolean;
}

interface MediaSession {
  play(successCb: () => void, errorCb: () => void): void;
  pause(successCb: () => void, errorCb: () => void): void;
  stop(successCb: () => void, errorCb: () => void): void;
  seek(request: SeekRequest, successCb: () => void, errorCb: () => void): void;
  playerState: string;
  currentTime: number;
  duration: number;
}

interface SeekRequest {
  currentTime: number;
  resumeState?: string;
}

interface MediaInfo {
  metadata: GenericMediaMetadata;
}

interface GenericMediaMetadata {
  metadataType: number;
  title: string;
  images: { url: string }[];
}

interface LoadRequest {
  autoplay: boolean;
  currentTime: number;
}

interface RemotePlayer {
  isConnected: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volumeLevel: number;
  isMuted: boolean;
}

interface RemotePlayerController {
  addEventListener(type: string, handler: () => void): void;
  playOrPause(): void;
  stop(): void;
  seek(): void;
  muteOrUnmute(): void;
  setVolumeLevel(): void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_RECEIVER_APP_ID = 'CC1AD845'; // Default Media Receiver — no custom app needed

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChromecastButtonProps {
  streamUrl: string;
  title: string;
  poster?: string;
  currentTime?: number;
  className?: string;
  /** Called with a trigger function so parent can programmatically start casting */
  onTriggerRef?: (trigger: () => void) => void;
  /**
   * Called with an imperative control object so the parent (or phone remote)
   * can control an active cast session without touching the UI.
   */
  onControlRef?: (ctrl: {
    playPause: () => void;
    stop: () => void;
    seek: (position: number) => void;
    setVolume: (level: number) => void;
  }) => void;
  /** Called whenever cast state changes — gives parent live session info */
  onCastStateChange?: (info: {
    active: boolean;
    deviceName?: string;
    isPaused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
  }) => void;
}

type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

export default function ChromecastButton({
  streamUrl, title, poster, currentTime = 0, className,
  onTriggerRef, onControlRef, onCastStateChange,
}: ChromecastButtonProps) {
  const [castState, setCastState] = useState<CastState>('unavailable');
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [castTime, setCastTime] = useState(0);
  const [castDuration, setCastDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const playerRef = useRef<RemotePlayer | null>(null);
  const controllerRef = useRef<RemotePlayerController | null>(null);
  const onCastStateChangeRef = useRef(onCastStateChange);
  onCastStateChangeRef.current = onCastStateChange;

  const { toLanUrl } = useLanUrl();

  // ── Load Cast SDK (once per page) ──
  useEffect(() => {
    if (document.getElementById('cast-sdk')) {
      // SDK already loaded — try to init immediately
      if (window.cast) initCast();
      else setSdkLoaded(true);
      return;
    }

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        setSdkLoaded(true);
        initCast();
      }
    };

    const script = document.createElement('script');
    script.id = 'cast-sdk';
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Initialise Cast API ──
  const initCast = useCallback(() => {
    if (!window.cast || !window.chrome?.cast) return;

    const notifyParent = (active: boolean) => {
      const p = playerRef.current;
      onCastStateChangeRef.current?.({
        active,
        isPaused: p?.isPaused ?? false,
        currentTime: p?.currentTime ?? 0,
        duration: p?.duration ?? 0,
        volume: p?.volumeLevel ?? 1,
        muted: p?.isMuted ?? false,
      });
    };

    try {
      const ctx = window.cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      const player = new window.cast.framework.RemotePlayer();
      const controller = new window.cast.framework.RemotePlayerController(player);
      playerRef.current = player;
      controllerRef.current = controller;

      // Connection state
      controller.addEventListener(
        window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        () => {
          const connected = player.isConnected;
          setCastState(connected ? 'connected' : 'available');
          if (!connected) { setShowPanel(false); notifyParent(false); }
          else notifyParent(true);
        }
      );

    // Playback state
    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
      () => { setIsPaused(player.isPaused); notifyParent(true); }
    );

    // Time sync
    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      () => { if (!seeking) { setCastTime(player.currentTime); notifyParent(true); } }
    );

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.DURATION_CHANGED,
      () => { setCastDuration(player.duration); notifyParent(true); }
    );

    // Volume sync
    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
      () => { setVolume(player.volumeLevel); notifyParent(true); }
    );

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
      () => { setMuted(player.isMuted); notifyParent(true); }
    );

    // Session state
    ctx.addEventListener(
      window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (e: { sessionState: string }) => {
        const { SessionState } = window.cast!.framework;
        if (
          e.sessionState === SessionState.SESSION_STARTED ||
          e.sessionState === SessionState.SESSION_RESUMED
        ) {
          setCastState('connected');
          // CC4: Persist — if resuming an existing session, show the panel
          if (e.sessionState === SessionState.SESSION_RESUMED) {
            setShowPanel(true);
          }
        } else if (e.sessionState === SessionState.SESSION_ENDED) {
          setCastState('available');
          setShowPanel(false);
        }
      }
    );

    // CC4: Check if already in a session (e.g. navigated to a new video while casting)
    const existingSession = ctx.getCurrentSession();
    if (existingSession) {
      setCastState('connected');
    } else {
      setCastState('available');
    }
    } catch (err) {
      // Chromecast SDK unavailable in sandboxed/non-HTTPS environments — fail silently.
      // The button simply stays hidden (castState remains 'unavailable').
      console.debug('[Chromecast] SDK init skipped (sandboxed context):', err);
    }
  }, [seeking]);

  useEffect(() => {
    if (sdkLoaded) initCast();
  }, [sdkLoaded, initCast]);

  // ── Start casting ──
  const startCast = useCallback(async () => {
    if (!window.cast || !window.chrome?.cast) return;
    setCastState('connecting');
    try {
      const ctx = window.cast.framework.CastContext.getInstance();
      await ctx.requestSession();

      const session = ctx.getCurrentSession();
      if (!session) { setCastState('available'); return; }

      // Use LAN URL so the Chromecast (on the TV) can reach the server
      const fullStreamUrl = toLanUrl(streamUrl);
      const mediaInfo = new window.chrome.cast.media.MediaInfo(fullStreamUrl, 'video/mp4');
      const metadata = new window.chrome.cast.media.GenericMediaMetadata();
      metadata.metadataType = window.chrome.cast.media.MetadataType.GENERIC;
      metadata.title = title;
      if (poster) metadata.images = [{ url: toLanUrl(poster) }];
      mediaInfo.metadata = metadata;

      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      request.currentTime = currentTime;

      await session.loadMedia(request);
      setCastState('connected');
      setShowPanel(true);
    } catch {
      setCastState('available');
    }
  }, [streamUrl, title, poster, currentTime, toLanUrl]);

  // Expose trigger to parent via ref callback
  useEffect(() => {
    onTriggerRef?.(startCast);
  }, [onTriggerRef, startCast]);

  // Expose imperative cast controls to parent (for phone remote cast_* commands)
  useEffect(() => {
    onControlRef?.({
      playPause: () => controllerRef.current?.playOrPause(),
      stop: () => { controllerRef.current?.stop(); setShowPanel(false); },
      seek: (position: number) => {
        if (!window.cast) return;
        const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
        const mediaSession = session?.getMediaSession();
        if (mediaSession) {
          mediaSession.seek(
            { currentTime: position, resumeState: 'PLAYBACK_START' },
            () => {},
            () => {},
          );
        }
      },
      setVolume: (level: number) => {
        if (!window.cast) return;
        const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
        if (session) session.setVolume({ level, muted: level === 0 }, () => {}, () => {});
        setVolume(level);
        setMuted(level === 0);
      },
    });
  }, [onControlRef]);

  const togglePlayPause = useCallback(() => {
    controllerRef.current?.playOrPause();
  }, []);

  const stopCast = useCallback(() => {
    controllerRef.current?.stop();
    setShowPanel(false);
  }, []);

  // ── Seek ──
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCastTime(t);
    setSeeking(true);
  }, []);

  const commitSeek = useCallback((t: number) => {
    setSeeking(false);
    if (!window.cast) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const session = ctx.getCurrentSession();
    const mediaSession = session?.getMediaSession();
    if (mediaSession) {
      mediaSession.seek(
        { currentTime: t, resumeState: 'PLAYBACK_START' },
        () => {},
        () => {}
      );
    }
  }, []);

  // ── CC3: Volume passthrough via Cast SDK setVolume ──
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const level = parseFloat(e.target.value);
    setVolume(level);
    if (!window.cast) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const session = ctx.getCurrentSession();
    if (session) {
      session.setVolume({ level, muted: false }, () => {}, () => {});
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!window.cast) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const session = ctx.getCurrentSession();
    if (session) {
      session.setVolume({ muted: !muted }, () => {}, () => {});
    }
    setMuted(m => !m);
  }, [muted]);

  if (castState === 'unavailable') return null;

  const progress = castDuration > 0 ? (castTime / castDuration) * 100 : 0;

  return (
    <>
      <button
        onClick={castState === 'connected' ? () => setShowPanel(p => !p) : startCast}
        disabled={castState === 'connecting'}
        className={className ?? `p-2 rounded transition-all ${
          castState === 'connected'
            ? 'text-primary bg-primary/20'
            : 'text-white/70 hover:text-white'
        } disabled:opacity-50`}
        title={castState === 'connected' ? 'Casting — click to manage' : 'Cast to Chromecast'}
      >
        {castState === 'connecting'
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Tv2 className={`w-4 h-4 ${castState === 'connected' ? 'animate-pulse' : ''}`} />
        }
      </button>

      {/* ── Cast control panel ── */}
      <AnimatePresence>
        {showPanel && castState === 'connected' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 bg-black/95 border border-white/20 rounded-xl p-4 shadow-2xl w-72 z-30"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tv2 className="w-4 h-4 text-primary animate-pulse" />
                <p className="text-sm font-medium text-white">Casting to TV</p>
              </div>
              <button onClick={() => setShowPanel(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Title */}
            <p className="text-xs text-white/50 truncate mb-3">{title}</p>

            {/* Seek bar */}
            {castDuration > 0 && (
              <div className="mb-3">
                <input
                  type="range"
                  min={0}
                  max={castDuration}
                  step={1}
                  value={castTime}
                  onChange={handleSeekChange}
                  onMouseUp={(e) => commitSeek(parseFloat((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => commitSeek(parseFloat((e.currentTarget as HTMLInputElement).value))}
                  className="w-full h-1 accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-white/40 mt-1">
                  <span>{formatTime(castTime)}</span>
                  <span>{formatTime(castDuration)}</span>
                </div>
              </div>
            )}

            {/* Progress bar (fallback when no duration) */}
            {castDuration <= 0 && castTime > 0 && (
              <div className="mb-3 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            )}

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={togglePlayPause}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title={isPaused ? 'Play' : 'Pause'}
              >
                {isPaused
                  ? <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  : <Pause className="w-4 h-4 text-white fill-white" />
                }
              </button>
              <button
                onClick={stopCast}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-destructive/30 flex items-center justify-center transition-colors"
                title="Stop casting"
              >
                <Square className="w-4 h-4 text-white fill-white" />
              </button>
            </div>

            {/* CC3: Volume control — controls actual TV volume via HDMI-CEC */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-white/50 hover:text-white transition-colors flex-shrink-0"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0
                  ? <VolumeX className="w-3.5 h-3.5" />
                  : <Volume2 className="w-3.5 h-3.5" />
                }
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 accent-primary cursor-pointer"
                title="TV Volume"
              />
              <span className="text-[10px] text-white/40 w-7 text-right flex-shrink-0">
                {muted ? '0%' : `${Math.round(volume * 100)}%`}
              </span>
            </div>

            <p className="text-[10px] text-white/25 text-center mt-3">
              Volume controls your TV via HDMI-CEC
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
