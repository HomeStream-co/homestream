/**
 * CastTab — Phone-side DLNA/UPnP device picker
 *
 * Lets the user scan for TVs on the LAN and cast the currently-playing
 * item directly from their phone, without needing to touch the TV browser.
 *
 * Flow:
 *   1. Tab mounts → auto-scan via GET /api/cast/devices
 *   2. User taps a device → POST /api/cast/send  (server pushes SOAP to TV)
 *   3. Success → green tick + "Now casting" banner
 *   4. If nothing is playing, shows a helpful "start something first" prompt
 *
 * The server already handles SSDP discovery + SOAP SetAVTransportURI, so
 * this component is pure UI — no raw sockets needed on the phone.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tv2, Wifi, WifiOff, RefreshCw, Check, AlertCircle,
  Loader2, Cast, Play, Volume2, X, Info,
} from 'lucide-react';
import { remoteAuthHeaders } from './types';
import type { PlayerState } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DLNADevice {
  id: string;
  name: string;
  type: string;
  location: string;
  manufacturer?: string;
  modelName?: string;
  isRenderer: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DeviceIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes('tv') || t.includes('renderer') || t.includes('mediaplayer')) {
    return <Tv2 className="w-5 h-5" />;
  }
  return <Cast className="w-5 h-5" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CastTabProps {
  /** Current player state — used to know what's playing and build the stream URL */
  playerState: PlayerState | null;
}

