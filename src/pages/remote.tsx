/**
 * /remote — Phone Remote Control  (v3)
 *
 * Mobile-optimised WebSocket remote for HomeStream.
 *
 * New in v3:
 *  - Browse tab: full library grid — tap any title to launch it on the TV
 *  - Tab bar at bottom: Remote | Browse
 *  - ?tab=browse deep-link (used by PWA shortcut)
 *
 * v2 features retained:
 *  - Poster art backdrop with blur + gradient overlay
 *  - Subtitle / caption track toggle
 *  - Haptic feedback, swipe gestures (seek / volume)
 *  - Landscape layout
 *  - Fullscreen + Cast buttons
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Wifi, WifiOff, Film, FastForward, ChevronRight, Zap,
  RotateCcw, QrCode, X, ExternalLink, Subtitles,
  Maximize2, Cast, ChevronUp, ChevronDown, Tv2, Square,
  Tv, Search, SlidersHorizontal, Star,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RemoteTab = 'remote' | 'browse';

interface LibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  poster?: string;
  year?: string;
  imdbRating?: string;
  genre?: string[];
  watchProgress?: number; // 0-1
}

interface SubtitleTrack {
  index: number;
  label: string;
  language: string;
}

interface CastSessionInfo {
  active: boolean;
  deviceName?: string;
  isPaused?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}

interface PlayerState {
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

/** Trigger haptic feedback if available */
function haptic(pattern: number | number[] = 30) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Swipe hook ────────────────────────────────────────────────────────────────

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

function useSwipe(
  onHorizontal: (delta: number) => void,
  onVertical: (delta: number) => void,
  threshold = 40,
): SwipeHandlers {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current || firedRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      firedRef.current = true;
      haptic(20);
      onHorizontal(dx);
    } else if (Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx)) {
      firedRef.current = true;
      haptic(20);
      onVertical(dy);
    }
  }, [onHorizontal, onVertical, threshold]);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    startRef.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// ── Seek flash overlay ────────────────────────────────────────────────────────

function SeekFlash({ dir, secs }: { dir: 'left' | 'right'; secs: number }) {
  return (
    <motion.div
      key={`${dir}-${Date.now()}`}
      initial={{ opacity: 0.9, scale: 0.9 }}
      animate={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.5 }}
      className={`absolute inset-y-0 ${dir === 'left' ? 'left-0 right-1/2' : 'left-1/2 right-0'} flex items-center justify-center pointer-events-none`}
    >
      <div className={`flex flex-col items-center gap-1 ${dir === 'left' ? 'text-blue-400' : 'text-blue-400'}`}>
        {dir === 'left'
          ? <SkipBack className="w-8 h-8" />
          : <SkipForward className="w-8 h-8" />
        }
        <span className="text-xs font-bold">{dir === 'left' ? `-${secs}s` : `+${secs}s`}</span>
      </div>
    </motion.div>
  );
}

// ── Volume flash overlay ──────────────────────────────────────────────────────

