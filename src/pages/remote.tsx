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

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Wifi, WifiOff, Film, FastForward, ChevronRight, Zap,
  RotateCcw, QrCode, X, Subtitles,
  Maximize2, Cast, ChevronUp, ChevronDown, Tv2, Square,
  Search, Sparkles, Download, Copy, Check,
} from 'lucide-react';

// ── Sub-tab components (extracted for maintainability) ─────────────────────────
import SearchTab from './remote/SearchTab';
import AITab from './remote/AITab';
import DownloadTab from './remote/DownloadTab';
import BrowseTab from './remote/BrowseTab';
import CastTab from './remote/CastTab';

// ── Types ─────────────────────────────────────────────────────────────────────
// Re-exported from ./remote/types for use in sub-components
import type { RemoteTab, CastSessionInfo, PlayerState, ConnStatus } from './remote/types';

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

// ── Search Tab (keyboard + voice) ─────────────────────────────────────────────
// Moved to ./remote/SearchTab.tsx

// ── AI Recommendation Tab ─────────────────────────────────────────────────────
// Moved to ./remote/AITab.tsx

// ── Download Tab ──────────────────────────────────────────────────────────────
// Moved to ./remote/DownloadTab.tsx

// ── Browse Tab ────────────────────────────────────────────────────────────────
// Moved to ./remote/BrowseTab.tsx
// ── Component ─────────────────────────────────────────────────────────────────

// ── Server-ready gate — shown when setup is not complete ──────────────────────

function RemoteNotConnected({ serverIP }: { serverIP: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-6 px-6 text-center">
      <title>HomeStream Remote</title>
      <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
        <Play className="w-7 h-7 text-primary-foreground fill-primary-foreground ml-0.5" />
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-2">HomeStream Remote</h1>
        <p className="text-white/50 text-sm max-w-xs">
          This remote is not connected to a HomeStream server.
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5 max-w-sm w-full text-left space-y-3">
        <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">How to connect</p>
        <p className="text-white/70 text-sm">Open HomeStream on your home PC, then visit the remote URL shown on the home screen QR code.</p>
        {serverIP ? (
          <div className="bg-black/40 rounded-xl px-4 py-3 font-mono text-sm text-primary font-bold text-center break-all">
            {serverIP}
          </div>
        ) : (
          <div className="bg-black/40 rounded-xl px-4 py-3 font-mono text-sm text-white/40 text-center">
            http://[your-server-ip]:3000/remote
          </div>
        )}
      </div>
    </div>
  );
}

export default function RemotePage() {
  // ── Server connection check ──────────────────────────────────────────────
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [serverIP, setServerIP] = useState('');

  useEffect(() => {
    // Use /api/health — always unauthenticated, includes setupComplete flag.
    // /api/setup requires an auth cookie once setup is done, which the phone
    // won't have, causing the false "not connected" error screen.
    fetch('/api/health')
      .then(r => r.json())
      .then((d: { setupComplete?: boolean }) => setServerReady(!!d.setupComplete))
      .catch(() => setServerReady(false));

    fetch('/api/network/info')
      .then(r => r.json())
      .then((d: { mdnsHostname?: string; primary?: string; lanIP?: string; port?: string | number }) => {
        // Prefer hs.local — works on all modern devices without typing an IP
        const host = d.mdnsHostname || d.primary || d.lanIP;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
          setServerIP(`http://${host}:${d.port ?? '3000'}/remote`);
        }
      })
      .catch(() => {}); // non-fatal — ignore
  }, []);

  if (serverReady === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!serverReady) return <RemoteNotConnected serverIP={serverIP} />;

  return <RemotePageInner />;
}

