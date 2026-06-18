/**
 * usePlayerTimeSync — owns the video `timeupdate` hot-path.
 *
 * Responsibilities (all zero-React-state):
 *   1. Write video.currentTime → currentTimeRef
 *   2. Write video.buffered   → bufferedRef
 *   3. Mutate seekBarRef DOM  (value + gradient fill) via rAF loop at 60fps
 *   4. Mutate bufferedBarRef  (width)
 *   5. Mutate timeDisplayRef  (textContent)
 *   6. Throttled remote-state broadcast (≤ once per 2 s, wall-clock)
 *
 * The seek-bar thumb and gradient are driven by a requestAnimationFrame loop
 * (not by onTimeUpdate) so they update at 60fps and never lag the playhead.
 * onTimeUpdate is kept only for the buffered bar, time display, and remote
 * broadcast — all of which are fine at the browser's native ~4Hz rate.
 *
 * PERFORMANCE CONTRACT
 * --------------------
 * This hook MUST NOT call any React setState.  Every update goes through
 * refs or direct DOM mutation.  The 500 ms interval in player.tsx handles
 * the infrequent state transitions (watch-complete, skip-intro).
 */

import { useCallback, useEffect, useRef } from 'react';
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
  /** When true, skip seek-bar DOM writes so scrubbing is lag-free. */
  isScrubbingRef: React.MutableRefObject<boolean>;
  /**
   * Stable sendState callback from useRemoteControl.
   * Called at most once per 2 s during playback.
   */
  sendState: (payload: PlayerStatePayload) => void;
  /** Stable getter for the current remote-state payload fields that change
   *  infrequently (mediaId, title, poster, ccLang, castInfo, nextItem). */
  getRemoteContext: () => Omit<PlayerStatePayload, 'currentTime' | 'duration' | 'paused' | 'volume' | 'speed'>;
  /** Stable getter for the resolved duration. */
  getDuration: () => number;
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
  isScrubbingRef,
  sendState,
  getRemoteContext,
  getDuration,
}: UsePlayerTimeSyncOptions) {
  // Keep a ref to playerAccent so the rAF loop never needs to be recreated.
  const accentRef = useRef(playerAccent);
  accentRef.current = playerAccent;

  // Keep a ref to getRemoteContext for the same reason.
  const getRemoteContextRef = useRef(getRemoteContext);
  getRemoteContextRef.current = getRemoteContext;

  // Keep a ref to getDuration for the same reason.
  const getDurationRef = useRef(getDuration);
  getDurationRef.current = getDuration;

  // Keep a ref to sendState (stable from useRemoteControl, but defensive).
  const sendStateRef = useRef(sendState);
  sendStateRef.current = sendState;

  // rAF handle so we can cancel on unmount.
  const rafRef = useRef<number>(0);

  /**
   * requestAnimationFrame loop — runs at 60fps while the component is mounted.
   *
   * Drives the seek-bar thumb and gradient fill directly from
   * video.currentTime so the dot tracks the playhead with zero perceptible lag.
   * Skips DOM writes while the user is scrubbing so the thumb follows the
   * pointer instead of being overwritten by the video clock.
   */
  useEffect(() => {
    function tick() {
      const video = videoRef.current;
      const seekBar = seekBarRef.current;

      if (video && seekBar && !isScrubbingRef.current) {
        const dur = getDurationRef.current();
        if (dur > 0 && isFinite(dur)) {
          const ct = video.currentTime;
          const pct = (ct / dur) * 100;

          // Keep the input's max in sync with the actual duration so the
          // thumb position (value/max) is always accurate — React state
          // `duration` may lag by one render cycle after loadedmetadata.
          if (seekBar.max !== String(dur)) seekBar.max = String(dur);

          seekBar.value = String(ct);
          seekBar.style.background =
            `linear-gradient(to right, ${accentRef.current} ${pct}%, rgba(255,255,255,0.2) 0%)`;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — all values accessed via refs

  /**
   * onTimeUpdate — attach directly to <video onTimeUpdate={onTimeUpdate}>.
   *
   * Now only responsible for:
   *   1. Updating currentTimeRef / bufferedRef
   *   2. Updating the buffered bar width
   *   3. Updating the time display text
   *   4. Throttled remote broadcast
   *
   * The seek-bar gradient is handled by the rAF loop above at 60fps.
   */
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // ── 1. Update refs ────────────────────────────────────────────────────
    currentTimeRef.current = video.currentTime;
    const buf = video.buffered;
    const dur = getDurationRef.current() || 0;
    if (buf.length > 0) bufferedRef.current = buf.end(buf.length - 1);

    // ── 2. Buffered bar: width ────────────────────────────────────────────
    const bufferedBar = bufferedBarRef.current;
    if (bufferedBar && dur > 0) {
      bufferedBar.style.width = `${(bufferedRef.current / dur) * 100}%`;
    }

    // ── 3. Time display: textContent ─────────────────────────────────────
    const timeDisplay = timeDisplayRef.current;
    if (timeDisplay && dur > 0) {
      timeDisplay.textContent =
        `${formatTime(video.currentTime)} / ${formatTime(dur)}`;
    }

    // ── 4. Remote broadcast — throttled to ≤ 1 per 2 s ──────────────────
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
