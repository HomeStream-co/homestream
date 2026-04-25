/**
 * usePlayerTimeSync — unit tests.
 *
 * Verifies that onTimeUpdate:
 *   1. Writes currentTime + buffered to their refs
 *   2. Mutates seekBarRef.value and seekBarRef.style.background
 *   3. Mutates bufferedBarRef.style.width
 *   4. Mutates timeDisplayRef.textContent
 *   5. Calls sendState at most once per 2 s (throttle)
 *   6. Does NOT call sendState when called within the 2 s window
 *   7. Resets the throttle clock on each qualifying call
 *   8. Handles missing refs gracefully (no throw)
 *   9. Handles dur === 0 gracefully (no NaN in DOM)
 *  10. Formats time correctly (h:mm:ss vs m:ss)
 *  11. Passes the correct remote-context fields to sendState
 *  12. Uses the latest playerAccent without recreating the callback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { usePlayerTimeSync } from '../../hooks/usePlayerTimeSync';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal fake HTMLVideoElement for testing. */
function makeVideo(overrides: Partial<{
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  paused: boolean;
  volume: number;
  playbackRate: number;
}> = {}): HTMLVideoElement {
  const {
    currentTime = 30,
    duration = 120,
    bufferedEnd = 60,
    paused = false,
    volume = 1,
    playbackRate = 1,
  } = overrides;

  return {
    currentTime,
    duration,
    paused,
    volume,
    playbackRate,
    buffered: {
      length: 1,
      end: () => bufferedEnd,
      start: () => 0,
    },
  } as unknown as HTMLVideoElement;
}

/** Build a minimal fake HTMLInputElement (seek bar). */
function makeSeekBar(): HTMLInputElement {
  return {
    value: '0',
    style: { background: '' },
  } as unknown as HTMLInputElement;
}

/** Build a minimal fake HTMLDivElement (buffered bar). */
function makeBufferedBar(): HTMLDivElement {
  return { style: { width: '' } } as unknown as HTMLDivElement;
}

/** Build a minimal fake HTMLSpanElement (time display). */
function makeTimeDisplay(): HTMLSpanElement {
  return { textContent: '' } as unknown as HTMLSpanElement;
}

// ── Fixture factory ───────────────────────────────────────────────────────────

interface Fixture {
  video: HTMLVideoElement;
  seekBar: HTMLInputElement;
  bufferedBar: HTMLDivElement;
  timeDisplay: HTMLSpanElement;
  currentTimeRef: React.MutableRefObject<number>;
  bufferedRef: React.MutableRefObject<number>;
  lastRemoteSendRef: React.MutableRefObject<number>;
  sendState: ReturnType<typeof vi.fn>;
  getRemoteContext: ReturnType<typeof vi.fn>;
  playerAccent: string;
}

function makeFixture(videoOverrides?: Parameters<typeof makeVideo>[0]): Fixture {
  const video = makeVideo(videoOverrides);
  return {
    video,
    seekBar: makeSeekBar(),
    bufferedBar: makeBufferedBar(),
    timeDisplay: makeTimeDisplay(),
    currentTimeRef: { current: 0 },
    bufferedRef: { current: 0 },
    lastRemoteSendRef: { current: 0 },
    sendState: vi.fn(),
    getRemoteContext: vi.fn(() => ({
      mediaId: 'test-id',
      title: 'Test Movie',
      poster: '/poster.jpg',
      hasNextEpisode: false,
      subtitleTracks: [{ index: 0, label: 'English', language: 'en' }],
      activeSubtitle: -1,
      cast: undefined,
    })),
    playerAccent: 'hsl(var(--primary))',
  };
}

/**
 * Render the hook and return onTimeUpdate.
 * We use renderHook so React's rules-of-hooks are satisfied.
 */
