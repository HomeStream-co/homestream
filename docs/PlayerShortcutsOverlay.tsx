/**
 * PlayerShortcutsOverlay — full keyboard shortcut reference modal.
 * Triggered by pressing ? or clicking the keyboard icon in the control bar.
 */

import { motion } from 'motion/react';
import { Keyboard, X as XIcon } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['Space / K', 'Play / Pause'],
  ['← / J', 'Rewind 10s'],
  ['→ / L', 'Forward 10s'],
  ['↑ / ↓', 'Volume ±10%'],
  ['M', 'Mute / Unmute'],
  ['F', 'Fullscreen'],
  ['P', 'Picture-in-Picture'],
  ['C', 'Cycle Captions'],
  ['A', 'Cycle Audio Track'],
  ['S', 'Cycle Speed'],
  ['< / >', 'Speed Down / Up'],
  ['I', 'Info Panel'],
  ['?', 'This Help Overlay'],
  ['Tab', 'TV Remote Navigation'],
  ['Esc', 'Close Panels'],
];

export default function PlayerShortcutsOverlay({ onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="bg-black/95 border border-white/15 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white tracking-wide">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
              <kbd className="text-[11px] text-white/60 bg-white/10 px-2 py-0.5 rounded font-mono flex-shrink-0">{key}</kbd>
              <span className="text-xs text-white/40 text-right">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/20 text-center mt-4">
          Press <kbd className="bg-white/10 px-1 rounded">?</kbd> or <kbd className="bg-white/10 px-1 rounded">Esc</kbd> to close
        </p>
      </motion.div>
    </motion.div>
  );
}