export default function CastTab({ playerState }: CastTabProps) {
  const [devices, setDevices]       = useState<DLNADevice[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [scanned, setScanned]       = useState(false);
  const [scanError, setScanError]   = useState('');
  const [castingId, setCastingId]   = useState<string | null>(null);
  const [successId, setSuccessId]   = useState<string | null>(null);
  const [castError, setCastError]   = useState('');
  const [activeDevice, setActiveDevice] = useState<DLNADevice | null>(null);

  // ── Scan ──────────────────────────────────────────────────────────────────

  const scan = useCallback(async () => {
    setScanning(true);
    setScanError('');
    setDevices([]);
    setSuccessId(null);
    setCastError('');
    setActiveDevice(null);
    try {
      const res = await fetch('/api/cast/devices', {
        credentials: 'include',
        headers: remoteAuthHeaders(),
      });
      const data = await res.json() as { devices?: DLNADevice[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDevices(data.devices ?? []);
      setScanned(true);
    } catch (err) {
      setScanError(String(err));
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, []);

  // Auto-scan on mount
  useEffect(() => {
    scan();
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cast ──────────────────────────────────────────────────────────────────

  const castTo = async (device: DLNADevice) => {
    if (!playerState?.mediaId) {
      setCastError('Nothing is playing. Start a video first, then cast it.');
      return;
    }
    setCastingId(device.id);
    setCastError('');
    setSuccessId(null);
    try {
      // Ask the server to cast the currently-playing media to this device.
      // The server resolves the HLS/stream URL and sends SOAP to the TV.
      const res = await fetch('/api/cast/send', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...remoteAuthHeaders(),
        },
        body: JSON.stringify({
          deviceLocation: device.location,
          mediaId: playerState.mediaId,
          title: playerState.title,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; hint?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Cast failed');
      }
      setSuccessId(device.id);
      setActiveDevice(device);
    } catch (err) {
      setCastError(String(err));
    } finally {
      setCastingId(null);
    }
  };

  const stopCast = async () => {
    if (!activeDevice) return;
    try {
      await fetch('/api/cast/stop', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...remoteAuthHeaders(),
        },
        body: JSON.stringify({ deviceLocation: activeDevice.location }),
      });
    } catch { /* non-fatal — ignore */ }
    setSuccessId(null);
    setActiveDevice(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isPlaying = !!playerState?.mediaId;
  const renderers = devices.filter(d => d.isRenderer);
  const others    = devices.filter(d => !d.isRenderer);

  return (
    <div className="flex flex-col gap-4 px-1 pb-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cast to TV</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            DLNA/UPnP devices on your Wi-Fi
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors disabled:opacity-50"
          title="Scan again"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {/* ── Now playing pill ── */}
      {isPlaying ? (
        <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/25 rounded-xl px-3 py-2.5">
          <Play className="w-3.5 h-3.5 text-primary flex-shrink-0 fill-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">Now playing</p>
            <p className="text-xs text-foreground font-semibold truncate">{playerState!.title}</p>
          </div>
          <Volume2 className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
        </div>
      ) : (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Start playing something on the <strong className="text-foreground">Remote</strong> tab first, then come back here to cast it to a TV.
          </p>
        </div>
      )}

      {/* ── Active cast banner ── */}
      <AnimatePresence>
        {activeDevice && successId && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2.5"
          >
            <Tv2 className="w-4 h-4 text-green-400 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-green-400">Casting to {activeDevice.name}</p>
              <p className="text-[10px] text-muted-foreground">Use the Remote tab to control playback</p>
            </div>
            <button
              onClick={stopCast}
              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Stop casting"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {(scanError || castError) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2.5"
          >
            <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-destructive font-medium">{scanError || castError}</p>
              {scanError && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Make sure your TV is on the same Wi-Fi and DLNA is enabled.
                </p>
              )}
            </div>
            <button
              onClick={() => { setScanError(''); setCastError(''); }}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scanning spinner ── */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="relative">
            <Wifi className="w-10 h-10 text-muted-foreground/30" />
            <Loader2 className="w-5 h-5 text-primary animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-sm text-muted-foreground">Scanning your network…</p>
          <p className="text-[11px] text-muted-foreground/60 text-center max-w-[220px]">
            Looking for DLNA/UPnP media renderers (smart TVs, Kodi, etc.)
          </p>
        </div>
      )}

      {/* ── Device list ── */}
      {!scanning && scanned && (
        <>
          {renderers.length === 0 && others.length === 0 ? (
            /* No devices found */
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <WifiOff className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No devices found</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px] leading-relaxed">
                  Make sure your TV is on and DLNA/UPnP is enabled in its settings.
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-left text-[11px] text-muted-foreground space-y-1.5 max-w-[260px]">
                <p className="font-semibold text-foreground text-xs">Troubleshooting</p>
                <p>• TV must be on the <strong className="text-foreground">same Wi-Fi</strong> as the server</p>
                <p>• Enable <strong className="text-foreground">DLNA / UPnP</strong> in TV network settings</p>
                <p>• Samsung: Settings → General → Network → Expert Settings → DLNA</p>
                <p>• LG: Settings → Connection → Device Connector → TV</p>
                <p>• Chromecast: install <strong className="text-foreground">BubbleUPnP</strong> app on the Chromecast</p>
              </div>
              <button
                onClick={scan}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Scan again
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Media renderers (TVs) — shown first */}
              {renderers.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-1">
                    Media Renderers ({renderers.length})
                  </p>
                  {renderers.map(device => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      isCasting={castingId === device.id}
                      isSuccess={successId === device.id}
                      isPlaying={isPlaying}
                      onCast={castTo}
                    />
                  ))}
                </>
              )}

              {/* Other UPnP devices */}
              {others.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-1 mt-2">
                    Other Devices ({others.length})
                  </p>
                  {others.map(device => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      isCasting={castingId === device.id}
                      isSuccess={successId === device.id}
                      isPlaying={isPlaying}
                      onCast={castTo}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── How it works footer ── */}
      {!scanning && scanned && devices.length > 0 && (
        <div className="bg-muted/40 rounded-xl p-3 text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">How it works:</strong> Tap a device to push the
          current video to your TV via DLNA. The TV fetches the HLS stream directly from your
          HomeStream server — no cables, no screen mirroring.
        </div>
      )}
    </div>
  );
}

// ── Device row ────────────────────────────────────────────────────────────────

function DeviceRow({
  device, isCasting, isSuccess, isPlaying, onCast,
}: {
  device: DLNADevice;
  isCasting: boolean;
  isSuccess: boolean;
  isPlaying: boolean;
  onCast: (d: DLNADevice) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onCast(device)}
      disabled={isCasting || !isPlaying}
      className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
        isSuccess
          ? 'bg-green-500/10 border-green-500/30'
          : isCasting
            ? 'bg-primary/10 border-primary/30'
            : isPlaying
              ? 'bg-card border-border hover:border-primary/40 hover:bg-card/80 active:bg-muted'
              : 'bg-card/50 border-border/50 opacity-60 cursor-not-allowed'
      }`}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isSuccess ? 'bg-green-500/20 text-green-400' :
        isCasting ? 'bg-primary/20 text-primary' :
                    'bg-muted text-muted-foreground'
      }`}>
        {isCasting
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : isSuccess
            ? <Check className="w-5 h-5" />
            : <DeviceIcon type={device.type} />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${
          isSuccess ? 'text-green-400' : 'text-foreground'
        }`}>
          {device.name}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {device.manufacturer
            ? `${device.manufacturer}${device.modelName ? ` · ${device.modelName}` : ''}`
            : device.type}
        </p>
      </div>

      {/* Action label */}
      <span className={`text-[10px] font-semibold flex-shrink-0 ${
        isSuccess ? 'text-green-400' :
        isCasting ? 'text-primary' :
        isPlaying  ? 'text-muted-foreground' :
                     'text-muted-foreground/40'
      }`}>
        {isSuccess ? 'Casting' : isCasting ? 'Sending…' : isPlaying ? 'Cast' : 'No video'}
      </span>
    </motion.button>
  );
}