function setup(fixture: Fixture) {
  const { result } = renderHook(() => {
    const videoRef = useRef<HTMLVideoElement | null>(fixture.video);
    const seekBarRef = useRef<HTMLInputElement | null>(fixture.seekBar);
    const bufferedBarRef = useRef<HTMLDivElement | null>(fixture.bufferedBar);
    const timeDisplayRef = useRef<HTMLSpanElement | null>(fixture.timeDisplay);

    return usePlayerTimeSync({
      videoRef,
      currentTimeRef: fixture.currentTimeRef,
      bufferedRef: fixture.bufferedRef,
      seekBarRef,
      bufferedBarRef,
      timeDisplayRef,
      playerAccent: fixture.playerAccent,
      lastRemoteSendRef: fixture.lastRemoteSendRef,
      sendState: fixture.sendState,
      getRemoteContext: fixture.getRemoteContext,
    });
  });

  return result.current.onTimeUpdate;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePlayerTimeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // 1. Writes currentTime ref
  it('writes video.currentTime to currentTimeRef', () => {
    const f = makeFixture({ currentTime: 45 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.currentTimeRef.current).toBe(45);
  });

  // 2. Writes buffered ref
  it('writes buffered.end to bufferedRef', () => {
    const f = makeFixture({ bufferedEnd: 80 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.bufferedRef.current).toBe(80);
  });

  // 3. Seek bar value
  it('sets seekBar.value to video.currentTime as string', () => {
    const f = makeFixture({ currentTime: 30, duration: 120 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.seekBar.value).toBe('30');
  });

  // 4. Seek bar gradient fill — percentage should be 30/120 = 25%
  it('sets seekBar gradient fill to the correct percentage', () => {
    const f = makeFixture({ currentTime: 30, duration: 120 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.seekBar.style.background).toContain('25%');
    expect(f.seekBar.style.background).toContain(f.playerAccent);
  });

  // 5. Buffered bar width — 60/120 = 50%
  it('sets bufferedBar width to the correct percentage', () => {
    const f = makeFixture({ currentTime: 30, duration: 120, bufferedEnd: 60 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.bufferedBar.style.width).toBe('50%');
  });

  // 6. Time display — m:ss format
  it('sets timeDisplay textContent in m:ss format', () => {
    const f = makeFixture({ currentTime: 90, duration: 180 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.timeDisplay.textContent).toBe('1:30 / 3:00');
  });

  // 7. Time display — h:mm:ss format
  it('sets timeDisplay textContent in h:mm:ss format for long videos', () => {
    const f = makeFixture({ currentTime: 3661, duration: 7200 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.timeDisplay.textContent).toBe('1:01:01 / 2:00:00');
  });

  // 8. sendState called on first invocation (lastRemoteSendRef starts at 0)
  it('calls sendState on the first invocation', () => {
    const f = makeFixture();
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    expect(f.sendState).toHaveBeenCalledTimes(1);
  });

  // 9. sendState NOT called again within 2 s window
  it('does not call sendState again within the 2 s throttle window', () => {
    const f = makeFixture();
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); }); // first call — fires
    act(() => { vi.advanceTimersByTime(1000); onTimeUpdate(); }); // 1 s later — suppressed
    expect(f.sendState).toHaveBeenCalledTimes(1);
  });

  // 10. sendState called again after 2 s
  it('calls sendState again after the 2 s throttle window expires', () => {
    const f = makeFixture();
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); }); // fires
    act(() => { vi.advanceTimersByTime(2001); onTimeUpdate(); }); // fires again
    expect(f.sendState).toHaveBeenCalledTimes(2);
  });

  // 11. sendState receives correct remote-context fields
  it('passes getRemoteContext fields through to sendState', () => {
    const f = makeFixture({ currentTime: 10, duration: 100 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    const payload = f.sendState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.mediaId).toBe('test-id');
    expect(payload.title).toBe('Test Movie');
    expect(payload.poster).toBe('/poster.jpg');
    expect(payload.hasNextEpisode).toBe(false);
  });

  // 12. sendState receives live video values
  it('passes live video.currentTime, duration, paused, volume, speed to sendState', () => {
    const f = makeFixture({ currentTime: 55, duration: 200, paused: true, volume: 0.5, playbackRate: 1.5 });
    const onTimeUpdate = setup(f);
    act(() => { onTimeUpdate(); });
    const payload = f.sendState.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.currentTime).toBe(55);
    expect(payload.duration).toBe(200);
    expect(payload.paused).toBe(true);
    expect(payload.volume).toBe(0.5);
    expect(payload.speed).toBe(1.5);
  });

  // 13. Handles dur === 0 — no NaN, no throw
  it('does not throw or write NaN when duration is 0', () => {
    const f = makeFixture({ currentTime: 0, duration: 0, bufferedEnd: 0 });
    const onTimeUpdate = setup(f);
    expect(() => act(() => { onTimeUpdate(); })).not.toThrow();
    // Seek bar and buffered bar should be untouched when dur === 0
    expect(f.seekBar.style.background).toBe('');
    expect(f.bufferedBar.style.width).toBe('');
    expect(f.timeDisplay.textContent).toBe('');
  });

  // 14. Handles null videoRef gracefully
  it('does not throw when videoRef.current is null', () => {
    const f = makeFixture();
    const { result } = renderHook(() => {
      const videoRef = useRef<HTMLVideoElement | null>(null); // null
      const seekBarRef = useRef<HTMLInputElement | null>(f.seekBar);
      const bufferedBarRef = useRef<HTMLDivElement | null>(f.bufferedBar);
      const timeDisplayRef = useRef<HTMLSpanElement | null>(f.timeDisplay);
      return usePlayerTimeSync({
        videoRef,
        currentTimeRef: f.currentTimeRef,
        bufferedRef: f.bufferedRef,
        seekBarRef,
        bufferedBarRef,
        timeDisplayRef,
        playerAccent: f.playerAccent,
        lastRemoteSendRef: f.lastRemoteSendRef,
        sendState: f.sendState,
        getRemoteContext: f.getRemoteContext,
      });
    });
    expect(() => act(() => { result.current.onTimeUpdate(); })).not.toThrow();
    expect(f.sendState).not.toHaveBeenCalled();
  });

  // 15. onTimeUpdate is stable across re-renders (same reference)
  it('returns a stable onTimeUpdate reference across re-renders', () => {
    const f = makeFixture();
    const { result, rerender } = renderHook(() => {
      const videoRef = useRef<HTMLVideoElement | null>(f.video);
      const seekBarRef = useRef<HTMLInputElement | null>(f.seekBar);
      const bufferedBarRef = useRef<HTMLDivElement | null>(f.bufferedBar);
      const timeDisplayRef = useRef<HTMLSpanElement | null>(f.timeDisplay);
      return usePlayerTimeSync({
        videoRef,
        currentTimeRef: f.currentTimeRef,
        bufferedRef: f.bufferedRef,
        seekBarRef,
        bufferedBarRef,
        timeDisplayRef,
        playerAccent: f.playerAccent,
        lastRemoteSendRef: f.lastRemoteSendRef,
        sendState: f.sendState,
        getRemoteContext: f.getRemoteContext,
      });
    });
    const first = result.current.onTimeUpdate;
    rerender();
    expect(result.current.onTimeUpdate).toBe(first);
  });

  // 16. Accent colour change is picked up without recreating the callback
  it('uses the latest playerAccent without recreating the callback', () => {
    const f = makeFixture({ currentTime: 60, duration: 120 });
    f.playerAccent = 'red';

    const { result, rerender } = renderHook(
      ({ accent }: { accent: string }) => {
        const videoRef = useRef<HTMLVideoElement | null>(f.video);
        const seekBarRef = useRef<HTMLInputElement | null>(f.seekBar);
        const bufferedBarRef = useRef<HTMLDivElement | null>(f.bufferedBar);
        const timeDisplayRef = useRef<HTMLSpanElement | null>(f.timeDisplay);
        return usePlayerTimeSync({
          videoRef,
          currentTimeRef: f.currentTimeRef,
          bufferedRef: f.bufferedRef,
          seekBarRef,
          bufferedBarRef,
          timeDisplayRef,
          playerAccent: accent,
          lastRemoteSendRef: f.lastRemoteSendRef,
          sendState: f.sendState,
          getRemoteContext: f.getRemoteContext,
        });
      },
      { initialProps: { accent: 'red' } },
    );

    const firstRef = result.current.onTimeUpdate;

    // Change accent — callback reference must stay the same
    rerender({ accent: 'blue' });
    expect(result.current.onTimeUpdate).toBe(firstRef);

    // But the DOM update should use the new accent
    act(() => { result.current.onTimeUpdate(); });
    expect(f.seekBar.style.background).toContain('blue');
  });
});
