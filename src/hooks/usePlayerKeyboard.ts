/**
 * usePlayerKeyboard — keyboard shortcuts + TV D-pad navigation.
 *
 * Extracted from player.tsx. Handles:
 *   - Space/K: play/pause
 *   - ←/→ / J/L: seek ±10s (or D-pad speed/volume when focused)
 *   - ↑/↓: volume (or D-pad focus movement)
 *   - Tab/Shift+Tab: cycle TV remote focus
 *   - Enter: activate focused control
 *   - C: cycle CC
 *   - A: cycle audio track
 *   - S / < >: cycle/adjust speed
 *   - M: mute
 *   - F: fullscreen
 *   - I: info panel
 *   - P: picture-in-picture
 *   - ?: shortcut help overlay
 *   - Esc: close menus / clear TV focus
 */

import { useEffect } from 'react';
import type { TvControl } from './usePlayerState';
import { TV_CONTROLS } from './usePlayerState';

interface UsePlayerKeyboardOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  tvFocus: TvControl | null;
  ccLang: 'off' | 'en' | 'es';
  audioTracks: { label: string }[];
  activeAudioTrack: number;
  setTvFocus: (v: TvControl | null) => void;
  setShowControls: (v: boolean) => void;
  setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEndOverlay: (v: boolean) => void;
  setShowSpeedMenu: (v: boolean) => void;
  setShowCcMenu: (v: boolean) => void;
  setCcLang: (v: 'off' | 'en' | 'es') => void;
  setPlaybackRate: (v: number) => void;
  setVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
  setSeekFlash: (v: 'forward' | 'back' | null) => void;
  setSeekFlashCount: (v: number) => void;
  setActiveAudioTrack: (v: number) => void;
  showActionToast: (msg: string) => void;
  resetControlsTimer: (isPlaying: boolean) => void;
  togglePiP: () => void;
  fadeAndNavigate: (to: string) => void;
  playing: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const CC_CYCLE: Array<'off' | 'en' | 'es'> = ['off', 'en', 'es'];

