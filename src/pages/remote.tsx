/**
 * /remote — Phone Remote Control
 *
 * A mobile-optimised page that connects to the HomeStream WebSocket server
 * and controls whatever is playing on the TV/desktop browser.
 *
 * Features:
 *  - Play / Pause
 *  - Seek bar (scrub to position)
 *  - Volume slider
 *  - Skip ±10s, Skip Intro, Next Episode
 *  - Playback speed selector
 *  - Live "now playing" title + progress
 *  - Connection status indicator
 *  - QR code hint for easy phone access
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Wifi, WifiOff, Film, FastForward, ChevronRight, Zap,
  RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerState {
  type: 'state';
  mediaId: string;
  title: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  speed: number;
  hasNextEpisode: boolean;
}

type ConnStatus = 'connecting' | 'connected' | 'disconnected' | 'no_screen';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RemotePage() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [state, setState] = useState<PlayerState | null>(null);
  const [localTime, setLocalTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [screenCount, setScreenCount] = useState(0);

  // Tick local time forward while playing (reduces WS traffic)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state && !state.paused && !isScrubbing) {
      tickRef.current = setInterval(() => {
        setLocalTime(t => Math.min(t + 1, state.duration));
      }, 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state?.paused, state?.duration, isScrubbing]);

  useEffect(() => {
    if (state) setLocalTime(state.currentTime);
  }, [state?.currentTime]);

  // ── WebSocket connection ──────────────────────────────────────────────────

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/remote?role=remote&mediaId=*`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('no_screen');
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string } & Partial<PlayerState> & { count?: number };

        if (msg.type === 'state') {
          setState(msg as PlayerState);
          setStatus('connected');
        } else if (msg.type === 'screens_available') {
          setScreenCount(msg.count ?? 0);
          if ((msg.count ?? 0) === 0) setStatus('no_screen');
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => { ws.close(); };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Send command ──────────────────────────────────────────────────────────

  const send = useCallback((cmd: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayTime = isScrubbing ? scrubValue : localTime;
  const progress = state?.duration ? displayTime / state.duration : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 pt-6 pb-10 select-none">
      <title>HomeStream Remote</title>

      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" />
          <span className="font-heading text-foreground font-bold tracking-wide">Remote</span>
        </div>

        {/* Connection status */}
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
          status === 'connected'     ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          status === 'connecting'    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
          status === 'no_screen'     ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                       'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {status === 'connected'  ? <Wifi className="w-3 h-3" /> :
           status === 'connecting' ? <Wifi className="w-3 h-3 animate-pulse" /> :
                                     <WifiOff className="w-3 h-3" />}
          {status === 'connected'  ? `${screenCount} screen${screenCount !== 1 ? 's' : ''}` :
           status === 'connecting' ? 'Connecting…' :
           status === 'no_screen'  ? 'No screen' :
                                     'Disconnected'}
        </div>
      </div>

      {/* No screen state */}
      <AnimatePresence>
        {status !== 'connected' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm text-center py-10"
          >
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
              <Film className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold mb-2">
              {status === 'connecting' ? 'Connecting to HomeStream…' :
               status === 'no_screen'  ? 'No video playing' :
                                         'Connection lost — reconnecting…'}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {status === 'no_screen'
                ? 'Open HomeStream on your TV or desktop and start playing something.'
                : 'Make sure HomeStream is running on your home network.'}
            </p>
            {status === 'disconnected' && (
              <button
                onClick={() => { reconnectRef.current && clearTimeout(reconnectRef.current); connect(); }}
                className="mt-4 flex items-center gap-1.5 mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry now
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player controls */}
      <AnimatePresence>
        {status === 'connected' && state && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm flex flex-col gap-6"
          >
            {/* Now playing */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Now Playing</p>
              <p className="text-foreground font-semibold text-lg leading-tight line-clamp-2">{state.title}</p>
            </div>

            {/* Seek bar */}
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min={0}
                max={state.duration || 100}
                step={1}
                value={displayTime}
                onMouseDown={() => setIsScrubbing(true)}
                onTouchStart={() => setIsScrubbing(true)}
                onChange={e => setScrubValue(Number(e.target.value))}
                onMouseUp={e => {
                  const val = Number((e.target as HTMLInputElement).value);
                  send({ type: 'seek', position: val });
                  setIsScrubbing(false);
                }}
                onTouchEnd={e => {
                  const val = Number((e.target as HTMLInputElement).value);
                  send({ type: 'seek', position: val });
                  setIsScrubbing(false);
                }}
                className="w-full h-2 rounded-full accent-primary cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) ${progress * 100}%, hsl(var(--muted)) ${progress * 100}%)`,
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span>{formatTime(displayTime)}</span>
                <span>{formatTime(state.duration)}</span>
              </div>
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => send({ type: 'skip_back', seconds: 10 })}
                className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                  <SkipBack className="w-5 h-5" />
                </div>
                <span className="text-[10px]">−10s</span>
              </button>

              <button
                onClick={() => send({ type: state.paused ? 'play' : 'pause' })}
                className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-lg shadow-primary/30 transition-all"
              >
                {state.paused
                  ? <Play className="w-8 h-8 text-primary-foreground fill-primary-foreground ml-1" />
                  : <Pause className="w-8 h-8 text-primary-foreground fill-primary-foreground" />
                }
              </button>

              <button
                onClick={() => send({ type: 'skip_forward', seconds: 10 })}
                className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                  <SkipForward className="w-5 h-5" />
                </div>
                <span className="text-[10px]">+10s</span>
              </button>
            </div>

            {/* Secondary controls row */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => send({ type: 'skip_intro' })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground active:scale-95 text-xs font-medium transition-all"
              >
                <FastForward className="w-3.5 h-3.5" />
                Skip Intro
              </button>

              {state.hasNextEpisode && (
                <button
                  onClick={() => send({ type: 'next_episode' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground active:scale-95 text-xs font-medium transition-all"
                >
                  Next Ep
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Speed picker */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedPicker(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground active:scale-95 text-xs font-medium transition-all"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {state.speed}×
                </button>
                <AnimatePresence>
                  {showSpeedPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.95 }}
                      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10"
                    >
                      {SPEEDS.map(s => (
                        <button
                          key={s}
                          onClick={() => { send({ type: 'speed', rate: s }); setShowSpeedPicker(false); }}
                          className={`block w-full px-5 py-2 text-sm text-left transition-colors ${
                            state.speed === s ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-accent/10'
                          }`}
                        >
                          {s}×
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3">
              <button onClick={() => send({ type: 'volume', level: 0 })}>
                {state.volume === 0
                  ? <VolumeX className="w-4 h-4 text-muted-foreground" />
                  : <Volume2 className="w-4 h-4 text-muted-foreground" />
                }
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.volume}
                onChange={e => send({ type: 'volume', level: Number(e.target.value) })}
                className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) ${state.volume * 100}%, hsl(var(--muted)) ${state.volume * 100}%)`,
                }}
              />
              <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                {Math.round(state.volume * 100)}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
