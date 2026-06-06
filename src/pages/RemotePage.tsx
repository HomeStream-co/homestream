import { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Wifi, Play, Pause, Square, SkipBack, SkipForward,
  Volume2, VolumeX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Loader2, WifiOff, Tv2,
} from 'lucide-react';
import { motion } from 'motion/react';

interface RemoteState {
  connected: boolean;
  playing: boolean;
  title?: string;
  progress?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}

function RemoteBtn({
  icon: Icon, label, onPress, size = 'md', variant = 'default', disabled = false,
}: {
  icon: React.ElementType; label: string; onPress: () => void;
  size?: 'sm' | 'md' | 'lg'; variant?: 'default' | 'primary' | 'danger'; disabled?: boolean;
}) {
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-10 h-10 text-sm' : 'w-12 h-12';
  const variantClass = variant === 'primary'
    ? 'bg-primary hover:bg-primary/80 text-primary-foreground'
    : variant === 'danger'
    ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive'
    : 'bg-card hover:bg-muted border border-border text-foreground';

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      title={label}
      className={`${sizeClass} ${variantClass} rounded-2xl flex items-center justify-center transition-colors disabled:opacity-40 select-none`}
    >
      <Icon className="w-5 h-5" />
    </motion.button>
  );
}

export default function RemotePage() {
  const [state, setState] = useState<RemoteState>({ connected: false, playing: false });
  const [connecting, setConnecting] = useState(false);
  const [volume, setVolume] = useState(80);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/remote`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnecting(false);
      setState(s => ({ ...s, connected: true }));
    };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as Partial<RemoteState>;
        setState(s => ({ ...s, ...data }));
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      setConnecting(false);
      setState(s => ({ ...s, connected: false }));
    };
    ws.onerror = () => {
      setConnecting(false);
      setState(s => ({ ...s, connected: false }));
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const send = useCallback((action: string, payload?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...payload }));
    }
  }, []);

  const fmtTime = (s?: number) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = state.duration && state.progress
    ? (state.progress / state.duration) * 100
    : 0;

  return (
    <>
      <Helmet>
        <title>Phone Remote — HomeStream</title>
        <meta name="description" content="Control HomeStream from your phone." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 flex flex-col items-center min-h-screen">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading text-foreground">Phone Remote</h1>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${state.connected ? 'bg-green-400' : 'bg-muted-foreground'}`} />
                <p className="text-xs text-muted-foreground">{state.connected ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected'}</p>
              </div>
            </div>
            {!state.connected && !connecting && (
              <button onClick={connect} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors">
                <Wifi className="w-3.5 h-3.5" />
                Reconnect
              </button>
            )}
          </div>

          {/* Not connected state */}
          {!state.connected && !connecting && (
            <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground">
              <WifiOff className="w-12 h-12 opacity-30" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">Not connected to HomeStream</p>
                <p className="text-xs leading-relaxed">Make sure your phone is on the same network as your HomeStream server.</p>
              </div>
              <button onClick={connect} className="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
                Connect
              </button>
            </div>
          )}

          {connecting && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Connecting to HomeStream…</p>
            </div>
          )}

          {state.connected && (
            <div className="flex flex-col gap-6">
              {/* Now playing */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tv2 className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Now Playing</p>
                </div>
                <p className="text-sm font-semibold text-foreground mb-3">
                  {state.title ?? 'Nothing playing'}
                </p>
                {state.duration && (
                  <>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{fmtTime(state.progress)}</span>
                      <span>{fmtTime(state.duration)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Playback controls */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <RemoteBtn icon={SkipBack} label="Previous" onPress={() => send('prev')} size="sm" />
                  <RemoteBtn icon={state.playing ? Pause : Play} label={state.playing ? 'Pause' : 'Play'} onPress={() => send('playPause')} size="lg" variant="primary" />
                  <RemoteBtn icon={SkipForward} label="Next" onPress={() => send('next')} size="sm" />
                </div>
                <div className="flex items-center justify-center gap-3">
                  <RemoteBtn icon={Square} label="Stop" onPress={() => send('stop')} size="sm" variant="danger" />
                </div>
              </div>

              {/* D-pad */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground text-center mb-4">Navigation</p>
                <div className="flex flex-col items-center gap-2">
                  <RemoteBtn icon={ChevronUp} label="Up" onPress={() => send('up')} />
                  <div className="flex items-center gap-2">
                    <RemoteBtn icon={ChevronLeft} label="Left" onPress={() => send('left')} />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => send('select')}
                      className="w-12 h-12 rounded-2xl bg-primary hover:bg-primary/80 text-primary-foreground flex items-center justify-center font-bold text-xs transition-colors select-none"
                    >
                      OK
                    </motion.button>
                    <RemoteBtn icon={ChevronRight} label="Right" onPress={() => send('right')} />
                  </div>
                  <RemoteBtn icon={ChevronDown} label="Down" onPress={() => send('down')} />
                </div>
              </div>

              {/* Volume */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => send('mute')} className="text-muted-foreground hover:text-foreground transition-colors">
                    {state.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      setVolume(v);
                      send('volume', { level: v / 100 });
                    }}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground w-8 text-right">{volume}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
