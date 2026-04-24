/**
 * player.tsx — HomeStream video player page.
 *
 * This file is intentionally lean: all state lives in usePlayerState,
 * all logic is in focused hooks, and all UI sections are separate components.
 *
 * File budget: ~350 lines (down from 2,350).
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Cpu, FastForward, Rewind, RotateCcw, SkipForward, X as XIcon } from 'lucide-react';
import { toActorsArray } from '@/lib/utils';

import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import { useTheme } from '@/context/ThemeContext';

import { usePlayerState } from '@/hooks/usePlayerState';
import { useHlsSetup } from '@/hooks/useHlsSetup';
import { usePlayerKeyboard } from '@/hooks/usePlayerKeyboard';
import { useRemoteControl } from '@/hooks/useRemoteControl';
import { useTranscodeProgress } from '@/hooks/useTranscodeProgress';

import TranscodeProgressOverlay from '@/components/TranscodeProgressOverlay';
import PlayerControlsOverlay from '@/components/player/PlayerControlsOverlay';
import PlayerEndOverlay from '@/components/player/PlayerEndOverlay';
import PlayerInfoPanel from '@/components/player/PlayerInfoPanel';
import PlayerShortcutsOverlay from '@/components/player/PlayerShortcutsOverlay';
import PlayerBelowFold from '@/components/player/PlayerBelowFold';
import RestrictedContentGuard from '@/components/RestrictedContentGuard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const AUTOPLAY_SECONDS = 60;
const SKIP_INTRO_END = 240;

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, updateProgress, triggerPostWatchRecommendation, continueWatching } = useMedia();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? 'adult';
  const { settings: appSettings } = useTheme();
  const playerAccent = appSettings.syncPlayerColor ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.9)';
  const item = library.find(m => m.id === id);

  // ── All player state + refs ───────────────────────────────────────────────
  const ps = usePlayerState();

  // ── HLS setup (HEVC / H.265) ─────────────────────────────────────────────
  const { hlsUrl, hlsCodec } = useHlsSetup(id, ps.videoRef);

  // ── Transcode progress SSE ────────────────────────────────────────────────
  const transcodeJob = useTranscodeProgress(id);
  const isTranscoding = transcodeJob !== null
    && transcodeJob.status !== 'done'
    && transcodeJob.status !== 'skipped';

  // ── Remote control refs (needed before useRemoteControl) ─────────────────
  const setCcLangRef = useRef<((lang: 'off' | 'en' | 'es') => void) | null>(null);
  const castButtonRef = useRef<(() => void) | null>(null);
  useEffect(() => { setCcLangRef.current = ps.setCcLang; }, [ps.setCcLang]);

  // ── Apply default volume + subtitle language from settings on mount ───────
  useEffect(() => {
    const video = ps.videoRef.current;
    if (video) {
      const vol = Math.max(0, Math.min(1, appSettings.defaultVolume / 100));
      video.volume = vol;
      ps.setVolume(vol);
    }
    // Apply subtitle language preference (only 'en' and 'es' are supported tracks)
    const lang = appSettings.subtitleLanguage;
    if (lang === 'en' || lang === 'es') {
      ps.setCcLang(lang);
    }
  // Run once on mount — intentionally no deps so it doesn't re-run on every settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived: similar items ────────────────────────────────────────────────
  const similarItems = useMemo(() => item
    ? library
        .filter(m => m.id !== item.id)
        .map(m => {
          let score = 0;
          const sharedGenres = m.genre.filter((g: string) => item.genre.includes(g)).length;
          score += sharedGenres * 3;
          if (m.director && item.director && m.director !== 'Unknown' && m.director === item.director) score += 4;
          const itemActors = toActorsArray(item.actors);
          const mActors = toActorsArray(m.actors);
          score += mActors.filter((a: string) => a !== 'Unknown' && itemActors.includes(a)).length * 2;
          if (m.type === item.type) score += 1;
          if (Math.abs((parseFloat(m.imdbRating) || 0) - (parseFloat(item.imdbRating) || 0)) < 1.5) score += 1;
          const ie = item.enrichment;
          const me = m.enrichment;
          if (ie && me) {
            score += me.tags.filter((t: string) => ie.tags.includes(t)).length * 4;
            score += me.mood.filter((mood: string) => ie.mood.includes(mood)).length * 3;
            score += (me.themes ?? []).filter((t: string) => (ie.themes ?? []).includes(t)).length * 3;
            if (me.pacing === ie.pacing) score += 2;
            if (me.audienceAge === ie.audienceAge) score += 2;
            const tl = m.title.toLowerCase();
            if ((ie.similarTitles ?? []).some((t: string) => t.toLowerCase().includes(tl) || tl.includes(t.toLowerCase()))) score += 6;
          } else if (ie) {
            const tl = m.title.toLowerCase();
            if ((ie.similarTitles ?? []).some((t: string) => t.toLowerCase().includes(tl) || tl.includes(t.toLowerCase()))) score += 5;
          }
          return { item: m, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ item: m }) => m)
    : [], [item, library]);

  // ── Next item ─────────────────────────────────────────────────────────────
  const nextItem = (() => {
    if (!item) return null;
    if (item.type === 'series') {
      const showTitle = item.title
        .replace(/\s*[Ss]\d+[Ee]\d+.*$/, '')
        .replace(/\s*[-–]\s*Season\s*\d+.*$/i, '')
        .replace(/\s*\(\d{4}\)$/, '')
        .trim().toLowerCase();
      const sameShow = library
        .filter((m: typeof item) => m.id !== item.id && m.type === 'series' && m.title.toLowerCase().startsWith(showTitle) && (m.watchProgress ?? 0) < 90)
        .sort((a: typeof item, b: typeof item) => {
          const epNum = (t: string) => { const match = t.match(/[Ss](\d+)[Ee](\d+)/); return match ? parseInt(match[1]) * 1000 + parseInt(match[2]) : 9999; };
          return epNum((a.filename ?? a.title) as string) - epNum((b.filename ?? b.title) as string);
        });
      if (sameShow.length > 0) return sameShow[0];
    }
    return similarItems[0] ?? null;
  })();

  // ── Resume items ──────────────────────────────────────────────────────────
  const resumeItems = continueWatching
    .filter(c => c.id !== id && c.progress > 5 && c.progress < 90)
    .slice(0, 2)
    .map(c => { const found = library.find((m: { id: string }) => m.id === c.id); return found ? { ...found, progress: c.progress } : null; })
    .filter((m): m is NonNullable<typeof m> => m !== null && !!m.id);

  // ── Remote control ────────────────────────────────────────────────────────
  const { sendState } = useRemoteControl(id, {
    onPlay:        () => ps.videoRef.current?.play(),
    onPause:       () => ps.videoRef.current?.pause(),
    onSeek:        (pos) => { if (ps.videoRef.current) { ps.videoRef.current.currentTime = pos; ps.currentTimeRef.current = pos; } },
    onVolume:      (lvl) => { if (ps.videoRef.current) { ps.videoRef.current.volume = lvl; ps.setVolume(lvl); ps.setMuted(lvl === 0); } },
    onSkipForward: (secs) => { if (ps.videoRef.current) ps.videoRef.current.currentTime = Math.min(ps.videoRef.current.currentTime + secs, ps.duration); },
    onSkipBack:    (secs) => { if (ps.videoRef.current) ps.videoRef.current.currentTime = Math.max(ps.videoRef.current.currentTime - secs, 0); },
    onSkipIntro:   () => { if (ps.videoRef.current) ps.videoRef.current.currentTime = SKIP_INTRO_END; },
    onFullscreen:  () => {
      const fsEl = document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      const el = ps.containerRef.current;
      if (!fsEl && el) {
        if (el.requestFullscreen) el.requestFullscreen();
        else (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
      }
    },
    onSpeed:       (rate) => { if (ps.videoRef.current) { ps.videoRef.current.playbackRate = rate; ps.setPlaybackRate(rate); } },
    onSubtitle:    (track) => { setCcLangRef.current?.(track === -1 ? 'off' : track === 0 ? 'en' : 'es'); },
    onCast:        () => castButtonRef.current?.(),
  });

  // Throttle ref for onTimeUpdate remote broadcasts (wall-clock, not video-time)
  const lastRemoteSendRef = useRef(0);

  // Immediate remote state push — called on play/pause/seek/volume so the
  // phone remote reflects changes instantly without waiting for the 2s throttle.
  const sendRemoteStateNow = useCallback(() => {
    const video = ps.videoRef.current;
    if (!video || !id) return;
    lastRemoteSendRef.current = Date.now();
    sendState({
      mediaId: id,
      title: item?.title ?? '',
      poster: item?.poster,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      paused: video.paused,
      volume: video.volume,
      speed: video.playbackRate,
      hasNextEpisode: !!nextItem,
      subtitleTracks: [{ index: 0, label: 'English', language: 'en' }, { index: 1, label: 'Español', language: 'es' }],
      activeSubtitle: ps.ccLang === 'off' ? -1 : ps.ccLang === 'en' ? 0 : 1,
      cast: ps.castInfo ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, item, nextItem, ps.ccLang, ps.castInfo, sendState]);

  // ── Kids profile block — handled by RestrictedContentGuard wrapper ──────────

  // ── Reset on id change ────────────────────────────────────────────────────
  useEffect(() => {
    ps.setPlaybackRate(1);
    ps.watchCompleteTriggered.current = false;
    ps.resumeApplied.current = false;
    ps.setShowEndOverlay(false);
    ps.setVideoLoading(true);
    ps.setVideoError(null);
    if (ps.videoRef.current) ps.videoRef.current.playbackRate = 1;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Fetch audio tracks ────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/media/${id}/tracks`)
      .then(r => r.ok ? r.json() : [])
      .then((tracks: typeof ps.audioTracks) => { if (Array.isArray(tracks)) ps.setAudioTracks(tracks); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Progress: save every 10s ──────────────────────────────────────────────
  // Reads from currentTimeRef (not state) — no re-render dependency on time.
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      const ct = ps.currentTimeRef.current;
      const dur = ps.duration;
      if (dur > 0 && ct > 0) updateProgress(id, (ct / dur) * 100, ct, dur);
    }, 10000);
    return () => clearInterval(interval);
  }, [id, ps.currentTimeRef, ps.duration, updateProgress]);

  // ── Progress: save on visibility change / beforeunload ───────────────────
  // saveProgress reads from refs — stable callback, no re-creation on time change.
  const saveProgress = useCallback(() => {
    const ct = ps.currentTimeRef.current;
    const dur = ps.duration;
    if (!id || dur <= 0 || ct <= 0) return;
    updateProgress(id, (ct / dur) * 100, ct, dur);
  }, [id, ps.currentTimeRef, ps.duration, updateProgress]);

  useEffect(() => {
    if (!id) return;
    const onHide = () => { if (document.hidden) saveProgress(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', saveProgress);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', saveProgress); };
  }, [id, saveProgress]);

  // ── Progress: sendBeacon on unmount ──────────────────────────────────────
  const profileIdRef = useRef(profileId);
  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);
  useEffect(() => {
    return () => {
      const video = ps.videoRef.current;
      if (id && video && video.duration > 0) {
        const payload = JSON.stringify({ progress: (video.currentTime / video.duration) * 100, currentTime: video.currentTime, duration: video.duration, profileId: profileIdRef.current });
        if (navigator.sendBeacon) navigator.sendBeacon(`/api/media/${id}/progress`, new Blob([payload], { type: 'application/json' }));
        else fetch(`/api/media/${id}/progress`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Watch-complete + Skip-intro: poll refs on an interval ────────────────
  // Previously these were effects on ps.currentTime (state), which caused
  // re-renders 4× per second. Now they run on a 500ms interval reading the
  // ref — accurate enough, zero React overhead.
  const autoSkipFiredRef = useRef(false);
  useEffect(() => { autoSkipFiredRef.current = false; }, [id]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      const ct = ps.currentTimeRef.current;
      const dur = ps.duration;
      const playing = ps.videoRef.current ? !ps.videoRef.current.paused : false;

      // Watch-complete at 85%
      if (dur > 0 && !ps.watchCompleteTriggered.current && (ct / dur) * 100 >= 85) {
        ps.watchCompleteTriggered.current = true;
        triggerPostWatchRecommendation(id);
        ps.setShowEndOverlay(true);
        ps.setAutoplayCountdown(AUTOPLAY_SECONDS);
        ps.setAutoplayCancelled(false);
      }

      // Skip-intro button visibility + auto-skip
      const inIntro = ct > 30 && ct < SKIP_INTRO_END && playing;
      ps.setShowSkipIntro(inIntro);
      if (inIntro && appSettings.autoSkipIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        if (ps.videoRef.current) ps.videoRef.current.currentTime = SKIP_INTRO_END;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [id, ps, appSettings.autoSkipIntro, triggerPostWatchRecommendation]);

  // ── Autoplay countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ps.showEndOverlay || ps.autoplayCancelled || !nextItem || !appSettings.autoplayNext) return;
    ps.autoplayTimerRef.current = setInterval(() => {
      ps.setAutoplayCountdown(prev => {
        if (prev <= 1) { clearInterval(ps.autoplayTimerRef.current); navigate(`/player/${nextItem.id}`); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(ps.autoplayTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps.showEndOverlay, ps.autoplayCancelled, nextItem, appSettings.autoplayNext]);

  // ── Skip intro — exposed for keyboard shortcut ────────────────────────────
  const skipIntro = useCallback(() => { if (ps.videoRef.current) ps.videoRef.current.currentTime = SKIP_INTRO_END; }, [ps.videoRef]);
  const resetControlsTimer = useCallback(() => {
    ps.setShowControls(true);
    clearTimeout(ps.controlsTimerRef.current);
    if (ps.playing) ps.controlsTimerRef.current = setTimeout(() => ps.setShowControls(false), 3000);
  }, [ps]);
  useEffect(() => { resetControlsTimer(); return () => clearTimeout(ps.controlsTimerRef.current); }, [ps.playing, ps.controlsTimerRef, resetControlsTimer]);

  // ── Fullscreen listener ───────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      ps.setFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange); // Samsung Tizen / Safari
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [ps]);

  // ── PiP listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const video = ps.videoRef.current;
    if (!video) return;
    const onEnter = () => ps.setIsPiP(true);
    const onLeave = () => ps.setIsPiP(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => { video.removeEventListener('enterpictureinpicture', onEnter); video.removeEventListener('leavepictureinpicture', onLeave); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync CC → TextTrack ───────────────────────────────────────────────────
  useEffect(() => {
    const video = ps.videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach(track => {
      track.mode = ps.ccLang === 'off' ? 'disabled' : track.language === ps.ccLang ? 'showing' : 'disabled';
    });
  }, [ps.ccLang, ps.videoRef]);

  // ── CC ::cue styling ──────────────────────────────────────────────────────
  useEffect(() => {
    const fontSize = ps.ccFontSize === 'small' ? '0.8em' : ps.ccFontSize === 'large' ? '1.4em' : '1em';
    const bg = ps.ccBgOpacity === 'none' ? 'transparent' : ps.ccBgOpacity === 'high' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)';
    let el = document.getElementById('homestream-cc-style') as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = 'homestream-cc-style'; document.head.appendChild(el); }
    el.textContent = `::cue { font-size: ${fontSize}; background-color: ${bg}; color: white; }`;
  }, [ps.ccFontSize, ps.ccBgOpacity]);

  // ── Cleanup thumb video ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (ps.thumbVideoRef.current) { ps.thumbVideoRef.current.src = ''; ps.thumbVideoRef.current.remove(); ps.thumbVideoRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Volume fade + navigate ────────────────────────────────────────────────
  const fadeAndNavigate = useCallback((to: string) => {
    const video = ps.videoRef.current;
    if (!video || video.muted) { navigate(to); return; }
    const startVol = video.volume;
    let step = 0;
    clearInterval(ps.fadeIntervalRef.current);
    ps.fadeIntervalRef.current = setInterval(() => {
      step++;
      video.volume = Math.max(0, startVol * (1 - step / 15));
      if (step >= 15) { clearInterval(ps.fadeIntervalRef.current); navigate(to); }
    }, 30);
  }, [navigate, ps.videoRef, ps.fadeIntervalRef]);

  // ── PiP toggle ────────────────────────────────────────────────────────────
  const togglePiP = useCallback(async () => {
    const video = ps.videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { /* not supported */ }
  }, [ps.videoRef]);

  // ── Seek hover thumbnail ──────────────────────────────────────────────────
  const handleSeekHover = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    const canvas = ps.thumbCanvasRef.current;
    if (!canvas || ps.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = pct * ps.duration;
    const x = e.clientX - rect.left;
    if (!ps.thumbVideoRef.current) {
      const tv = document.createElement('video');
      tv.muted = true; tv.preload = 'metadata'; tv.crossOrigin = 'anonymous'; tv.style.display = 'none';
      document.body.appendChild(tv);
      ps.thumbVideoRef.current = tv;
    }
    const tv = ps.thumbVideoRef.current;
    const currentSrc = ps.videoRef.current?.currentSrc ?? '';
    if (ps.thumbVideoSrcRef.current !== currentSrc) { ps.thumbVideoSrcRef.current = currentSrc; tv.src = currentSrc; }
    tv.currentTime = hoverTime;
    const onSeeked = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 160; canvas.height = 90;
      ctx.drawImage(tv, 0, 0, 160, 90);
      ps.setSeekHover({ x, time: hoverTime, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
      tv.removeEventListener('seeked', onSeeked);
    };
    tv.addEventListener('seeked', onSeeked);
  }, [ps]);

  // ── Double-tap seek (mobile) ──────────────────────────────────────────────
  const handleDoubleTap = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const video = ps.videoRef.current;
    const container = ps.containerRef.current;
    if (!video || !container) return;
    const touch = e.changedTouches[0];
    const rect = container.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    const third = rect.width / 3;
    if (relX >= third && relX <= third * 2) return;
    const side: 'forward' | 'back' = relX > third * 2 ? 'forward' : 'back';
    if (ps.doubleTapCountRef.current.side === side) ps.doubleTapCountRef.current.count += 1;
    else ps.doubleTapCountRef.current = { side, count: 1 };
    const seekSeconds = ps.doubleTapCountRef.current.count * 10;
    if (side === 'forward') video.currentTime = Math.min(video.currentTime + 10, video.duration);
    else video.currentTime = Math.max(video.currentTime - 10, 0);
    ps.setSeekFlash(side);
    ps.setSeekFlashCount(seekSeconds);
    clearTimeout(ps.doubleTapTimerRef.current);
    ps.doubleTapTimerRef.current = setTimeout(() => { ps.doubleTapCountRef.current = { side: 'forward', count: 0 }; ps.setSeekFlash(null); ps.setSeekFlashCount(0); }, 700);
  }, [ps]);

  // ── Back navigation — goes to movie/show detail page, not always home ────
  const backPath = useMemo(() => {
    if (!item) return '/';
    return item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`;
  }, [item]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  usePlayerKeyboard({
    videoRef: ps.videoRef,
    containerRef: ps.containerRef,
    tvFocus: ps.tvFocus,
    ccLang: ps.ccLang,
    audioTracks: ps.audioTracks,
    activeAudioTrack: ps.activeAudioTrack,
    setTvFocus: ps.setTvFocus,
    setShowControls: ps.setShowControls,
    setShowInfo: ps.setShowInfo,
    setShowShortcuts: ps.setShowShortcuts,
    setShowEndOverlay: ps.setShowEndOverlay,
    setShowSpeedMenu: ps.setShowSpeedMenu,
    setShowCcMenu: ps.setShowCcMenu,
    setCcLang: ps.setCcLang,
    setPlaybackRate: ps.setPlaybackRate,
    setVolume: ps.setVolume,
    setMuted: ps.setMuted,
    setSeekFlash: ps.setSeekFlash,
    setSeekFlashCount: ps.setSeekFlashCount,
    setActiveAudioTrack: ps.setActiveAudioTrack,
    showActionToast: ps.showActionToast,
    resetControlsTimer,
    togglePiP,
    fadeAndNavigate,
    backPath,
    playing: ps.playing,
  });

  // ── AI enrichment ─────────────────────────────────────────────────────────
  const runEnrichment = useCallback(async () => {
    if (!id || ps.enrichRunning) return;
    ps.setEnrichRunning(true);
    ps.setEnrichError(null);
    try {
      const res = await fetch(`/api/enrich/${id}`, { method: 'POST', headers: { Accept: 'text/event-stream' } });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      if (res.body) { const reader = res.body.getReader(); while (true) { const { done } = await reader.read(); if (done) break; } }
    } catch (err) {
      ps.setEnrichError(err instanceof Error ? err.message : 'Enrichment failed');
    } finally {
      ps.setEnrichRunning(false);
    }
  }, [id, ps]);

  const togglePlay = () => { if (!ps.videoRef.current) return; if (ps.playing) ps.videoRef.current.pause(); else ps.videoRef.current.play(); };
  const toggleMute = () => { if (!ps.videoRef.current) return; ps.videoRef.current.muted = !ps.muted; ps.setMuted(!ps.muted); };
  const toggleFullscreen = () => {
    const el = ps.containerRef.current;
    if (!el) return;
    const fsEl = document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    if (!fsEl) {
      // Standard API first, webkit fallback for older Samsung Tizen / Safari
      if (el.requestFullscreen) el.requestFullscreen();
      else (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
    }
  };
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseFloat(e.target.value); if (ps.videoRef.current) ps.videoRef.current.volume = v; ps.setVolume(v); ps.setMuted(v === 0); };
  // handleSeek: drives the video element only — seek bar is uncontrolled,
  // its visual state is updated by onTimeUpdate via direct DOM mutation.
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (ps.videoRef.current) ps.videoRef.current.currentTime = t;
    // Also update the ref immediately so progress saves are accurate mid-seek
    ps.currentTimeRef.current = t;
    sendRemoteStateNow();
  };
  const changeSpeed = (rate: number) => { if (ps.videoRef.current) ps.videoRef.current.playbackRate = rate; ps.setPlaybackRate(rate); ps.setShowSpeedMenu(false); };

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground mb-4">Media not found.</p>
          <button onClick={() => navigate('/')} className="text-primary hover:underline">Go Home</button>
        </div>
      </div>
    );
  }

  // ── Still transcoding ─────────────────────────────────────────────────────
  if (item.transcoding) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-6">
        <title>{item.title} — HomeStream</title>
        <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden bg-card flex-shrink-0 shadow-2xl">
          {item.poster
            ? <img src={item.poster} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <div className="w-full h-full flex items-center justify-center bg-card"><svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg></div>
          }
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-white text-xl font-heading mb-1">{item.title}</h2>
          <p className="text-white/50 text-sm mb-6">{item.year}{item.genre[0] !== 'Unknown' ? ` · ${item.genre.slice(0, 2).join(', ')}` : ''}</p>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
            <span className="text-white/60 text-sm">Optimizing for playback…</span>
          </div>
          <p className="text-white/30 text-xs">HomeStream is converting this file to H.264 for instant streaming.<br />This usually takes a few minutes. Come back soon.</p>
        </div>
        <div className="flex gap-3 mt-2">
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">← Back</button>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm transition-colors">Check Again</button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <RestrictedContentGuard rated={item.rated} contentTitle={item.title}>
    <div className="min-h-screen bg-black">
      <title>{item.title} — HomeStream</title>

      {/* ── Video Container ── */}
      <div
        ref={ps.containerRef}
        className="relative bg-black"
        style={{ aspectRatio: '16/9', maxHeight: '100vh' }}
        onMouseMove={resetControlsTimer}
        onClick={togglePlay}
      >
        <video
          ref={ps.videoRef}
          {...(!hlsUrl ? { src: `/api/stream/${item.filename}` } : {})}
          className="w-full h-full"
          preload="auto"
          onPlay={() => { ps.setPlaying(true); sendRemoteStateNow(); }}
          onPause={() => { ps.setPlaying(false); saveProgress(); sendRemoteStateNow(); }}
          onTimeUpdate={() => {
            const video = ps.videoRef.current;
            if (!video) return;

            // ── Hot path: zero React state updates ──────────────────────────
            // Write to refs only — DOM updates happen here, not via setState.
            ps.currentTimeRef.current = video.currentTime;
            const buf = video.buffered;
            const dur = video.duration || 0;
            if (buf.length > 0) ps.bufferedRef.current = buf.end(buf.length - 1);

            // Update seek bar gradient + value directly (no React re-render)
            const seekBar = ps.seekBarRef.current;
            if (seekBar && dur > 0) {
              const pct = (video.currentTime / dur) * 100;
              seekBar.value = String(video.currentTime);
              seekBar.style.background = `linear-gradient(to right, ${playerAccent} ${pct}%, rgba(255,255,255,0.2) 0%)`;
            }

            // Update buffered bar width directly (no React re-render)
            const bufferedBar = ps.bufferedBarRef.current;
            if (bufferedBar && dur > 0) {
              bufferedBar.style.width = `${(ps.bufferedRef.current / dur) * 100}%`;
            }

            // Update time display span directly (no React re-render)
            if (ps.timeDisplayRef.current && dur > 0) {
              ps.timeDisplayRef.current.textContent =
                `${formatTime(video.currentTime)} / ${formatTime(dur)}`;
            }

            // Remote state broadcast — throttled to at most once per 2 seconds
            // using a wall-clock ref so it never fires multiple times per second.
            const now = Date.now();
            if (now - lastRemoteSendRef.current >= 2000) {
              lastRemoteSendRef.current = now;
              sendState({
                mediaId: id ?? '',
                title: item.title ?? '',
                poster: item.poster,
                currentTime: video.currentTime,
                duration: dur,
                paused: video.paused,
                volume: video.volume,
                speed: video.playbackRate,
                hasNextEpisode: !!nextItem,
                subtitleTracks: [{ index: 0, label: 'English', language: 'en' }, { index: 1, label: 'Español', language: 'es' }],
                activeSubtitle: ps.ccLang === 'off' ? -1 : ps.ccLang === 'en' ? 0 : 1,
                cast: ps.castInfo ?? undefined,
              });
            }
          }}
          onLoadedMetadata={() => {
            const video = ps.videoRef.current;
            if (!video) return;
            ps.setDuration(video.duration);
            const resumeSeconds = item.watchedSeconds && item.watchedSeconds > 0
              ? item.watchedSeconds
              : item.watchProgress && item.watchProgress > 2 && item.watchProgress < 95
                ? (item.watchProgress / 100) * video.duration
                : 0;
            if (appSettings.autoResume && !ps.resumeApplied.current && resumeSeconds > 5) {
              video.currentTime = resumeSeconds;
              ps.resumeApplied.current = true;
              ps.setShowResumeBanner(true);
              clearTimeout(ps.resumeBannerTimer.current);
              ps.resumeBannerTimer.current = setTimeout(() => ps.setShowResumeBanner(false), 4000);
            }
            // Push initial state to remote immediately so it shows title/duration
            sendRemoteStateNow();
          }}
          onCanPlayThrough={() => ps.setVideoLoading(false)}
          onWaiting={() => ps.setVideoLoading(true)}
          onPlaying={() => ps.setVideoLoading(false)}
          onVolumeChange={() => {
            const video = ps.videoRef.current;
            if (video) { ps.setVolume(video.volume); ps.setMuted(video.muted); sendRemoteStateNow(); }
          }}
          onError={() => {
            const video = ps.videoRef.current;
            const code = video?.error?.code;
            const msgs: Record<number, string> = {
              1: 'Playback aborted',
              2: 'Network error — check your connection to the HomeStream server',
              3: 'Decoding error — this file format may not be supported by your browser',
              4: 'File not found or unsupported format',
            };
            ps.setVideoError(msgs[code ?? 4] ?? 'Unable to play this file');
            ps.setVideoLoading(false);
          }}
        >
          <track kind="subtitles" srcLang="en" label="English" src={`/api/captions/${item.id}/en`} default={ps.ccLang === 'en'} />
          <track kind="subtitles" srcLang="es" label="Español" src={`/api/captions/${item.id}/es`} default={ps.ccLang === 'es'} />
        </video>

        {/* Transcode overlay */}
        {isTranscoding && transcodeJob && <TranscodeProgressOverlay job={transcodeJob} />}

        {/* HLS badge */}
        {hlsUrl && hlsCodec && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/20 text-white text-[11px] font-semibold backdrop-blur-sm pointer-events-none">
            <Cpu className="w-3 h-3 text-yellow-400 animate-pulse" />
            Live transcoding {hlsCodec.toUpperCase()} → H.264
          </div>
        )}

        {/* Loading spinner */}
        <AnimatePresence>
          {ps.videoLoading && !ps.videoError && !isTranscoding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
            </motion.div>
          )}

          {/* Video error */}
          {ps.videoError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-2">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-white text-lg font-semibold">Unable to Play</h2>
              <p className="text-white/60 text-sm max-w-sm leading-relaxed">{ps.videoError}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => { ps.setVideoError(null); ps.setVideoLoading(true); if (ps.videoRef.current) { ps.videoRef.current.load(); ps.videoRef.current.play().catch(() => {}); } }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">Try Again</button>
                <button onClick={() => navigate(-1)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">Go Back</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Seek flash */}
        <AnimatePresence>
          {ps.seekFlash && (
            <motion.div
              key={`${ps.seekFlash}-${ps.seekFlashCount}`}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.15 }}
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1 ${ps.seekFlash === 'forward' ? 'right-16' : 'left-16'}`}
            >
              <div className="bg-black/50 rounded-full p-3">
                {ps.seekFlash === 'forward' ? <FastForward className="w-8 h-8 text-white" /> : <Rewind className="w-8 h-8 text-white" />}
              </div>
              <span className="text-white text-sm font-semibold drop-shadow">
                {ps.seekFlash === 'forward' ? `+${ps.seekFlashCount}s` : `-${ps.seekFlashCount}s`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Double-tap zones */}
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', pointerEvents: 'auto' }} onTouchEnd={handleDoubleTap}>
          <div className="relative overflow-hidden" />
          <div />
          <div className="relative overflow-hidden" />
        </div>

        {/* Action toast */}
        <AnimatePresence>
          {ps.actionToast && (
            <motion.div key={ps.actionToast} initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-30">
              <div className="bg-black/80 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl">{ps.actionToast}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TV focus label */}
        <AnimatePresence>
          {ps.tvFocus && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20">
              <div className="bg-black/60 border border-white/10 text-white/50 text-[10px] px-3 py-1 rounded-full">
                Remote focus: <span className="text-white font-semibold uppercase">{ps.tvFocus}</span>
                <span className="ml-2 text-white/30">· Tab to move · Enter to activate · Esc to clear</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip Intro */}
        <AnimatePresence>
          {ps.showSkipIntro && !ps.showEndOverlay && (
            <motion.button
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}
              onClick={e => { e.stopPropagation(); skipIntro(); }}
              className="absolute bottom-20 right-6 flex items-center gap-2 bg-black/70 hover:bg-black/90 border border-white/30 hover:border-white/60 text-white px-4 py-2 rounded text-sm font-medium transition-colors backdrop-blur-sm z-10"
            >
              <SkipForward className="w-4 h-4" /> Skip Intro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Resume banner */}
        <AnimatePresence>
          {ps.showResumeBanner && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/85 backdrop-blur-sm border border-white/20 text-white px-4 py-2.5 rounded-2xl text-sm font-medium z-20 shadow-xl">
              <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-white/80 text-xs whitespace-nowrap">
                Resuming from {formatTime(item.watchedSeconds ?? ((item.watchProgress ?? 0) / 100) * ps.duration)}
              </span>
              <button onClick={() => { if (ps.videoRef.current) ps.videoRef.current.currentTime = 0; ps.setShowResumeBanner(false); clearTimeout(ps.resumeBannerTimer.current); }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-xs font-semibold whitespace-nowrap">
                <RotateCcw className="w-3 h-3" /> From Beginning
              </button>
              <button onClick={() => { ps.setShowResumeBanner(false); clearTimeout(ps.resumeBannerTimer.current); }}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0">
                <XIcon className="w-3 h-3 text-white/60" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls overlay */}
        <AnimatePresence>
          {ps.showControls && !ps.showEndOverlay && (
            <PlayerControlsOverlay
              item={{ ...item, usingHls: !!hlsUrl }}
              playing={ps.playing}
              duration={ps.duration}
              volume={ps.volume}
              muted={ps.muted}
              fullscreen={ps.fullscreen}
              playbackRate={ps.playbackRate}
              isPiP={ps.isPiP}
              showInfo={ps.showInfo}
              showSpeedMenu={ps.showSpeedMenu}
              showCcMenu={ps.showCcMenu}
              showAudioMenu={ps.showAudioMenu}
              ccLang={ps.ccLang}
              ccFontSize={ps.ccFontSize}
              ccBgOpacity={ps.ccBgOpacity}
              audioTracks={ps.audioTracks}
              activeAudioTrack={ps.activeAudioTrack}
              tvFocus={ps.tvFocus}
              playerAccent={playerAccent}
              seekHover={ps.seekHover}
              seekBarRef={ps.seekBarRef}
              thumbCanvasRef={ps.thumbCanvasRef}
              currentTimeRef={ps.currentTimeRef}
              bufferedRef={ps.bufferedRef}
              timeDisplayRef={ps.timeDisplayRef}
              bufferedBarRef={ps.bufferedBarRef}
              castButtonRef={castButtonRef}
              videoRef={ps.videoRef}
              togglePlay={togglePlay}
              toggleMute={toggleMute}
              toggleFullscreen={toggleFullscreen}
              togglePiP={togglePiP}
              handleSeek={handleSeek}
              handleVolumeChange={handleVolumeChange}
              handleSeekHover={handleSeekHover}
              changeSpeed={changeSpeed}
              setCcLang={ps.setCcLang}
              setCcFontSize={ps.setCcFontSize}
              setCcBgOpacity={ps.setCcBgOpacity}
              setActiveAudioTrack={ps.setActiveAudioTrack}
              setShowInfo={ps.setShowInfo}
              setShowSpeedMenu={ps.setShowSpeedMenu}
              setShowCcMenu={ps.setShowCcMenu}
              setShowAudioMenu={ps.setShowAudioMenu}
              setShowShortcuts={ps.setShowShortcuts}
              setSeekHover={ps.setSeekHover}
              setSeekFlash={ps.setSeekFlash}
              setSeekFlashCount={ps.setSeekFlashCount}
              setShowResumeBanner={ps.setShowResumeBanner}
              resumeBannerTimer={ps.resumeBannerTimer}
              showActionToast={ps.showActionToast}
              fadeAndNavigate={fadeAndNavigate}
              setCastInfo={ps.setCastInfo}
            />
          )}
        </AnimatePresence>

        {/* End overlay */}
        <AnimatePresence>
          {ps.showEndOverlay && (
            <PlayerEndOverlay
              item={item}
              nextItem={nextItem}
              similarItems={similarItems}
              resumeItems={resumeItems}
              autoplayCountdown={ps.autoplayCountdown}
              autoplayCancelled={ps.autoplayCancelled}
              autoplayTimerRef={ps.autoplayTimerRef}
              videoRef={ps.videoRef}
              watchCompleteTriggered={ps.watchCompleteTriggered}
              setShowEndOverlay={ps.setShowEndOverlay}
              setAutoplayCancelled={ps.setAutoplayCancelled}
              fadeAndNavigate={fadeAndNavigate}
            />
          )}
        </AnimatePresence>

        {/* Info panel */}
        <AnimatePresence>
          {ps.showInfo && <PlayerInfoPanel item={item} />}
        </AnimatePresence>

        {/* Shortcuts overlay */}
        <AnimatePresence>
          {ps.showShortcuts && <PlayerShortcutsOverlay onClose={() => ps.setShowShortcuts(false)} />}
        </AnimatePresence>
      </div>

      {/* Below fold */}
      <PlayerBelowFold
        item={item}
        similarItems={similarItems}
        continueWatching={continueWatching}
        enrichRunning={ps.enrichRunning}
        enrichError={ps.enrichError}
        runEnrichment={runEnrichment}
      />
    </div>
    </RestrictedContentGuard>
  );
}
