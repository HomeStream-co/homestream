/**
 * ChromecastButton — Chromecast stub.
 * Replace with full implementation when you send src/components/ChromecastButton.tsx.
 */
import { useEffect } from 'react';

interface CastControl {
  playPause: () => void;
  stop: () => void;
  seek: (position: number) => void;
  setVolume: (level: number) => void;
}

interface CastStateInfo {
  active: boolean;
  deviceName?: string;
  state?: string;
}

interface Props {
  streamUrl: string;
  title: string;
  poster?: string;
  currentTime?: number;
  onTriggerRef?: (fn: () => void) => void;
  onControlRef?: (ctrl: CastControl) => void;
  onCastStateChange?: (info: CastStateInfo) => void;
}

export default function ChromecastButton({ onTriggerRef, onControlRef }: Props) {
  useEffect(() => {
    if (onTriggerRef) onTriggerRef(() => alert('Chromecast not yet configured.'));
    if (onControlRef) onControlRef({
      playPause: () => {},
      stop: () => {},
      seek: () => {},
      setVolume: () => {},
    });
  }, [onTriggerRef, onControlRef]);

  return (
    <button
      title="Cast to Chromecast"
      className="text-white/50 hover:text-white transition-colors"
      onClick={() => alert('Chromecast not yet configured.')}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 8.5A12.5 12.5 0 0 1 14.5 21" />
        <path d="M2 13.5A7.5 7.5 0 0 1 9.5 21" />
        <circle cx="2.5" cy="20.5" r="1.5" fill="currentColor" />
        <rect x="6" y="3" width="16" height="12" rx="1" />
      </svg>
    </button>
  );
}