export function usePlayerKeyboard({
  videoRef,
  containerRef,
  tvFocus,
  ccLang,
  audioTracks,
  activeAudioTrack,
  setTvFocus,
  setShowControls,
  setShowInfo,
  setShowShortcuts,
  setShowEndOverlay,
  setShowSpeedMenu,
  setShowCcMenu,
  setCcLang,
  setPlaybackRate,
  setVolume,
  setMuted,
  setSeekFlash,
  setSeekFlashCount,
  setActiveAudioTrack,
  showActionToast,
  resetControlsTimer,
  togglePiP,
  fadeAndNavigate,
  playing,
}: UsePlayerKeyboardOptions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const video = videoRef.current;
      if (!video) return;

      const focusIdx = tvFocus ? TV_CONTROLS.indexOf(tvFocus) : -1;

      // ── Tab / Shift+Tab — cycle TV remote focus ──
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = e.shiftKey
          ? (focusIdx <= 0 ? TV_CONTROLS.length - 1 : focusIdx - 1)
          : (focusIdx >= TV_CONTROLS.length - 1 ? 0 : focusIdx + 1);
        setTvFocus(TV_CONTROLS[next]);
        setShowControls(true);
        resetControlsTimer(playing);
        return;
      }

      const flashSeek = (dir: 'forward' | 'back') => {
        setSeekFlash(dir);
        setSeekFlashCount(10);
        setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
      };

      switch (e.key) {
        // ── Play / Pause ──
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (video.paused) video.play(); else video.pause();
          break;

        // ── Seek / D-pad left ──
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          if (tvFocus === 'speed') {
            const idx = SPEEDS.indexOf(video.playbackRate);
            const prev = SPEEDS[Math.max(idx - 1, 0)];
            video.playbackRate = prev;
            setPlaybackRate(prev);
            showActionToast(prev === 1 ? 'Speed: Normal' : `Speed: ${prev}×`);
          } else if (tvFocus === 'volume') {
            video.volume = Math.max(video.volume - 0.1, 0);
            setVolume(Math.max(video.volume, 0));
          } else {
            video.currentTime = Math.max(video.currentTime - 10, 0);
            flashSeek('back');
          }
          break;

        // ── Seek / D-pad right ──
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          if (tvFocus === 'speed') {
            const idx = SPEEDS.indexOf(video.playbackRate);
            const next = SPEEDS[Math.min(idx + 1, SPEEDS.length - 1)];
            video.playbackRate = next;
            setPlaybackRate(next);
            showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          } else if (tvFocus === 'volume') {
            video.volume = Math.min(video.volume + 0.1, 1);
            setVolume(Math.min(video.volume, 1));
          } else {
            video.currentTime = Math.min(video.currentTime + 10, video.duration);
            flashSeek('forward');
          }
          break;

        // ── D-pad up ──
        case 'ArrowUp':
          e.preventDefault();
          if (tvFocus === null) {
            video.volume = Math.min(video.volume + 0.1, 1);
            setVolume(Math.min(video.volume, 1));
            showActionToast(`Volume ${Math.round(Math.min(video.volume, 1) * 100)}%`);
          } else {
            const prev = focusIdx <= 0 ? TV_CONTROLS.length - 1 : focusIdx - 1;
            setTvFocus(TV_CONTROLS[prev]);
          }
          break;

        // ── D-pad down ──
        case 'ArrowDown':
          e.preventDefault();
          if (tvFocus === null) {
            video.volume = Math.max(video.volume - 0.1, 0);
            setVolume(Math.max(video.volume, 0));
            showActionToast(`Volume ${Math.round(Math.max(video.volume, 0) * 100)}%`);
          } else {
            const next = focusIdx >= TV_CONTROLS.length - 1 ? 0 : focusIdx + 1;
            setTvFocus(TV_CONTROLS[next]);
          }
          break;

        // ── Enter / OK ──
        case 'Enter': {
          e.preventDefault();
          if (!tvFocus) { if (video.paused) video.play(); else video.pause(); break; }
          switch (tvFocus) {
            case 'back':       fadeAndNavigate('/'); break;
            case 'play':       if (video.paused) video.play(); else video.pause(); break;
            case 'rewind':     video.currentTime = Math.max(video.currentTime - 10, 0); flashSeek('back'); break;
            case 'forward':    video.currentTime = Math.min(video.currentTime + 10, video.duration); flashSeek('forward'); break;
            case 'mute':       video.muted = !video.muted; setMuted(video.muted); break;
            case 'fullscreen': if (!document.fullscreenElement) containerRef.current?.requestFullscreen(); else document.exitFullscreen(); break;
            case 'speed': {
              const idx = SPEEDS.indexOf(video.playbackRate);
              const next = SPEEDS[(idx + 1) % SPEEDS.length];
              video.playbackRate = next;
              setPlaybackRate(next);
              showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
              break;
            }
            case 'cc': {
              const curIdx = CC_CYCLE.indexOf(ccLang);
              const nextCC = CC_CYCLE[(curIdx + 1) % CC_CYCLE.length];
              setCcLang(nextCC);
              showActionToast(nextCC === 'off' ? 'CC: Off' : nextCC === 'en' ? 'CC: English' : 'CC: Español');
              break;
            }
          }
          break;
        }

        // ── C — cycle CC ──
        case 'c':
        case 'C': {
          const curIdx = CC_CYCLE.indexOf(ccLang);
          const nextCC = CC_CYCLE[(curIdx + 1) % CC_CYCLE.length];
          setCcLang(nextCC);
          showActionToast(nextCC === 'off' ? 'CC: Off' : nextCC === 'en' ? 'CC: English' : 'CC: Español');
          break;
        }

        // ── A — cycle audio tracks ──
        case 'a':
        case 'A': {
          if (audioTracks.length > 1) {
            const nextAudio = (activeAudioTrack + 1) % audioTracks.length;
            setActiveAudioTrack(nextAudio);
            const tracks = (video as HTMLVideoElement & { audioTracks?: { [k: number]: { enabled: boolean } } }).audioTracks;
            if (tracks) {
              for (let j = 0; j < audioTracks.length; j++) tracks[j].enabled = j === nextAudio;
            }
            showActionToast(`Audio: ${audioTracks[nextAudio]?.label ?? 'Track ' + (nextAudio + 1)}`);
          }
          break;
        }

        // ── S — cycle speed ──
        case 's':
        case 'S': {
          const idx = SPEEDS.indexOf(video.playbackRate);
          const next = SPEEDS[(idx + 1) % SPEEDS.length];
          video.playbackRate = next;
          setPlaybackRate(next);
          showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          break;
        }

        // ── M — mute ──
        case 'm':
        case 'M':
          video.muted = !video.muted;
          setMuted(video.muted);
          showActionToast(video.muted ? 'Muted' : 'Unmuted');
          break;

        // ── F — fullscreen ──
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
          else document.exitFullscreen();
          break;

        // ── I — info panel ──
        case 'i':
        case 'I':
          setShowInfo(prev => !prev);
          break;

        // ── ? — shortcut help ──
        case '?':
          setShowShortcuts(prev => !prev);
          break;

        // ── P — picture-in-picture ──
        case 'p':
        case 'P':
          togglePiP();
          break;

        // ── Escape ──
        case 'Escape':
          if (tvFocus) { setTvFocus(null); break; }
          setShowEndOverlay(false);
          setShowInfo(false);
          setShowShortcuts(false);
          setShowSpeedMenu(false);
          setShowCcMenu(false);
          break;

        // ── Legacy speed keys < > ──
        case '>':
        case '.': {
          const idx = SPEEDS.indexOf(video.playbackRate);
          const next = SPEEDS[Math.min(idx + 1, SPEEDS.length - 1)];
          video.playbackRate = next;
          setPlaybackRate(next);
          showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          break;
        }
        case '<':
        case ',': {
          const idx = SPEEDS.indexOf(video.playbackRate);
          const prev = SPEEDS[Math.max(idx - 1, 0)];
          video.playbackRate = prev;
          setPlaybackRate(prev);
          showActionToast(prev === 1 ? 'Speed: Normal' : `Speed: ${prev}×`);
          break;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvFocus, ccLang, showActionToast]);
}
