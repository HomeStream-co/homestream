/**
 * PlayerSeekBar — isolated, memo'd seek-bar component.
 *
 * Design goals:
 *  - Zero React re-renders on time-tick.  The parent drives the seek-bar
 *    thumb and the gradient fill via direct DOM mutations on
 *    `seekBarRef.current` (value + background-image) and the buffered
 *    overlay via `bufferedBarRef.current` (width).
 *  - Only re-renders when `duration`, `playerAccent`, `seekHover`, or
 *    `tvFocus` change — all of which are infrequent.
 *  - The thumbnail preview tooltip is rendered here so it stays co-located
 *    with the bar geometry.
 */

import { memo } from 'react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface PlayerSeekBarProps {
  duration: number;
  playerAccent: string;
  tvFocused: boolean;
  seekHover: { x: number; time: number; dataUrl: string } | null;
  seekBarRef: React.RefObject<HTMLInputElement | null>;
  bufferedBarRef: React.RefObject<HTMLDivElement | null>;
  thumbCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekHover: (e: React.MouseEvent<HTMLInputElement>) => void;
  setSeekHover: (v: null) => void;
}

function PlayerSeekBarInner({
  duration,
  playerAccent,
  tvFocused,
  seekHover,
  seekBarRef,
  bufferedBarRef,
  thumbCanvasRef,
  handleSeek,
  handleSeekHover,
  setSeekHover,
}: PlayerSeekBarProps) {
  return (
    <div className="relative mb-3">
      {/* Thumbnail preview tooltip */}
      {seekHover && (
        <div
          className="absolute bottom-full mb-3 pointer-events-none z-10"
          style={{
            left: Math.max(
              80,
              Math.min(seekHover.x, (seekBarRef.current?.offsetWidth ?? 400) - 80),
            ),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-black/90 rounded-lg overflow-hidden border border-white/20 shadow-xl">
            <img
              src={seekHover.dataUrl}
              alt=""
              className="w-40 h-[90px] object-cover block"
            />
            <p className="text-white/70 text-[10px] text-center py-1 font-mono">
              {formatTime(seekHover.time)}
            </p>
          </div>
        </div>
      )}

      {/*
       * Buffered bar — width is mutated directly by the parent's onTimeUpdate
       * handler via bufferedBarRef.  No React state involved.
       */}
      <div
        ref={bufferedBarRef}
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full opacity-40 pointer-events-none"
        style={{ width: '0%', background: playerAccent }}
      />

      {/*
       * Seek input — intentionally uncontrolled (defaultValue={0}).
       * The parent's onTimeUpdate handler writes directly to
       * seekBarRef.current.value and seekBarRef.current.style.backgroundImage
       * so the thumb and gradient fill update at 60 fps without triggering
       * any React reconciliation.
       */}
      <input
        ref={seekBarRef}
        type="range"
        min={0}
        max={duration || 100}
        defaultValue={0}
        onChange={handleSeek}
        onMouseMove={handleSeekHover}
        onMouseLeave={() => setSeekHover(null)}
        className={[
          'w-full h-1 appearance-none bg-white/20 rounded-full cursor-pointer',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-3',
          '[&::-webkit-slider-thumb]:h-3',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-primary',
          tvFocused ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-transparent' : '',
        ].join(' ')}
        style={{
          background: `linear-gradient(to right, ${playerAccent} 0%, rgba(255,255,255,0.2) 0%)`,
        }}
      />

      {/* Off-screen canvas used by the thumbnail-capture hook */}
      <canvas ref={thumbCanvasRef} className="hidden" />
    </div>
  );
}

/**
 * Memo comparison: only re-render when props that affect the DOM structure
 * change.  `seekBarRef`, `bufferedBarRef`, `thumbCanvasRef`, `handleSeek`,
 * `handleSeekHover`, and `setSeekHover` are stable refs/callbacks from the
 * parent so they never trigger a re-render in practice.
 */
const PlayerSeekBar = memo(PlayerSeekBarInner, (prev, next) =>
  prev.duration      === next.duration      &&
  prev.playerAccent  === next.playerAccent  &&
  prev.tvFocused     === next.tvFocused     &&
  prev.seekHover     === next.seekHover,
);

export default PlayerSeekBar;
