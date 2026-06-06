/**
 * usePlayerTimeSync — owns the video `timeupdate` hot-path.
 *
 * Responsibilities (all zero-React-state):
 *   1. Write video.currentTime → currentTimeRef
 *   2. Write video.buffered   → bufferedRef
 *   3. Mutate seekBarRef DOM  (value + gradient fill)
 *   4. Mutate bufferedBarRef  (width)
 *   5. Mutate timeDisplayRef  (textContent)
 *   6. Throttled remote-state broadcast (≤ once per 2 s, wall-clock)
 *
 * Returns a stable `onTimeUpdate` callback (useCallback with no deps that
 * change at playback frequency) suitable for passing directly to
 * <video onTimeUpdate={onTimeUpdate}>.
 *
 * PERFORMANCE CONTRACT
 * --------------------
 * This callback MUST NOT call any React setState.  Every update here goes
 * through refs or direct DOM mutation.  The 500 ms interval in player.tsx
 * handles the infrequent state transitions (watch-complete, skip-intro).
 */

import { useCallback, useRef } from 'react';
import type { PlayerStatePayload } from './useRemoteControl';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface UsePlayerTimeSyncOptions {
  /** Stable ref to the <video> element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Ref that always holds the current playback position (seconds). */
  currentTimeRef: React.MutableRefObject<number>;
  /** Ref that always holds the furthest buffered position (seconds). */
  bufferedRef: React.MutableRefObject<number>;
  /** Ref to the <input type="range"> seek bar. */
  seekBarRef: React.RefObject<HTMLInputElement | null>;
  /** Ref to the buffered-progress <div>. */
  bufferedBarRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to the time-display <span>. */
  timeDisplayRef: React.RefObject<HTMLSpanElement | null>;
  /** CSS colour string used for the seek-bar gradient fill. */
  playerAccent: string;
  /** Wall-clock ref shared with sendRemoteStateNow so both throttle together. */
  lastRemoteSendRef: React.MutableRefObject<number>;
  /**
   * Stable sendState callback from useRemoteControl.
   * Called at most once per 2 s during playback.
   */
  sendState: (payload: PlayerStatePayload) => void;
  /** Stable getter for the current remote-state payload fields that change
   *  infrequently (mediaId, title, poster, ccLang, castInfo, nextItem). */
  getRemoteContext: () => Omit<PlayerStatePayload, 'currentTime' | 'duration' | 'paused' | 'volume' | 'speed'>;
}

export function usePlayerTimeSync({
  videoRef,
  currentTimeRef,
  bufferedRef,
  seekBarRef,
  bufferedBarRef,
  timeDisplayRef,
  playerAccent,
  lastRemoteSendRef,
  sendState,
  getRemoteContext,
}: UsePlayerTimeSyncOptions) {
  // Keep a ref to playerAccent so the callback never needs to be recreated
  // when the accent colour changes (rare, but possible on theme switch).
  const accentRef = useRef(playerAccent);
  accentRef.current = playerAccent;

  // Keep a ref to getRemoteContext for the same reason.
  const getRemoteContextRef = useRef(getRemoteContext);
  getRemoteContextRef.current = getRemoteContext;

  // Keep a ref to sendState (stable from useRemoteControl, but defensive).
  const sendStateRef = useRef(sendState);
  sendStateRef.current = sendState;

  /**
   * onTimeUpdate — attach directly to <video onTimeUpdate={onTimeUpdate}>.
   *
   * Stable reference: deps array is empty because every value is accessed
   * through a ref.  React will never recreate this function.
   */
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // ── 1. Update refs ────────────────────────────────────────────────────
    currentTimeRef.current = video.currentTime;
    const buf = video.buffered;
    const dur = video.duration || 0;
    if (buf.length > 0) bufferedRef.current = buf.end(buf.length - 1);

    // ── 2. Seek bar: value + gradient fill ───────────────────────────────
    const seekBar = seekBarRef.current;
    if (seekBar && dur > 0) {
      const pct = (video.currentTime / dur) * 100;
      seekBar.value = String(video.currentTime);
      seekBar.style.background =
        `linear-gradient(to right, ${accentRef.current} ${pct}%, rgba(255,255,255,0.2) 0%)`;
    }

    // ── 3. Buffered bar: width ────────────────────────────────────────────
    const bufferedBar = bufferedBarRef.current;
    if (bufferedBar && dur > 0) {
      bufferedBar.style.width = `${(bufferedRef.current / dur) * 100}%`;
    }

    // ── 4. Time display: textContent ─────────────────────────────────────
    const timeDisplay = timeDisplayRef.current;
    if (timeDisplay && dur > 0) {
      timeDisplay.textContent =
        `${formatTime(video.currentTime)} / ${formatTime(dur)}`;
    }

    // ── 5. Remote broadcast — throttled to ≤ 1 per 2 s ──────────────────
    const now = Date.now();
    if (now - lastRemoteSendRef.current >= 2000) {
      lastRemoteSendRef.current = now;
      const ctx = getRemoteContextRef.current();
      sendStateRef.current({
        ...ctx,
        currentTime: video.currentTime,
        duration: dur,
        paused: video.paused,
        volume: video.volume,
        speed: video.playbackRate,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — all values accessed via refs

  return { onTimeUpdate };
}