function RemotePageInner() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const destroyedRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRY_DELAY_MS = 30_000;
  const BASE_RETRY_DELAY_MS = 3_000;

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
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);

  // Download badge count (polled independently so tab bar stays live)
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/stremio/downloads', { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const data = await r.json() as { qbitTorrents?: { status: string }[]; jobs?: { status: string }[] };
        const all = [...(data.qbitTorrents ?? []), ...(data.jobs ?? [])];
        if (!cancelled) setActiveDownloadCount(all.filter(j => j.status === 'downloading').length);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Seek / volume flash overlays
  const [seekFlash, setSeekFlash] = useState<{ dir: 'left' | 'right'; secs: number; key: number } | null>(null);
  const [volFlash, setVolFlash] = useState<{ dir: 'up' | 'down'; pct: number; key: number } | null>(null);

  // QR code
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<{ url: string; qr: string; mdnsUrl?: string; ipUrl?: string } | null>(null);

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
      .then((d: { url: string; qr: string; mdnsUrl?: string; ipUrl?: string }) => setQrData(d))
      .catch(() => {}); // non-fatal — ignore
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
    // Don't reconnect if the component has been unmounted
    if (destroyedRef.current) return;

    // Clear any pending reconnect timer before opening a new socket —
    // prevents stacked timers when onerror fires before onclose.
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Pass session token as query param — the /remote page may be accessed
    // from a phone on the same LAN where cookies aren't sent cross-origin.
    // Priority: cookie (same-origin desktop) → localStorage (phone/TV on LAN).
    const cookieToken = document.cookie.match(/(?:^|;\s*)hs_session=([^;]+)/)?.[1] ?? '';
    const lsToken = (() => { try { return localStorage.getItem('hs_token') ?? ''; } catch { return ''; } })();
    const rawToken = cookieToken || lsToken;
    const tokenParam = rawToken ? `&token=${encodeURIComponent(rawToken)}` : '';
    const url = `${protocol}//${window.location.host}/ws/remote?role=remote&mediaId=*${tokenParam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      if (!destroyedRef.current) {
        retryCountRef.current = 0; // reset back-off on successful connection
        setStatus('no_screen');
      }
    };

    ws.onmessage = (e) => {
      if (destroyedRef.current) return;
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
      // Suppress state updates after unmount — avoids React warning and
      // prevents a ghost reconnect loop after the page is navigated away.
      if (destroyedRef.current) return;
      setStatus('disconnected');
      // Exponential back-off: 3s → 6s → 12s → … → 30s cap
      retryCountRef.current += 1;
      const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (retryCountRef.current - 1), MAX_RETRY_DELAY_MS);
      // Use connectRef so we always schedule the latest connect function,
      // not the stale closure captured when this ws instance was created.
      reconnectRef.current = setTimeout(() => connectRef.current?.(), delay);
    };

    // onerror always fires before onclose on a network drop.
    // Calling ws.close() here triggers onclose which schedules the reconnect —
    // we don't need to do anything else. Guard against double-close.
    ws.onerror = () => {
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close();
      }
    };
  }, []);

  // Keep connectRef in sync with the latest connect function
  connectRef.current = connect;

  useEffect(() => {
    destroyedRef.current = false;
    connect();
    return () => {
      // Mark destroyed first so onclose/onerror handlers are suppressed
      destroyedRef.current = true;
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

  // ── Subtitle track selector ───────────────────────────────────────────────

  const selectSubtitle = useCallback((trackIndex: number) => {
    haptic(40);
    send({ type: 'subtitle', track: trackIndex });
    setShowSubtitlePicker(false);
  }, [send]);

  /** Legacy cycle — kept for landscape pill bar */
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
        <div className="w-full max-w-sm mx-auto flex flex-col px-4 pt-5 pb-24" onClick={() => { if (showSubtitlePicker) setShowSubtitlePicker(false); if (showSpeedPicker) setShowSpeedPicker(false); }}

          {/* Header bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                <span className="font-heading text-foreground font-bold tracking-wide">Remote</span>
              </div>
              {qrData?.url && (
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5 pl-7 truncate max-w-[180px]">
                  {qrData.url.replace(/^https?:\/\//, '')}
                </span>
              )}
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
                serverUrl={qrData?.url}
                onRetry={() => {
                  if (reconnectRef.current) clearTimeout(reconnectRef.current);
                  retryCountRef.current = 0; // reset back-off on manual retry
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
                className="flex flex-col gap-4"
              >
                {/* ── Now Playing card (horizontal, compact) ── */}
                <div className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3">
                  {state.poster ? (
                    <img
                      src={state.poster}
                      alt={state.title}
                      className="w-12 h-16 object-cover rounded-xl flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
                      <Film className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Now Playing</p>
                    <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{state.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatTime(displayTime)} / {formatTime(state.duration)}</p>
                  </div>
                  {/* Fullscreen + Cast inline */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => sendHaptic({ type: 'fullscreen' })}
                      className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        haptic(30);
                        if (state.cast?.active) setShowCastPanel(v => !v);
                        else { haptic(30); setActiveTab('cast'); }
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        state.cast?.active
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                      title={state.cast?.active ? 'Casting' : 'Cast to TV'}
                    >
                      <Cast className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Seek bar ── */}
                <SeekBar
                  state={state}
                  displayTime={displayTime}
                  progress={progress}
                  setIsScrubbing={setIsScrubbing}
                  setScrubValue={setScrubValue}
                  send={send}
                />

                {/* ── Big three: skip back | play/pause | skip forward ── */}
                <div
                  className="flex items-center justify-between px-2"
                  {...swipeHandlers}
                >
                  {/* Skip back 10s */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => sendHaptic({ type: 'skip_back', seconds: 10 })}
                    className="flex flex-col items-center gap-1.5 w-20 h-20 rounded-2xl bg-card border border-border justify-center active:bg-muted transition-colors"
                  >
                    <SkipBack className="w-6 h-6 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">−10s</span>
                  </motion.button>

                  {/* Play / Pause — large center button */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => sendHaptic({ type: state.paused ? 'play' : 'pause' }, [30, 20, 30])}
                    className="w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-xl shadow-primary/40 transition-all"
                  >
                    {state.paused
                      ? <Play className="w-10 h-10 text-primary-foreground fill-primary-foreground ml-1" />
                      : <Pause className="w-10 h-10 text-primary-foreground fill-primary-foreground" />
                    }
                  </motion.button>

                  {/* Skip forward 10s */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => sendHaptic({ type: 'skip_forward', seconds: 10 })}
                    className="flex flex-col items-center gap-1.5 w-20 h-20 rounded-2xl bg-card border border-border justify-center active:bg-muted transition-colors"
                  >
                    <SkipForward className="w-6 h-6 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">+10s</span>
                  </motion.button>
                </div>

                {/* ── Volume slider ── */}
                <VolumeControl state={state} send={send} />

                {/* ── Secondary action row ── */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Skip Intro */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => sendHaptic({ type: 'skip_intro' })}
                    className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl py-3 px-1 transition-colors active:bg-muted"
                  >
                    <FastForward className="w-5 h-5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">Skip Intro</span>
                  </motion.button>

                  {/* Next Episode (always shown, dimmed if unavailable) */}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => state.hasNextEpisode && sendHaptic({ type: 'next_episode' })}
                    className={`flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                      state.hasNextEpisode
                        ? 'bg-card border-border active:bg-muted'
                        : 'bg-card/40 border-border/40 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium leading-tight text-center">Next Ep</span>
                  </motion.button>

                  {/* Subtitles */}
                  <div className="relative">
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={hasSubtitles ? () => { haptic(20); setShowSubtitlePicker(v => !v); } : undefined}
                      className={`flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                        subtitleActive
                          ? 'bg-primary/15 border-primary/40'
                          : hasSubtitles
                            ? 'bg-card border-border active:bg-muted'
                            : 'bg-card/40 border-border/40 opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <Subtitles className={`w-5 h-5 ${subtitleActive ? 'text-primary' : 'text-foreground'}`} />
                      <span className={`text-[10px] font-medium leading-tight text-center ${subtitleActive ? 'text-primary' : 'text-muted-foreground'}`}>
                        {subtitleActive
                          ? (state.subtitleTracks?.find(t => t.index === state.activeSubtitle)?.label ?? 'CC On')
                          : 'CC'}
                      </span>
                    </motion.button>

                    {/* Subtitle track picker sheet */}
                    <AnimatePresence>
                      {showSubtitlePicker && hasSubtitles && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-20 min-w-[9rem]"
                        >
                          {/* Off option */}
                          <button
                            onClick={() => selectSubtitle(-1)}
                            className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center gap-2 ${
                              (state.activeSubtitle ?? -1) === -1
                                ? 'bg-primary/20 text-primary font-semibold'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <X className="w-3.5 h-3.5 flex-shrink-0" />
                            Off
                          </button>
                          {/* Track options */}
                          {(state.subtitleTracks ?? []).map(track => (
                            <button
                              key={track.index}
                              onClick={() => selectSubtitle(track.index)}
                              className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center gap-2 ${
                                state.activeSubtitle === track.index
                                  ? 'bg-primary/20 text-primary font-semibold'
                                  : 'text-foreground hover:bg-muted'
                              }`}
                            >
                              <Subtitles className="w-3.5 h-3.5 flex-shrink-0" />
                              {track.label || track.language || `Track ${track.index + 1}`}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Speed */}
                  <div className="relative">
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => { haptic(20); setShowSpeedPicker(v => !v); }}
                      className={`w-full flex flex-col items-center gap-1.5 border rounded-2xl py-3 px-1 transition-colors ${
                        state.speed !== 1
                          ? 'bg-primary/15 border-primary/40'
                          : 'bg-card border-border active:bg-muted'
                      }`}
                    >
                      <Zap className={`w-5 h-5 ${state.speed !== 1 ? 'text-primary' : 'text-foreground'}`} />
                      <span className={`text-[10px] font-medium ${state.speed !== 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {state.speed}×
                      </span>
                    </motion.button>
                    <AnimatePresence>
                      {showSpeedPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-20 w-28"
                        >
                          {SPEEDS.map(s => (
                            <button
                              key={s}
                              onClick={() => { sendHaptic({ type: 'speed', rate: s }); setShowSpeedPicker(false); }}
                              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                                state.speed === s
                                  ? 'bg-primary/20 text-primary font-semibold'
                                  : 'text-foreground hover:bg-muted'
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

                {/* Swipe hint */}
                <p className="text-center text-[10px] text-muted-foreground/50">
                  ← swipe controls area to seek · ↕ swipe for volume
                </p>
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

          {/* ── Search tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <SearchTab send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── AI tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'ai' && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col"
              >
                <AITab send={send} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Downloads tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'downloads' && (
              <motion.div
                key="downloads"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <DownloadTab />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Cast tab content ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'cast' && (
              <motion.div
                key="cast"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <CastTab playerState={state} />
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
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative ${
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
              onClick={() => { haptic(20); setActiveTab('search'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'search' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Search className="w-5 h-5" />
              Search
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('browse'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'browse' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Film className="w-5 h-5" />
              Browse
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('downloads'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative ${
                activeTab === 'downloads' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Download className="w-5 h-5" />
              Downloads
              {/* Badge: active download count */}
              {activeDownloadCount > 0 && (
                <span className="absolute top-2 right-[calc(50%-20px)] min-w-[14px] h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                  {activeDownloadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('ai'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                activeTab === 'ai' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              Ask AI
            </button>
            <button
              onClick={() => { haptic(20); setActiveTab('cast'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative ${
                activeTab === 'cast' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Cast className="w-5 h-5" />
              Cast
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

function IdleState({
  status, onRetry, serverUrl,
}: {
  status: ConnStatus;
  onRetry: () => void;
  serverUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (!serverUrl) return;
    navigator.clipboard.writeText(serverUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full text-center py-10"
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

      {/* Server address pill */}
      {serverUrl && (
        <button
          onClick={copyUrl}
          className="mt-4 mx-auto flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 text-left hover:border-primary/40 transition-colors group"
          title="Tap to copy server address"
        >
          <Wifi className="w-3.5 h-3.5 text-primary shrink-0" />
          <code className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors font-mono">
            {serverUrl}
          </code>
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
            : <Copy className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
        </button>
      )}

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

function QrModal({ qrData, onClose }: { qrData: { url: string; qr: string; mdnsUrl?: string; ipUrl?: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(qrData.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Safely extract port from the URL (works for both hs.local and IP URLs)
  const port = (() => { try { return new URL(qrData.url).port || '3000'; } catch { return '3000'; } })();
  // Raw IP fallback URL for display (strip /remote suffix for readability)
  const ipFallback = qrData.ipUrl ?? null;

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
          <p className="text-xs text-muted-foreground mt-0.5">Scan with your phone camera</p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* QR code */}
      <div
        className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-white p-2 border border-border"
        dangerouslySetInnerHTML={{ __html: qrData.qr }}
      />

      {/* URL row with copy */}
      <button
        onClick={copyUrl}
        className="mt-3 w-full flex items-center gap-2 bg-muted/50 hover:bg-muted rounded-lg px-3 py-2 transition-colors group"
        title="Tap to copy URL"
      >
        <code className="flex-1 text-[11px] text-muted-foreground truncate text-left font-mono">{qrData.url}</code>
        {copied
          ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          : <Copy className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />}
      </button>

      {/* IP fallback hint — shown when hs.local is primary */}
      {ipFallback && ipFallback !== qrData.url && (
        <p className="mt-1.5 text-[9px] text-muted-foreground/50 font-mono text-center">
          Fallback (if hs.local fails):{' '}
          <span className="text-muted-foreground/70">{ipFallback}</span>
        </p>
      )}

      {/* Same-Wi-Fi requirement + troubleshooting */}
      <div className="mt-3 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
        <p className="text-[11px] font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" /> Requires same Wi-Fi network
        </p>
        <ul className="text-[10px] text-muted-foreground space-y-1 leading-relaxed">
          <li>• Your phone must be on the <strong className="text-foreground">same Wi-Fi</strong> as this computer</li>
          <li>• Mobile data / 4G / 5G will <strong className="text-foreground">not</strong> work — Wi-Fi only</li>
          <li>• If <code className="text-foreground">hs.local</code> doesn't load, try the fallback IP address above</li>
          <li>• Firewall blocking? Allow port <strong className="text-foreground">{port}</strong> in Windows Defender / your router</li>
        </ul>
      </div>
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
  qrData: { url: string; qr: string; mdnsUrl?: string; ipUrl?: string } | null;
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
