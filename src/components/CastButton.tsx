/**
 * CastButton — DLNA/UPnP casting for HomeStream
 *
 * How it works:
 *  1. User clicks the cast icon
 *  2. We scan the LAN for DLNA MediaRenderer devices (smart TVs, Kodi, etc.)
 *  3. User picks a device from the list
 *  4. We send the stream URL to the device via UPnP AVTransport SOAP
 *  5. The TV starts playing the video directly from the HomeStream server
 *
 * Fallback: "Copy stream URL" button for manual casting via VLC, Infuse, etc.
 *
 * Works with:
 *  - Samsung Smart TVs (Tizen)
 *  - LG Smart TVs (webOS)
 *  - Sony Bravia TVs
 *  - Vizio SmartCast TVs
 *  - Kodi / XBMC
 *  - VLC (with UPnP renderer enabled)
 *  - BubbleUPnP on Android
 *  - Any DLNA-certified MediaRenderer
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cast, Loader2, Tv2, Check, Copy, WifiOff,
  RefreshCw, X, Wifi, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DLNADevice {
  id: string;
  name: string;
  manufacturer?: string;
  modelName?: string;
  isRenderer: boolean;
  location: string;
}

interface CastButtonProps {
  /** Full HTTP URL to the video stream, e.g. http://192.168.1.10:3000/api/stream/movie.mp4 */
  streamUrl: string;
  /** Title shown on the TV's now-playing screen */
  title: string;
  /** Extra className for the trigger button */
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLocalStreamUrl(path: string): string {
  // Convert a relative /api/stream/... path to a full LAN URL
  if (path.startsWith('http')) return path;
  const { protocol, hostname, port } = window.location;
  const p = port ? `:${port}` : '';
  return `${protocol}//${hostname}${p}${path}`;
}

// ── Device row ────────────────────────────────────────────────────────────────

function DeviceRow({
  device,
  casting,
  castSuccess,
  onCast,
}: {
  device: DLNADevice;
  casting: boolean;
  castSuccess: boolean;
  onCast: (device: DLNADevice) => void;
}) {
  return (
    <button
      onClick={() => onCast(device)}
      disabled={casting || castSuccess}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left group ${
        castSuccess
          ? 'bg-green-500/10 border border-green-500/30'
          : 'hover:bg-muted/60 border border-transparent hover:border-border'
      }`}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        castSuccess ? 'bg-green-500/20' : 'bg-muted'
      }`}>
        {casting ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : castSuccess ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Tv2 className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight truncate ${castSuccess ? 'text-green-400' : 'text-foreground'}`}>
          {castSuccess ? 'Now casting!' : device.name}
        </p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {castSuccess
            ? device.name
            : [device.manufacturer, device.modelName].filter(Boolean).join(' · ') || 'DLNA Renderer'}
        </p>
      </div>

      {!casting && !castSuccess && (
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CastButton({ streamUrl, title, className = '' }: CastButtonProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState('');
  const [castingId, setCastingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanError('');
    setDevices([]);
    setSuccessId(null);
    try {
      const res = await fetch('/api/cast/devices', { credentials: 'include' });
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

  // Auto-scan when panel opens
  useEffect(() => {
    if (open && !scanned && !scanning) scan();
  }, [open, scanned, scanning, scan]);

  const castTo = async (device: DLNADevice) => {
    setCastingId(device.id);
    setSuccessId(null);
    try {
      const fullUrl = getLocalStreamUrl(streamUrl);
      const res = await fetch('/api/cast/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceLocation: device.location,
          streamUrl: fullUrl,
          title,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; hint?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Cast failed');
      setSuccessId(device.id);
      // Auto-close after 2.5s
      setTimeout(() => setOpen(false), 2500);
    } catch (err) {
      setScanError(String(err));
    } finally {
      setCastingId(null);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getLocalStreamUrl(streamUrl));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const isCasting = !!castingId;
  const hasSuccess = !!successId;

  return (
    <div ref={panelRef} className="relative">
      {/* Cast trigger button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        title="Cast to TV"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
          open || hasSuccess
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'bg-black/40 hover:bg-black/60 text-white border border-white/10'
        } ${className}`}
      >
        <Cast className={`w-4 h-4 ${isCasting ? 'animate-pulse' : ''}`} />
        <span className="hidden sm:inline">Cast</span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 right-0 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Cast className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Cast to TV</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={scan}
                  disabled={scanning}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Rescan for devices"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3">
              {/* Scanning */}
              {scanning && (
                <div className="flex flex-col items-center py-6 gap-3">
                  <div className="relative">
                    <Wifi className="w-8 h-8 text-primary" />
                    <motion.div
                      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border-2 border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Scanning your network for TVs and media players…
                    <br />
                    <span className="text-[10px] opacity-70">Takes about 3 seconds</span>
                  </p>
                </div>
              )}

              {/* Error */}
              {!scanning && scanError && (
                <div className="px-2 py-3">
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-3">
                    <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400 leading-snug">{scanError}</p>
                  </div>
                  <button onClick={scan} className="w-full text-xs text-primary hover:text-primary/80 text-center">
                    Try again
                  </button>
                </div>
              )}

              {/* No devices found */}
              {!scanning && scanned && devices.length === 0 && !scanError && (
                <div className="text-center py-4 px-2">
                  <Tv2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">No DLNA devices found</p>
                  <p className="text-[10px] text-muted-foreground/70 leading-snug mb-3">
                    Make sure your TV is on the same WiFi network and DLNA/UPnP is enabled in its settings.
                  </p>
                  <button onClick={scan} className="text-xs text-primary hover:text-primary/80">
                    Scan again
                  </button>
                </div>
              )}

              {/* Device list */}
              {!scanning && devices.length > 0 && (
                <div className="space-y-1 mb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-1 mb-2">
                    {devices.length} device{devices.length !== 1 ? 's' : ''} found
                  </p>
                  {devices.map(device => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      casting={castingId === device.id}
                      castSuccess={successId === device.id}
                      onCast={castTo}
                    />
                  ))}
                </div>
              )}

              {/* Divider + copy URL fallback */}
              {!scanning && scanned && (
                <div className={devices.length > 0 ? 'border-t border-border pt-3' : ''}>
                  <p className="text-[10px] text-muted-foreground mb-2 px-1">
                    {devices.length > 0 ? 'Or cast manually:' : 'Manual casting:'}
                  </p>
                  <button
                    onClick={copyUrl}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      {copied ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`text-xs font-medium ${copied ? 'text-green-400' : 'text-foreground'}`}>
                        {copied ? 'Copied!' : 'Copy stream URL'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Open in VLC, Infuse, or any media player
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Footer tip */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20">
              <p className="text-[10px] text-muted-foreground leading-snug">
                Works with Samsung, LG, Sony, Vizio TVs and Kodi. TV must be on the same WiFi network.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
