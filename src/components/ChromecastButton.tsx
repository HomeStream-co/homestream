/**
 * ChromecastButton
 *
 * Integrates Google Cast SDK v3 for Chromecast support.
 *
 * How it works:
 *  1. Loads the Cast SDK script on mount (only once)
 *  2. Initialises the Cast API with the default media receiver app
 *  3. Shows a cast button when a Chromecast is available on the network
 *  4. On click: requests a cast session and loads the video URL
 *  5. Shows transport controls (play/pause/stop) while casting
 *
 * The default receiver app ID (CC1AD845) works with any standard HTTP video
 * URL — no custom receiver app needed for local network streaming.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tv2, Loader2, X, Play, Pause, Square } from 'lucide-react';

// ── Cast SDK type stubs (not in @types) ──────────────────────────────────────

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
        RemotePlayerEventType: { IS_CONNECTED_CHANGED: string; IS_PAUSED_CHANGED: string };
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
}

interface MediaSession {
  play(successCb: () => void, errorCb: () => void): void;
  pause(successCb: () => void, errorCb: () => void): void;
  stop(successCb: () => void, errorCb: () => void): void;
  playerState: string;
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
}

interface RemotePlayerController {
  addEventListener(type: string, handler: () => void): void;
  playOrPause(): void;
  stop(): void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_RECEIVER_APP_ID = 'CC1AD845'; // Default Media Receiver

// ── Component ─────────────────────────────────────────────────────────────────

interface ChromecastButtonProps {
  streamUrl: string;
  title: string;
  poster?: string;
  currentTime?: number;
  className?: string;
}

type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

export default function ChromecastButton({
  streamUrl, title, poster, currentTime = 0, className,
}: ChromecastButtonProps) {
  const [castState, setCastState] = useState<CastState>('unavailable');
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const playerRef = useRef<RemotePlayer | null>(null);
  const controllerRef = useRef<RemotePlayerController | null>(null);

  // ── Load Cast SDK ──
  useEffect(() => {
    if (document.getElementById('cast-sdk')) { setSdkLoaded(true); return; }

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
  }, []);

  // ── Initialise Cast API ──
  const initCast = useCallback(() => {
    if (!window.cast || !window.chrome?.cast) return;

    const ctx = window.cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    // Remote player for state tracking
    const player = new window.cast.framework.RemotePlayer();
    const controller = new window.cast.framework.RemotePlayerController(player);
    playerRef.current = player;
    controllerRef.current = controller;

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      () => {
        setCastState(player.isConnected ? 'connected' : 'available');
      }
    );

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
      () => { setIsPaused(player.isPaused); }
    );

    ctx.addEventListener(
      window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (e: { sessionState: string }) => {
        const { SessionState } = window.cast!.framework;
        if (e.sessionState === SessionState.SESSION_STARTED || e.sessionState === SessionState.SESSION_RESUMED) {
          setCastState('connected');
        } else if (e.sessionState === SessionState.SESSION_ENDED) {
          setCastState('available');
          setShowPanel(false);
        }
      }
    );

    // Check if receiver is already available
    setCastState('available');
  }, []);

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

      const mediaInfo = new window.chrome.cast.media.MediaInfo(streamUrl, 'video/mp4');
      const metadata = new window.chrome.cast.media.GenericMediaMetadata();
      metadata.metadataType = window.chrome.cast.media.MetadataType.GENERIC;
      metadata.title = title;
      if (poster) metadata.images = [{ url: poster }];
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
  }, [streamUrl, title, poster, currentTime]);

  const togglePlayPause = useCallback(() => {
    controllerRef.current?.playOrPause();
  }, []);

  const stopCast = useCallback(() => {
    controllerRef.current?.stop();
    setShowPanel(false);
  }, []);

  if (castState === 'unavailable') return null;

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
          : <Tv2 className="w-4 h-4" />
        }
      </button>

      {/* Cast control panel */}
      <AnimatePresence>
        {showPanel && castState === 'connected' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 bg-black/95 border border-white/20 rounded-xl p-4 shadow-2xl w-64 z-30"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tv2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-white">Casting</p>
              </div>
              <button onClick={() => setShowPanel(false)} className="text-white/40 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-white/50 truncate mb-4">{title}</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={togglePlayPause}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