function VolumeFlash({ dir, pct }: { dir: 'up' | 'down'; pct: number }) {
  return (
    <motion.div
      key={`vol-${dir}-${Date.now()}`}
      initial={{ opacity: 0.9, y: dir === 'up' ? 10 : -10 }}
      animate={{ opacity: 0, y: dir === 'up' ? -10 : 10 }}
      transition={{ duration: 0.6 }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-1 text-white">
        {dir === 'up' ? <ChevronUp className="w-8 h-8" /> : <ChevronDown className="w-8 h-8" />}
        <span className="text-sm font-bold">{pct}%</span>
      </div>
    </motion.div>
  );
}

// ── Browse Tab ────────────────────────────────────────────────────────────────

function BrowseTab({ send }: { send: (cmd: Record<string, unknown>) => void }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then((data: LibraryItem[]) => {
        setLibrary(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let items = library;
    if (filter !== 'all') items = items.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q));
    }
    return items;
  }, [library, search, filter]);

  const launch = useCallback((item: LibraryItem) => {
    haptic([30, 20, 30]);
    setLaunching(item.id);
    send({ type: 'launch', mediaId: item.id, title: item.title });
    setTimeout(() => setLaunching(null), 2000);
  }, [send]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading library…</p>
      </div>
    );
  }

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <Film className="w-12 h-12 text-muted-foreground" />
        <p className="text-foreground font-semibold">No media yet</p>
        <p className="text-sm text-muted-foreground">Add movies or shows to your HomeStream library first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search library…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'movie', 'series'] as const).map(f => (
          <button
            key={f}
            onClick={() => { haptic(20); setFilter(f); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              filter === f
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f === 'all' ? <SlidersHorizontal className="w-3 h-3" /> : f === 'movie' ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
            {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Shows'}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length}</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {filtered.map(item => (
          <motion.button
            key={item.id}
            onClick={() => launch(item)}
            whileTap={{ scale: 0.95 }}
            className="relative rounded-xl overflow-hidden aspect-[2/3] bg-card border border-border group"
          >
            {item.poster ? (
              <img
                src={item.poster}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-muted-foreground" />
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {/* Watch progress bar */}
            {item.watchProgress && item.watchProgress > 0.02 && item.watchProgress < 0.98 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${item.watchProgress * 100}%` }}
                />
              </div>
            )}

            {/* Title */}
            <div className="absolute bottom-0 left-0 right-0 p-1.5">
              <p className="text-white text-[10px] font-medium leading-tight line-clamp-2">{item.title}</p>
              {item.imdbRating && item.imdbRating !== 'N/A' && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-[9px] text-white/70">{item.imdbRating}</span>
                </div>
              )}
            </div>

            {/* Launch overlay */}
            <AnimatePresence>
              {launching === item.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-primary/80 flex flex-col items-center justify-center gap-1"
                >
                  <Tv2 className="w-6 h-6 text-white animate-pulse" />
                  <span className="text-white text-[10px] font-semibold">Launching…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <p className="text-center text-sm text-muted-foreground py-8">No results for "{search}"</p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RemotePage() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read ?tab= from URL for PWA shortcut deep-linking
  const initialTab = (new URLSearchParams(window.location.search).get('tab') ?? 'remote') as RemoteTab;
  const [activeTab, setActiveTab] = useState<RemoteTab>(initialTab);

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [state, setState] = useState<PlayerState | null>(null);
  const [localTime, setLocalTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [screenCount, setScreenCount] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showCastPanel, setShowCastPanel] = useState(false);

  // Seek / volume flash overlays
  const [seekFlash, setSeekFlash] = useState<{ dir: 'left' | 'right'; secs: number; key: number } | null>(null);
  const [volFlash, setVolFlash] = useState<{ dir: 'up' | 'down'; pct: number; key: number } | null>(null);

  // QR code
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<{ url: string; qr: string } | null>(null);

  // Detect landscape orientation
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    fetch('/api/remote/qr')
      .then(r => r.json())
      .then((d: { url: string; qr: string }) => setQrData(d))
      .catch(() => {});
  }, []);

  // Tick local time forward while playing
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statePaused = state?.paused;
  const stateDuration = state?.duration;
  const stateCurrentTime = state?.currentTime;
  useEffect(() => {
    if (state && !statePaused && !isScrubbing) {
      tickRef.current = setInterval(() => {
        setLocalTime(t => Math.min(t + 1, stateDuration ?? 0));
      }, 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [statePaused, stateDuration, isScrubbing, state]);

  useEffect(() => {
    if (stateCurrentTime !== undefined) setLocalTime(stateCurrentTime);
  }, [stateCurrentTime]);

  // Auto-open cast panel when a cast session becomes active
  const castActive = state?.cast?.active;
  useEffect(() => {
    if (castActive) setShowCastPanel(true);
  }, [castActive]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Pass session token as query param — the /remote page may be accessed
    // from a phone on the same LAN where cookies aren't sent cross-origin.
    const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
    const tokenParam = cookieToken ? `&token=${encodeURIComponent(cookieToken)}` : '';
    const url = `${protocol}//${window.location.host}/ws/remote?role=remote&mediaId=*${tokenParam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => setStatus('no_screen');

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

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Send command ──────────────────────────────────────────────────────────

  const send = useCallback((cmd: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
  }, []);

  const sendHaptic = useCallback((cmd: Record<string, unknown>, pattern: number | number[] = 30) => {
    haptic(pattern);
    send(cmd);
  }, [send]);

  // ── Subtitle cycle ────────────────────────────────────────────────────────

  const cycleSubtitle = useCallback(() => {
    if (!state) return;
    haptic(40);
    const tracks = state.subtitleTracks ?? [];
    const current = state.activeSubtitle ?? -1;
    // -1 → first track → ... → last track → -1 (off)
    let next: number;
    if (current === -1) {
      next = tracks.length > 0 ? tracks[0].index : -1;
    } else {
      const idx = tracks.findIndex(t => t.index === current);
      next = idx >= 0 && idx < tracks.length - 1 ? tracks[idx + 1].index : -1;
    }
    send({ type: 'subtitle', track: next });
  }, [state, send]);

  // ── Swipe gestures ────────────────────────────────────────────────────────

  const handleHorizontalSwipe = useCallback((dx: number) => {
    const secs = Math.abs(dx) > 120 ? 30 : 10;
    const dir = dx > 0 ? 'right' : 'left';
    setSeekFlash({ dir, secs, key: Date.now() });
    send({ type: dx > 0 ? 'skip_forward' : 'skip_back', seconds: secs });
  }, [send]);

  const handleVerticalSwipe = useCallback((dy: number) => {
    if (!state) return;
    const delta = dy > 0 ? -0.1 : 0.1; // swipe down = lower volume
    const newVol = Math.max(0, Math.min(1, state.volume + delta));
    const pct = Math.round(newVol * 100);
    setVolFlash({ dir: delta > 0 ? 'up' : 'down', pct, key: Date.now() });
    send({ type: 'volume', level: newVol });
  }, [state, send]);

  const swipeHandlers = useSwipe(handleHorizontalSwipe, handleVerticalSwipe);

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayTime = isScrubbing ? scrubValue : localTime;
  const progress = state?.duration ? displayTime / state.duration : 0;
  const hasSubtitles = (state?.subtitleTracks?.length ?? 0) > 0;
  const subtitleActive = (state?.activeSubtitle ?? -1) !== -1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen bg-background select-none overflow-hidden relative ${isLandscape ? 'flex flex-row' : 'flex flex-col items-center'}`}>
      <title>HomeStream Remote</title>

      {/* ── Poster backdrop (blurred) ── */}
      {state?.poster && (
        <div
          className="fixed inset-0 -z-10 pointer-events-none"
          aria-hidden="true"
        >
          <img
            src={state.poster}
            alt=""
            className="w-full h-full object-cover opacity-20 blur-2xl scale-110"
          />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LANDSCAPE LAYOUT — poster left, controls right
      ══════════════════════════════════════════════════════════════════════ */}
      {isLandscape && status === 'connected' && state ? (
        <>
          {/* Left: poster */}
          <div
            className="relative flex-shrink-0 w-[40vw] h-screen overflow-hidden"
            {...swipeHandlers}
          >
            {state.poster ? (
              <img
                src={state.poster}
                alt={state.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-card flex items-center justify-center">
                <Film className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/80" />

            {/* Seek / volume flash overlays */}
            <AnimatePresence>
              {seekFlash && <SeekFlash key={seekFlash.key} dir={seekFlash.dir} secs={seekFlash.secs} />}
            </AnimatePresence>
            <AnimatePresence>
              {volFlash && <VolumeFlash key={volFlash.key} dir={volFlash.dir} pct={volFlash.pct} />}
            </AnimatePresence>

            {/* Swipe hint */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-[10px] text-white/40">← swipe to seek · ↕ swipe for volume</p>
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex-1 flex flex-col justify-between px-6 py-4 overflow-y-auto">
            <LandscapeControls
              state={state}
              displayTime={displayTime}
              progress={progress}
              setIsScrubbing={setIsScrubbing}
              setScrubValue={setScrubValue}
              showSpeedPicker={showSpeedPicker}
              setShowSpeedPicker={setShowSpeedPicker}
              hasSubtitles={hasSubtitles}
              subtitleActive={subtitleActive}
              screenCount={screenCount}
              qrData={qrData}
              showQr={showQr}
              setShowQr={setShowQr}
              showCastPanel={showCastPanel}
              setShowCastPanel={setShowCastPanel}
              send={send}
              sendHaptic={sendHaptic}
              cycleSubtitle={cycleSubtitle}
            />
          </div>
        </>
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           PORTRAIT LAYOUT (default)
        ════════════════════════════════════════════════════════════════════ */
        <div className="w-full max-w-sm mx-auto flex flex-col px-4 pt-5 pb-24">

          {/* Header bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <span className="font-heading text-foreground font-bold tracking-wide">Remote</span>
            </div>
            <div className="flex items-center gap-2">
              {qrData && (
                <button
                  onClick={() => setShowQr(v => !v)}
                  className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Show QR code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}
              <StatusBadge status={status} screenCount={screenCount} />
            </div>
          </div>

          {/* QR modal */}
          <AnimatePresence>
            {showQr && qrData && <QrModal qrData={qrData} onClose={() => setShowQr(false)} />}
          </AnimatePresence>

          {/* Idle / connecting state — only on remote tab */}
          <AnimatePresence>
            {activeTab === 'remote' && status !== 'connected' && (
              <IdleState
                status={status}
                onRetry={() => {
                  if (reconnectRef.current) clearTimeout(reconnectRef.current);
                  connect();
                }}
              />
            )}
          </AnimatePresence>

          {/* Player controls — only on remote tab */}
          <AnimatePresence>
            {activeTab === 'remote' && status === 'connected' && state && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-5"
              >
                {/* Poster + now playing */}
                <div
                  className="relative rounded-2xl overflow-hidden aspect-[2/3] max-h-52 w-full bg-card border border-border"
                  {...swipeHandlers}
                >
                  {state.poster ? (
                    <img
                      src={state.poster}
                      alt={state.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-[10px] text-white/60 uppercase tracking-wider">Now Playing</p>
                    <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{state.title}</p>
                  </div>

                  {/* Seek / volume flash overlays */}
                  <AnimatePresence>
                    {seekFlash && <SeekFlash key={seekFlash.key} dir={seekFlash.dir} secs={seekFlash.secs} />}
                  </AnimatePresence>
                  <AnimatePresence>
                    {volFlash && <VolumeFlash key={volFlash.key} dir={volFlash.dir} pct={volFlash.pct} />}
                  </AnimatePresence>

                  {/* Swipe hint */}
                  <div className="absolute top-2 right-2">
                    <span className="text-[9px] text-white/30 bg-black/30 rounded px-1.5 py-0.5">swipe to seek</span>
                  </div>
                </div>

                {/* Seek bar */}
                <SeekBar
                  state={state}
                  displayTime={displayTime}
                  progress={progress}
                  setIsScrubbing={setIsScrubbing}
                  setScrubValue={setScrubValue}
                  send={send}
                />

                {/* Main controls */}
                <div className="flex items-center justify-center gap-6">
                  <ControlBtn
                    onClick={() => sendHaptic({ type: 'skip_back', seconds: 10 })}
                    label="−10s"
                    size="md"
                  >
                    <SkipBack className="w-5 h-5" />
                  </ControlBtn>

                  <button
                    onClick={() => sendHaptic({ type: state.paused ? 'play' : 'pause' }, [30, 20, 30])}
                    className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-lg shadow-primary/30 transition-all"
                  >
                    {state.paused
                      ? <Play className="w-8 h-8 text-primary-foreground fill-primary-foreground ml-1" />
                      : <Pause className="w-8 h-8 text-primary-foreground fill-primary-foreground" />
                    }
                  </button>

                  <ControlBtn
                    onClick={() => sendHaptic({ type: 'skip_forward', seconds: 10 })}
                    label="+10s"
                    size="md"
                  >
                    <SkipForward className="w-5 h-5" />
                  </ControlBtn>
                </div>

                {/* Secondary controls */}
                <div className="flex items-center justify-center flex-wrap gap-2">
                  <PillBtn onClick={() => sendHaptic({ type: 'skip_intro' })}>
                    <FastForward className="w-3.5 h-3.5" />
                    Skip Intro
                  </PillBtn>

                  {state.hasNextEpisode && (
                    <PillBtn onClick={() => sendHaptic({ type: 'next_episode' })}>
                      Next Ep
                      <ChevronRight className="w-3.5 h-3.5" />
                    </PillBtn>
                  )}

                  {/* Subtitle toggle */}
                  {hasSubtitles && (
                    <PillBtn
                      onClick={cycleSubtitle}
                      active={subtitleActive}
                      title={subtitleActive
                        ? `Subtitles: ${state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'On'}`
                        : 'Subtitles off'}
                    >
                      <Subtitles className="w-3.5 h-3.5" />
                      {subtitleActive
                        ? (state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'CC')
                        : 'CC'}
                    </PillBtn>
                  )}

                  {/* Speed picker */}
                  <SpeedPicker
                    speed={state.speed}
                    show={showSpeedPicker}
                    setShow={setShowSpeedPicker}
                    onSelect={s => sendHaptic({ type: 'speed', rate: s })}
                  />

                  {/* Fullscreen */}
                  <PillBtn onClick={() => sendHaptic({ type: 'fullscreen' })}>
                    <Maximize2 className="w-3.5 h-3.5" />
                  </PillBtn>

                  {/* Cast */}
                  <PillBtn
                    onClick={() => {
                      haptic(30);
                      if (state.cast?.active) {
                        setShowCastPanel(v => !v);
                      } else {
                        send({ type: 'cast' });
                      }
                    }}
                    active={state.cast?.active || showCastPanel}
                    title={state.cast?.active ? 'Manage cast session' : 'Cast to Chromecast'}
                  >
                    <Cast className="w-3.5 h-3.5" />
                    {state.cast?.active ? 'Casting' : 'Cast'}
                  </PillBtn>
                </div>

                {/* Cast session panel */}
                <AnimatePresence>
                  {showCastPanel && state.cast?.active && (
                    <CastPanel
                      cast={state.cast}
                      send={send}
                      onClose={() => setShowCastPanel(false)}
                    />
                  )}
                </AnimatePresence>

                {/* Volume */}
                <VolumeControl state={state} send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Browse tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'browse' && (
              <motion.div
                key="browse"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <BrowseTab send={send} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Bottom tab bar — always visible in portrait, hidden in landscape ── */}
      {!isLandscape && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border">
          <div className="flex max-w-sm mx-auto">
            <button
              onClick={() => { haptic(20); setActiveTab('remote'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative ${
                activeTab === 'remote' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Tv2 className="w-5 h-5" />
              Remote
              {status === 'connected' && (
                <span className="absolute top-2 right-[calc(50%-20px)] w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('browse'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                activeTab === 'browse' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Film className="w-5 h-5" />
              Browse
            </button>
          </div>
          {/* Safe area spacer for iOS home indicator */}
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, screenCount }: { status: ConnStatus; screenCount: number }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
      status === 'connected'  ? 'bg-green-500/10 border-green-500/30 text-green-400' :
      status === 'connecting' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
      status === 'no_screen'  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
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
  );
}

function IdleState({ status, onRetry }: { status: ConnStatus; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full text-center py-12"
    >
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
        <Film className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-foreground font-semibold mb-2">
        {status === 'connecting' ? 'Connecting to HomeStream…' :
         status === 'no_screen'  ? 'No video playing' :
                                   'Connection lost — reconnecting…'}
      </p>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
        {status === 'no_screen'
          ? 'Open HomeStream on your TV or desktop and start playing something.'
          : 'Make sure HomeStream is running on your home network.'}
      </p>
      {status === 'disconnected' && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 mx-auto text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Retry now
        </button>
      )}
    </motion.div>
  );
}

function QrModal({ qrData, onClose }: { qrData: { url: string; qr: string }; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.15 }}
      className="w-full mb-5 bg-card border border-border rounded-2xl p-5 shadow-xl"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Open on another device</p>
          <p className="text-xs text-muted-foreground mt-0.5">Scan to open this remote on your phone</p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-background p-2 border border-border"
        dangerouslySetInnerHTML={{ __html: qrData.qr }}
      />
      <div className="mt-3 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
        <code className="text-[11px] text-muted-foreground flex-1 truncate">{qrData.url}</code>
        <a href={qrData.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 flex-shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">Both devices must be on the same Wi-Fi network</p>
    </motion.div>
  );
}

function SeekBar({
  state, displayTime, progress, setIsScrubbing, setScrubValue, send,
}: {
  state: PlayerState;
  displayTime: number;
  progress: number;
  setIsScrubbing: (v: boolean) => void;
  setScrubValue: (v: number) => void;
  send: (cmd: Record<string, unknown>) => void;
}) {
  return (
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
  );
}

function VolumeControl({ state, send }: { state: PlayerState; send: (cmd: Record<string, unknown>) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => { haptic(20); send({ type: 'volume', level: state.volume === 0 ? 0.5 : 0 }); }}>
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
  );
}

function ControlBtn({
  onClick, label, size, children,
}: {
  onClick: () => void;
  label?: string;
  size: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const sz = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
    >
      <div className={`${sz} rounded-full bg-card border border-border flex items-center justify-center`}>
        {children}
      </div>
      {label && <span className="text-[10px]">{label}</span>}
    </button>
  );
}

function PillBtn({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium active:scale-95 transition-all ${
        active
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'bg-card border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SpeedPicker({
  speed, show, setShow, onSelect,
}: {
  speed: number;
  show: boolean;
  setShow: (v: boolean) => void;
  onSelect: (s: number) => void;
}) {
  return (
    <div className="relative">
      <PillBtn onClick={() => setShow(!show)}>
        <Zap className="w-3.5 h-3.5" />
        {speed}×
      </PillBtn>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10"
          >
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => { onSelect(s); setShow(false); }}
                className={`block w-full px-5 py-2 text-sm text-left transition-colors ${
                  speed === s ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-accent/10'
                }`}
              >
                {s}×
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cast session panel ────────────────────────────────────────────────────────

function CastPanel({
  cast, send, onClose,
}: {
  cast: CastSessionInfo;
  send: (cmd: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const progress = (cast.duration ?? 0) > 0
    ? ((cast.currentTime ?? 0) / (cast.duration ?? 1)) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="w-full bg-card border border-border rounded-2xl p-4 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tv2 className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-semibold text-foreground">
            Casting{cast.deviceName ? ` · ${cast.deviceName}` : ' to TV'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Progress bar */}
      {(cast.duration ?? 0) > 0 && (
        <div className="mb-3">
          <input
            type="range"
            min={0}
            max={cast.duration ?? 100}
            step={1}
            value={cast.currentTime ?? 0}
            onChange={e => {
              haptic(20);
              send({ type: 'cast_seek', position: Number(e.target.value) });
            }}
            className="w-full h-2 rounded-full accent-primary cursor-pointer"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--muted)) ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
            <span>{formatTime(cast.currentTime ?? 0)}</span>
            <span>{formatTime(cast.duration ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => { haptic(30); send({ type: 'cast_playpause' }); }}
          className="w-12 h-12 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-md shadow-primary/30 transition-all"
        >
          {cast.isPaused
            ? <Play className="w-5 h-5 text-primary-foreground fill-primary-foreground ml-0.5" />
            : <Pause className="w-5 h-5 text-primary-foreground fill-primary-foreground" />
          }
        </button>
        <button
          onClick={() => { haptic([30, 20, 30]); send({ type: 'cast_stop' }); }}
          className="w-10 h-10 rounded-full bg-card border border-border hover:bg-destructive/10 hover:border-destructive/40 active:scale-95 flex items-center justify-center transition-all"
          title="Stop casting"
        >
          <Square className="w-4 h-4 text-muted-foreground fill-muted-foreground" />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { haptic(20); send({ type: 'cast_volume', level: (cast.muted || (cast.volume ?? 1) === 0) ? 0.5 : 0 }); }}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {(cast.muted || (cast.volume ?? 1) === 0)
            ? <VolumeX className="w-4 h-4" />
            : <Volume2 className="w-4 h-4" />
          }
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={cast.muted ? 0 : (cast.volume ?? 1)}
          onChange={e => send({ type: 'cast_volume', level: Number(e.target.value) })}
          className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) ${(cast.muted ? 0 : (cast.volume ?? 1)) * 100}%, hsl(var(--muted)) ${(cast.muted ? 0 : (cast.volume ?? 1)) * 100}%)`,
          }}
        />
        <span className="text-[10px] text-muted-foreground w-7 text-right font-mono flex-shrink-0">
          {cast.muted ? '0%' : `${Math.round((cast.volume ?? 1) * 100)}%`}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
        Volume controls your TV via HDMI-CEC
      </p>
    </motion.div>
  );
}

// ── Landscape controls panel ──────────────────────────────────────────────────

function LandscapeControls({
  state, displayTime, progress, setIsScrubbing, setScrubValue,
  showSpeedPicker, setShowSpeedPicker, hasSubtitles, subtitleActive,
  screenCount, qrData, showQr, setShowQr, showCastPanel, setShowCastPanel,
  send, sendHaptic, cycleSubtitle,
}: {
  state: PlayerState;
  displayTime: number;
  progress: number;
  setIsScrubbing: (v: boolean) => void;
  setScrubValue: (v: number) => void;
  showSpeedPicker: boolean;
  setShowSpeedPicker: (v: boolean) => void;
  hasSubtitles: boolean;
  subtitleActive: boolean;
  screenCount: number;
  qrData: { url: string; qr: string } | null;
  showQr: boolean;
  setShowQr: (v: boolean) => void;
  showCastPanel: boolean;
  setShowCastPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
  send: (cmd: Record<string, unknown>) => void;
  sendHaptic: (cmd: Record<string, unknown>, pattern?: number | number[]) => void;
  cycleSubtitle: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 h-full justify-between py-2">
      {/* Title + status */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Now Playing</p>
          <p className="text-foreground font-semibold text-base leading-tight line-clamp-2">{state.title}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {qrData && (
            <button onClick={() => setShowQr(!showQr)} className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground">
              <QrCode className="w-3.5 h-3.5" />
            </button>
          )}
          <StatusBadge status="connected" screenCount={screenCount} />
        </div>
      </div>

      {/* Seek bar */}
      <SeekBar
        state={state}
        displayTime={displayTime}
        progress={progress}
        setIsScrubbing={setIsScrubbing}
        setScrubValue={setScrubValue}
        send={send}
      />

      {/* Main controls */}
      <div className="flex items-center justify-center gap-5">
        <ControlBtn onClick={() => sendHaptic({ type: 'skip_back', seconds: 10 })} label="−10s" size="md">
          <SkipBack className="w-5 h-5" />
        </ControlBtn>
        <button
          onClick={() => sendHaptic({ type: state.paused ? 'play' : 'pause' }, [30, 20, 30])}
          className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 active:scale-95 flex items-center justify-center shadow-lg shadow-primary/30 transition-all"
        >
          {state.paused
            ? <Play className="w-7 h-7 text-primary-foreground fill-primary-foreground ml-1" />
            : <Pause className="w-7 h-7 text-primary-foreground fill-primary-foreground" />
          }
        </button>
        <ControlBtn onClick={() => sendHaptic({ type: 'skip_forward', seconds: 10 })} label="+10s" size="md">
          <SkipForward className="w-5 h-5" />
        </ControlBtn>
      </div>

      {/* Secondary + volume */}
      <div className="flex flex-wrap items-center gap-2">
        <PillBtn onClick={() => sendHaptic({ type: 'skip_intro' })}>
          <FastForward className="w-3.5 h-3.5" /> Skip Intro
        </PillBtn>
        {state.hasNextEpisode && (
          <PillBtn onClick={() => sendHaptic({ type: 'next_episode' })}>
            Next Ep <ChevronRight className="w-3.5 h-3.5" />
          </PillBtn>
        )}
        {hasSubtitles && (
          <PillBtn onClick={cycleSubtitle} active={subtitleActive}>
            <Subtitles className="w-3.5 h-3.5" />
            {subtitleActive
              ? (state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'CC')
              : 'CC'}
          </PillBtn>
        )}
        <SpeedPicker
          speed={state.speed}
          show={showSpeedPicker}
          setShow={setShowSpeedPicker}
          onSelect={s => sendHaptic({ type: 'speed', rate: s })}
        />
        <PillBtn onClick={() => sendHaptic({ type: 'fullscreen' })}>
          <Maximize2 className="w-3.5 h-3.5" />
        </PillBtn>
        <PillBtn
          onClick={() => {
            haptic(30);
            if (state.cast?.active) {
              setShowCastPanel(v => !v);
            } else {
              send({ type: 'cast' });
            }
          }}
          active={state.cast?.active || showCastPanel}
          title={state.cast?.active ? 'Manage cast session' : 'Cast to Chromecast'}
        >
          <Cast className="w-3.5 h-3.5" />
          {state.cast?.active ? 'Casting' : 'Cast'}
        </PillBtn>
      </div>

      {/* Cast session panel */}
      <AnimatePresence>
        {showCastPanel && state.cast?.active && (
          <CastPanel
            cast={state.cast}
            send={send}
            onClose={() => setShowCastPanel(false)}
          />
        )}
      </AnimatePresence>

      <VolumeControl state={state} send={send} />
    </div>
  );
}
