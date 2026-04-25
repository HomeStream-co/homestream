/**
 * usePlayerProgress — watch progress persistence.
 *
 * Handles:
 *   - Saving progress every 10 seconds during playback
 *   - Saving on tab hide / window blur
 *   - Saving on React Router unmount via sendBeacon (reliable on page close)
 *   - Watch-complete trigger at 85% (shows end overlay, fires recommendation)
 *   - Autoplay countdown to next item
 *   - Skip Intro visibility + auto-skip
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface UsePlayerProgressOptions {
  id: string | undefined;
  currentTime: number;
  duration: number;
  playing: boolean;
  profileId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  watchCompleteTriggered: React.MutableRefObject<boolean>;
  autoplayTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | undefined>;
  autoplayCancelled: boolean;
  showEndOverlay: boolean;
  autoplayCountdown: number;
  nextItemId: string | undefined;
  autoplayNext: boolean;
  autoSkipIntro: boolean;
  updateProgress: (id: string, pct: number, currentTime: number, duration: number) => void;
  triggerPostWatchRecommendation: (id: string) => void;
  setShowEndOverlay: (v: boolean) => void;
  setAutoplayCountdown: React.Dispatch<React.SetStateAction<number>>;
  setAutoplayCancelled: (v: boolean) => void;
  setShowSkipIntro: (v: boolean) => void;
}

const AUTOPLAY_SECONDS = 60;
const SKIP_INTRO_END = 240; // 4 minutes

export function usePlayerProgress({
  id,
  currentTime,
  duration,
  playing,
  profileId,
  videoRef,
  watchCompleteTriggered,
  autoplayTimerRef,
  autoplayCancelled,
  showEndOverlay,
  autoplayCountdown: _autoplayCountdown,
  nextItemId,
  autoplayNext,
  autoSkipIntro,
  updateProgress,
  triggerPostWatchRecommendation,
  setShowEndOverlay,
  setAutoplayCountdown,
  setAutoplayCancelled,
  setShowSkipIntro,
}: UsePlayerProgressOptions) {
  const navigate = useNavigate();

  // Capture profileId in a ref so cleanup closures always have the current value
  const profileIdRef = useRef(profileId);
  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);

  // ── Save progress helper ──────────────────────────────────────────────────
  const saveProgress = useCallback(() => {
    if (!id || duration <= 0 || currentTime <= 0) return;
    const pct = (currentTime / duration) * 100;
    updateProgress(id, pct, currentTime, duration);
  }, [id, currentTime, duration, updateProgress]);

  // ── Save every 10s ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || currentTime === 0) return;
    const interval = setInterval(() => {
      if (duration > 0) updateProgress(id, (currentTime / duration) * 100, currentTime, duration);
    }, 10000);
    return () => clearInterval(interval);
  }, [id, currentTime, duration, updateProgress]);

  // ── Save on tab hide / window blur ────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const onVisibilityChange = () => { if (document.hidden) saveProgress(); };
    const onBeforeUnload = () => saveProgress();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [id, saveProgress]);

  // ── Save on navigate away (React Router unmount) ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (id && video && video.duration > 0) {
        const ct = video.currentTime;
        const dur = video.duration;
        const pct = (ct / dur) * 100;
        const payload = JSON.stringify({ progress: pct, currentTime: ct, duration: dur, profileId: profileIdRef.current });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(`/api/media/${id}/progress`, blob);
        } else {
          fetch(`/api/media/${id}/progress`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {}); // non-fatal — ignore
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Watch-complete trigger at 85% ─────────────────────────────────────────
  useEffect(() => {
    if (!id || duration === 0 || watchCompleteTriggered.current) return;
    if ((currentTime / duration) * 100 >= 85) {
      watchCompleteTriggered.current = true;
      triggerPostWatchRecommendation(id);
      setShowEndOverlay(true);
      setAutoplayCountdown(AUTOPLAY_SECONDS);
      setAutoplayCancelled(false);
    }
  }, [currentTime, duration, id, triggerPostWatchRecommendation, watchCompleteTriggered, setShowEndOverlay, setAutoplayCountdown, setAutoplayCancelled]);

  // ── Autoplay countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showEndOverlay || autoplayCancelled || !nextItemId || !autoplayNext) return;
    autoplayTimerRef.current = setInterval(() => {
      setAutoplayCountdown(prev => {
        if (prev <= 1) {
          clearInterval(autoplayTimerRef.current);
          navigate(`/player/${nextItemId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(autoplayTimerRef.current);
  }, [showEndOverlay, autoplayCancelled, nextItemId, navigate, autoplayNext, autoplayTimerRef, setAutoplayCountdown]);

  // ── Skip Intro visibility + auto-skip ────────────────────────────────────
  const skipIntro = useCallback(() => {
    if (videoRef.current) videoRef.current.currentTime = SKIP_INTRO_END;
  }, [videoRef]);

  useEffect(() => {
    const inIntro = currentTime > 30 && currentTime < SKIP_INTRO_END && playing;
    setShowSkipIntro(inIntro);
    if (inIntro && autoSkipIntro) skipIntro();
  }, [currentTime, playing, autoSkipIntro, skipIntro, setShowSkipIntro]);

  return { saveProgress, skipIntro, AUTOPLAY_SECONDS, SKIP_INTRO_END };
}
