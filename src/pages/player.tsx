import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Info, Star, RotateCcw, Sparkles, MessageCircle, SkipForward,
  CheckCircle2, FastForward, Rewind, Wand2, Loader2, Captions,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import { useTheme } from '@/context/ThemeContext';
import MediaCard from '@/components/MediaCard';
import CastButton from '@/components/CastButton';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Circular SVG countdown ring */
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const progress = seconds / total;
  const dash = circ * progress;
  return (
    <svg width="72" height="72" className="absolute inset-0 -rotate-90">
      {/* Track */}
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      {/* Progress */}
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s linear' }}
      />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const AUTOPLAY_SECONDS = 60;
const SKIP_INTRO_END = 240; // 4 minutes

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, updateProgress, triggerPostWatchRecommendation, continueWatching } = useMedia();
  const { isAllowed } = useProfile();
  const { settings: appSettings } = useTheme();
  const playerAccent = appSettings.syncPlayerColor ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.9)';
  const item = library.find(m => m.id === id);

  // ── Kids profile block — redirect if content not allowed ──
  useEffect(() => {
    if (item && !isAllowed(item.rated)) {
      navigate('/', { replace: true });
    }
  }, [item, isAllowed, navigate]);

  // ── Reset speed + watched flag when video id changes ──
  useEffect(() => {
    setPlaybackRate(1);
    setShowSpeedMenu(false);
    setCcLang('off');
    setShowCcMenu(false);
    watchCompleteTriggered.current = false;
    resumeApplied.current = false;
    setShowEndOverlay(false);
    setAutoplayCancelled(false);
    setVideoLoading(true);
  }, [id]);

  // ── Refs ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const watchCompleteTriggered = useRef(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Double-tap seek refs — track tap count per side so rapid taps accumulate
  // e.g. triple-tap = +30s, exactly like Netflix mobile
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const doubleTapCountRef = useRef<{ side: 'forward' | 'back'; count: number }>({ side: 'forward', count: 0 });

  // ── State ──
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(AUTOPLAY_SECONDS);
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [seekFlash, setSeekFlash] = useState<'forward' | 'back' | null>(null);
  const [seekFlashCount, setSeekFlashCount] = useState(0); // accumulated taps for label (+10s, +20s…)
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  // Closed captions
  const [ccLang, setCcLang] = useState<'off' | 'en' | 'es'>('off');
  const [showCcMenu, setShowCcMenu] = useState(false);
  // Loading state — true until canplaythrough fires (enough buffered to play without stall)
  const [videoLoading, setVideoLoading] = useState(true);
  const resumeApplied = useRef(false);
  // Resume banner
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const resumeBannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── TV Remote / D-pad navigation ──────────────────────────────────────────
  // Controls in tab order — matches left-to-right layout in the control bar
  // 'seek' is the seek bar itself (arrow keys scrub when focused)
  type TvControl =
    | 'back' | 'rewind' | 'play' | 'forward'
    | 'mute' | 'volume' | 'seek'
    | 'speed' | 'cc' | 'fullscreen' | 'cast';

  const TV_CONTROLS: TvControl[] = [
    'back', 'rewind', 'play', 'forward',
    'mute', 'volume', 'seek',
    'speed', 'cc', 'fullscreen', 'cast',
  ];

  const [tvFocus, setTvFocus] = useState<TvControl | null>(null);
  // On-screen action toast (speed change, CC change, etc.)
  const [actionToast, setActionToast] = useState<string | null>(null);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showActionToast = useCallback((msg: string) => {
    setActionToast(msg);
    clearTimeout(actionToastTimer.current);
    actionToastTimer.current = setTimeout(() => setActionToast(null), 1800);
  }, []);

  // ── AI Enrichment (on-demand from player page) ──
  const [enrichRunning, setEnrichRunning] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const runEnrichment = useCallback(async () => {
    if (!id || enrichRunning) return;
    setEnrichRunning(true);
    setEnrichError(null);
    try {
      // The enrich endpoint streams SSE — we just drain it; MediaContext will
      // pick up the updated item via its polling interval.
      const res = await fetch(`/api/enrich/${id}`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'Enrichment failed');
    } finally {
      setEnrichRunning(false);
    }
  }, [id, enrichRunning]);

  // ── Derived ──
  const resumeItems = continueWatching
    .filter(c => c.id !== id && c.progress > 5 && c.progress < 90)
    .slice(0, 2)
    .map(c => ({ ...library.find(m => m.id === c.id)!, progress: c.progress }))
    .filter(m => m.id);

  const similarItems = item
    ? library
        .filter(m => m.id !== item.id)
        .map(m => {
          let score = 0;

          // ── Base signals (always available) ──
          const sharedGenres = m.genre.filter(g => item.genre.includes(g)).length;
          score += sharedGenres * 3;
          if (m.director && item.director && m.director !== 'Unknown' && m.director === item.director) score += 4;
          const itemActors = item.actors.split(',').map(a => a.trim());
          const mActors = m.actors.split(',').map(a => a.trim());
          score += mActors.filter(a => a !== 'Unknown' && itemActors.includes(a)).length * 2;
          if (m.type === item.type) score += 1;
          if (Math.abs((parseFloat(m.imdbRating) || 0) - (parseFloat(item.imdbRating) || 0)) < 1.5) score += 1;

          // ── AI enrichment signals (when available) ──
          const itemEnrich = item.enrichment;
          const mEnrich = m.enrichment;

          if (itemEnrich && mEnrich) {
            // Shared tags — most powerful signal (specific content overlap)
            const sharedTags = mEnrich.tags.filter(t => itemEnrich.tags.includes(t)).length;
            score += sharedTags * 4;

            // Shared mood — viewer is in a specific mood
            const sharedMood = mEnrich.mood.filter(mood => itemEnrich.mood.includes(mood)).length;
            score += sharedMood * 3;

            // Shared themes — deeper thematic resonance
            const sharedThemes = mEnrich.themes.filter(t => itemEnrich.themes.includes(t)).length;
            score += sharedThemes * 3;

            // Same pacing preference
            if (mEnrich.pacing === itemEnrich.pacing) score += 2;

            // Same audience age
            if (mEnrich.audienceAge === itemEnrich.audienceAge) score += 2;

            // Appears in "similar titles" list from AI knowledge
            const titleLower = m.title.toLowerCase();
            if (itemEnrich.similarTitles.some(t => t.toLowerCase().includes(titleLower) || titleLower.includes(t.toLowerCase()))) {
              score += 6; // Strong signal — AI explicitly recommended this
            }
          } else if (itemEnrich && !mEnrich) {
            // Partial: item has enrichment but candidate doesn't
            // Still boost if candidate title appears in item's similar list
            const titleLower = m.title.toLowerCase();
            if (itemEnrich.similarTitles.some(t => t.toLowerCase().includes(titleLower) || titleLower.includes(t.toLowerCase()))) {
              score += 5;
            }
          }

          return { item: m, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ item: m }) => m)
    : [];

  // ── Next item: for series try to find the next episode in the library,
  //    otherwise fall back to the top similarity match ──
  const nextItem = (() => {
    if (!item) return null;

    if (item.type === 'series') {
      // Try to find another episode of the same show that hasn't been watched yet.
      // Match by title prefix (same show name) and pick the one with the lowest
      // season/episode number that is still unwatched (watchProgress < 90).
      const showTitle = item.title
        .replace(/\s*[Ss]\d+[Ee]\d+.*$/, '')   // strip S01E02 suffix
        .replace(/\s*[-–]\s*Season\s*\d+.*$/i, '') // strip "Season N" suffix
        .replace(/\s*\(\d{4}\)$/, '')           // strip year
        .trim()
        .toLowerCase();

      const sameShow = library
        .filter(m =>
          m.id !== item.id &&
          m.type === 'series' &&
          m.title.toLowerCase().startsWith(showTitle) &&
          (m.watchProgress ?? 0) < 90
        )
        .sort((a, b) => {
          // Sort by season then episode extracted from filename / title
          const epNum = (t: string) => {
            const m = t.match(/[Ss](\d+)[Ee](\d+)/);
            return m ? parseInt(m[1]) * 1000 + parseInt(m[2]) : 9999;
          };
          return epNum(a.filename) - epNum(b.filename);
        });

      if (sameShow.length > 0) return sameShow[0];
    }

    // Fallback: top similarity match
    return similarItems[0] ?? null;
  })();

  // ── Save progress helper — call this any time we want to persist ──
  const saveProgress = useCallback(() => {
    if (!id || duration <= 0 || currentTime <= 0) return;
    const pct = (currentTime / duration) * 100;
    updateProgress(id, pct, currentTime, duration);
  }, [id, currentTime, duration, updateProgress]);

  // ── Save progress every 10s ──
  useEffect(() => {
    if (!id || currentTime === 0) return;
    const interval = setInterval(() => {
      if (duration > 0) updateProgress(id, (currentTime / duration) * 100, currentTime, duration);
    }, 10000);
    return () => clearInterval(interval);
  }, [id, currentTime, duration, updateProgress]);

  // ── Save on tab hide / window blur (user switches away) ──
  useEffect(() => {
    if (!id) return;
    const onVisibilityChange = () => {
      if (document.hidden) saveProgress();
    };
    const onBeforeUnload = () => saveProgress();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [id, saveProgress]);

  // ── Save on navigate away (React Router unmount) ──
  useEffect(() => {
    return () => {
      // Flush progress when leaving the player page
      if (id && videoRef.current && videoRef.current.duration > 0) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        const pct = (ct / dur) * 100;
        // Fire-and-forget — use sendBeacon for reliability on unload
        const payload = JSON.stringify({ progress: pct, currentTime: ct, duration: dur });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(`/api/media/${id}/progress`, blob);
        } else {
          fetch(`/api/media/${id}/progress`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [id]);

  // ── Watch-complete trigger at 85% ──
  useEffect(() => {
    if (!id || duration === 0 || watchCompleteTriggered.current) return;
    if ((currentTime / duration) * 100 >= 85) {
      watchCompleteTriggered.current = true;
      triggerPostWatchRecommendation(id);
      setShowEndOverlay(true);
      setAutoplayCountdown(AUTOPLAY_SECONDS);
      setAutoplayCancelled(false);
    }
  }, [currentTime, duration, id, triggerPostWatchRecommendation]);

  // ── Autoplay countdown ──
  useEffect(() => {
    if (!showEndOverlay || autoplayCancelled || !nextItem || !appSettings.autoplayNext) return;
    autoplayTimerRef.current = setInterval(() => {
      setAutoplayCountdown(prev => {
        if (prev <= 1) {
          clearInterval(autoplayTimerRef.current);
          navigate(`/player/${nextItem.id}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(autoplayTimerRef.current);
  }, [showEndOverlay, autoplayCancelled, nextItem, navigate, appSettings.autoplayNext]);

  // ── Skip Intro visibility + auto-skip ──
  useEffect(() => {
    const inIntro = currentTime > 30 && currentTime < SKIP_INTRO_END && playing;
    setShowSkipIntro(inIntro);
    if (inIntro && appSettings.autoSkipIntro) {
      skipIntro();
    }
  }, [currentTime, playing, appSettings.autoSkipIntro]);

  // ── Auto-hide controls ──
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    if (playing) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimerRef.current);
  }, [playing, resetControlsTimer]);

  // ── Fullscreen listener ──
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Sync CC language → native TextTrack mode ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = Array.from(video.textTracks);
    tracks.forEach(track => {
      if (ccLang === 'off') {
        track.mode = 'disabled';
      } else if (track.language === ccLang) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    });
  }, [ccLang]);

  // ── Keyboard shortcuts + TV D-pad navigation ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const video = videoRef.current;
      if (!video) return;

      const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      const CC_CYCLE: Array<'off' | 'en' | 'es'> = ['off', 'en', 'es'];

      // ── D-pad: Tab / ArrowUp / ArrowDown move focus between controls ──
      // When a control is focused, ArrowLeft/Right operate that control
      // When no control is focused, ArrowLeft/Right seek as normal
      const focusIdx = tvFocus ? TV_CONTROLS.indexOf(tvFocus) : -1;

      // Tab / Shift+Tab — cycle through controls (TV remote OK button equivalent)
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = e.shiftKey
          ? (focusIdx <= 0 ? TV_CONTROLS.length - 1 : focusIdx - 1)
          : (focusIdx >= TV_CONTROLS.length - 1 ? 0 : focusIdx + 1);
        setTvFocus(TV_CONTROLS[next]);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

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
            // D-pad left on speed = slow down
            const cur = video.playbackRate;
            const idx = speeds.indexOf(cur);
            const prev = speeds[Math.max(idx - 1, 0)];
            video.playbackRate = prev;
            setPlaybackRate(prev);
            showActionToast(prev === 1 ? 'Speed: Normal' : `Speed: ${prev}×`);
          } else if (tvFocus === 'volume') {
            video.volume = Math.max(video.volume - 0.1, 0);
            setVolume(Math.max(video.volume, 0));
          } else {
            // Default: seek back
            video.currentTime = Math.max(video.currentTime - 10, 0);
            setSeekFlash('back');
            setSeekFlashCount(10);
            setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
          }
          break;

        // ── Seek / D-pad right ──
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          if (tvFocus === 'speed') {
            const cur = video.playbackRate;
            const idx = speeds.indexOf(cur);
            const next = speeds[Math.min(idx + 1, speeds.length - 1)];
            video.playbackRate = next;
            setPlaybackRate(next);
            showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          } else if (tvFocus === 'volume') {
            video.volume = Math.min(video.volume + 0.1, 1);
            setVolume(Math.min(video.volume, 1));
          } else {
            video.currentTime = Math.min(video.currentTime + 10, video.duration);
            setSeekFlash('forward');
            setSeekFlashCount(10);
            setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
          }
          break;

        // ── D-pad up — move focus row up or raise volume ──
        case 'ArrowUp':
          e.preventDefault();
          if (tvFocus === null) {
            video.volume = Math.min(video.volume + 0.1, 1);
            setVolume(Math.min(video.volume, 1));
            showActionToast(`Volume ${Math.round(Math.min(video.volume, 1) * 100)}%`);
          } else {
            // Move focus to previous control
            const prev = focusIdx <= 0 ? TV_CONTROLS.length - 1 : focusIdx - 1;
            setTvFocus(TV_CONTROLS[prev]);
          }
          break;

        // ── D-pad down — move focus row down or lower volume ──
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

        // ── Enter / OK — activate focused control ──
        case 'Enter': {
          e.preventDefault();
          if (!tvFocus) { if (video.paused) video.play(); else video.pause(); break; }
          switch (tvFocus) {
            case 'back':        fadeAndNavigate('/'); break;
            case 'play':        if (video.paused) video.play(); else video.pause(); break;
            case 'rewind':      video.currentTime = Math.max(video.currentTime - 10, 0);
                                setSeekFlash('back'); setSeekFlashCount(10);
                                setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600); break;
            case 'forward':     video.currentTime = Math.min(video.currentTime + 10, video.duration);
                                setSeekFlash('forward'); setSeekFlashCount(10);
                                setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600); break;
            case 'mute':        video.muted = !video.muted; break;
            case 'fullscreen':  if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
                                else document.exitFullscreen(); break;
            case 'speed': {
              const cur = video.playbackRate;
              const idx = speeds.indexOf(cur);
              const next = speeds[(idx + 1) % speeds.length];
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

        // ── C — cycle CC (one-button like Netflix remote) ──
        case 'c':
        case 'C': {
          const curIdx = CC_CYCLE.indexOf(ccLang);
          const nextCC = CC_CYCLE[(curIdx + 1) % CC_CYCLE.length];
          setCcLang(nextCC);
          showActionToast(nextCC === 'off' ? 'CC: Off' : nextCC === 'en' ? 'CC: English' : 'CC: Español');
          break;
        }

        // ── S — cycle speed ──
        case 's':
        case 'S': {
          const cur = video.playbackRate;
          const idx = speeds.indexOf(cur);
          const next = speeds[(idx + 1) % speeds.length];
          video.playbackRate = next;
          setPlaybackRate(next);
          showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          break;
        }

        // ── M — mute ──
        case 'm':
        case 'M':
          video.muted = !video.muted;
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

        // ── Escape — close menus / clear TV focus ──
        case 'Escape':
          if (tvFocus) { setTvFocus(null); break; }
          setShowEndOverlay(false);
          setShowInfo(false);
          setShowSpeedMenu(false);
          setShowCcMenu(false);
          break;

        // ── Legacy speed keys < > ──
        case '>':
        case '.': {
          const cur = video.playbackRate;
          const idx = speeds.indexOf(cur);
          const next = speeds[Math.min(idx + 1, speeds.length - 1)];
          video.playbackRate = next;
          setPlaybackRate(next);
          showActionToast(next === 1 ? 'Speed: Normal' : `Speed: ${next}×`);
          break;
        }
        case '<':
        case ',': {
          const cur = video.playbackRate;
          const idx = speeds.indexOf(cur);
          const prev = speeds[Math.max(idx - 1, 0)];
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

  // ── Volume fade helper ──
  const fadeAndNavigate = useCallback((to: string) => {
    const video = videoRef.current;
    if (!video || video.muted) { navigate(to); return; }
    const startVol = video.volume;
    const steps = 15;
    let step = 0;
    clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = setInterval(() => {
      step++;
      video.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(fadeIntervalRef.current);
        navigate(to);
      }
    }, 30);
  }, [navigate]);

  // ── Double-tap seek (mobile Netflix-style) ────────────────────────────────
  // Each tap on the left/right third of the screen adds 10s to the seek.
  // Taps accumulate for 400ms — triple-tap = +30s, quad = +40s, etc.
  // The middle third is reserved for play/pause so accidental taps don't seek.
  const handleDoubleTap = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const touch = e.changedTouches[0];
    const rect = container.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    const third = rect.width / 3;

    // Middle third = play/pause zone — ignore for seek
    if (relX >= third && relX <= third * 2) return;

    const side: 'forward' | 'back' = relX > third * 2 ? 'forward' : 'back';

    // Accumulate taps on the same side
    if (doubleTapCountRef.current.side === side) {
      doubleTapCountRef.current.count += 1;
    } else {
      doubleTapCountRef.current = { side, count: 1 };
    }

    const totalCount = doubleTapCountRef.current.count;
    const seekSeconds = totalCount * 10;

    // Apply seek immediately on each tap
    if (side === 'forward') {
      video.currentTime = Math.min(video.currentTime + 10, video.duration);
    } else {
      video.currentTime = Math.max(video.currentTime - 10, 0);
    }

    // Update flash indicator with accumulated count
    setSeekFlash(side);
    setSeekFlashCount(seekSeconds);

    // Reset after 400ms of no taps — clears the accumulator and hides flash
    clearTimeout(doubleTapTimerRef.current);
    doubleTapTimerRef.current = setTimeout(() => {
      doubleTapCountRef.current = { side: 'forward', count: 0 };
      setSeekFlash(null);
      setSeekFlashCount(0);
    }, 700);
  }, []);

  // ── Controls ──
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause(); else videoRef.current.play();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.volume = v;
    setVolume(v);
    setMuted(v === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) containerRef.current.requestFullscreen();
    else document.exitFullscreen();
  };

  const skipIntro = () => {
    if (videoRef.current) videoRef.current.currentTime = SKIP_INTRO_END;
  };

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  const changeSpeed = (rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  // ── Not found ──
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

  // ── Still transcoding — show a friendly holding screen instead of blank video ──
  if (item.transcoding) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-6">
        <title>{item.title} — HomeStream</title>
        {/* Poster or placeholder */}
        <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden bg-card flex-shrink-0 shadow-2xl">
          {item.poster ? (
            <img src={item.poster} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-card">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
            </div>
          )}
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-white text-xl font-heading mb-1">{item.title}</h2>
          <p className="text-white/50 text-sm mb-6">{item.year}{item.genre[0] !== 'Unknown' ? ` · ${item.genre.slice(0, 2).join(', ')}` : ''}</p>
          {/* Animated processing indicator */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-white/60 text-sm">Optimizing for playback…</span>
          </div>
          <p className="text-white/30 text-xs">
            HomeStream is converting this file to H.264 for instant streaming.<br />
            This usually takes a few minutes. Come back soon.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
          >
            ← Back to Home
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm transition-colors"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <title>{item.title} — HomeStream</title>

      {/* ── Video Container ── */}
      <div
        ref={containerRef}
        className="relative bg-black"
        style={{ aspectRatio: '16/9', maxHeight: '100vh' }}
        onMouseMove={resetControlsTimer}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={`/api/stream/${item.filename}`}
          className="w-full h-full"
          // preload=auto tells the browser to start filling its decode buffer
          // immediately on page load — by the time the user hits Play the first
          // several seconds are already decoded and ready to render instantly.
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            // Save immediately when user pauses — catches stop/close scenarios
            saveProgress();
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              const buf = videoRef.current.buffered;
              if (buf.length > 0) setBuffered(buf.end(buf.length - 1));
            }
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video) return;
            setDuration(video.duration);
            // Restore resume position exactly once, as soon as we know duration.
            // Prefer watchedSeconds (raw seconds) for precision; fall back to watchProgress %.
            const resumeSeconds = item.watchedSeconds && item.watchedSeconds > 0
              ? item.watchedSeconds
              : item.watchProgress && item.watchProgress > 2 && item.watchProgress < 95
                ? (item.watchProgress / 100) * video.duration
                : 0;
            if (appSettings.autoResume && !resumeApplied.current && resumeSeconds > 5) {
              video.currentTime = resumeSeconds;
              resumeApplied.current = true;
              // Show resume banner for 4 seconds
              setShowResumeBanner(true);
              clearTimeout(resumeBannerTimer.current);
              resumeBannerTimer.current = setTimeout(() => setShowResumeBanner(false), 4000);
            }
          }}
          onCanPlayThrough={() => {
            // Browser has buffered enough to play all the way through without stalling.
            // Hide the loading spinner — this is the true "ready" signal.
            setVideoLoading(false);
          }}
          onWaiting={() => setVideoLoading(true)}
          onPlaying={() => setVideoLoading(false)}
          onVolumeChange={() => {
            if (videoRef.current) {
              setVolume(videoRef.current.volume);
              setMuted(videoRef.current.muted);
            }
          }}
        >
          {/* WebVTT caption tracks — served from /api/captions/:id/:lang if present */}
          <track
            kind="subtitles"
            srcLang="en"
            label="English"
            src={`/api/captions/${item.id}/en`}
            default={ccLang === 'en'}
          />
          <track
            kind="subtitles"
            srcLang="es"
            label="Español"
            src={`/api/captions/${item.id}/es`}
            default={ccLang === 'es'}
          />
        </video>

        {/* ── Loading Spinner — only shown while buffering ── */}
        <AnimatePresence>
          {videoLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Seek Flash Indicator ── */}
        <AnimatePresence>
          {seekFlash && (
            <motion.div
              key={`${seekFlash}-${seekFlashCount}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.15 }}
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1 ${
                seekFlash === 'forward' ? 'right-16' : 'left-16'
              }`}
            >
              <div className="bg-black/50 rounded-full p-3">
                {seekFlash === 'forward'
                  ? <FastForward className="w-8 h-8 text-white" />
                  : <Rewind className="w-8 h-8 text-white" />
                }
              </div>
              <span className="text-white text-sm font-semibold drop-shadow">
                {seekFlash === 'forward' ? `+${seekFlashCount}s` : `-${seekFlashCount}s`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Double-tap seek zones (mobile) ── */}
        {/* Left zone: rewind | Middle zone: play/pause | Right zone: forward */}
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: '1fr 1fr 1fr', pointerEvents: 'auto' }}
          onTouchEnd={handleDoubleTap}
        >
          <div className="relative overflow-hidden" />
          <div />
          <div className="relative overflow-hidden" />
        </div>

        {/* ── Action Toast (speed / CC / volume feedback) ── */}
        <AnimatePresence>
          {actionToast && (
            <motion.div
              key={actionToast}
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-30"
            >
              <div className="bg-black/80 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl">
                {actionToast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TV Focus Indicator label ── */}
        <AnimatePresence>
          {tvFocus && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20"
            >
              <div className="bg-black/60 border border-white/10 text-white/50 text-[10px] px-3 py-1 rounded-full">
                Remote focus: <span className="text-white font-semibold uppercase">{tvFocus}</span>
                <span className="ml-2 text-white/30">· Tab to move · Enter to activate · Esc to clear</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSkipIntro && !showEndOverlay && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              onClick={e => { e.stopPropagation(); skipIntro(); }}
              className="absolute bottom-20 right-6 flex items-center gap-2 bg-black/70 hover:bg-black/90 border border-white/30 hover:border-white/60 text-white px-4 py-2 rounded text-sm font-medium transition-colors backdrop-blur-sm z-10"
            >
              <SkipForward className="w-4 h-4" />
              Skip Intro
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Resume Banner ── */}
        <AnimatePresence>
          {showResumeBanner && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-sm border border-white/20 text-white px-4 py-2 rounded-full text-sm font-medium z-20 pointer-events-none"
            >
              <RotateCcw className="w-3.5 h-3.5 text-primary" />
              Resuming from {formatTime(item?.watchedSeconds ?? ((item?.watchProgress ?? 0) / 100) * duration)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Controls Overlay ── */}
        <AnimatePresence>
          {showControls && !showEndOverlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col justify-between"
              onClick={e => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="bg-gradient-to-b from-black/70 to-transparent px-4 pt-4 pb-8 flex items-center gap-3">
                <button
                  onClick={() => fadeAndNavigate('/')}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-heading text-lg truncate">{item.title}</p>
                  <p className="text-white/60 text-xs">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
                </div>
                {/* Keyboard hint */}
                <div className="hidden lg:flex items-center gap-1 text-white/30 text-[10px] mr-2">
                  <kbd className="bg-white/10 px-1 rounded">Space</kbd> play ·
                  <kbd className="bg-white/10 px-1 rounded">←→</kbd> seek ·
                  <kbd className="bg-white/10 px-1 rounded">C</kbd> CC ·
                  <kbd className="bg-white/10 px-1 rounded">S</kbd> speed ·
                  <kbd className="bg-white/10 px-1 rounded">Tab</kbd> remote nav ·
                  <kbd className="bg-white/10 px-1 rounded">F</kbd> fullscreen
                </div>
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className={`p-2 rounded-full transition-colors ${showInfo ? 'bg-white/20' : 'hover:bg-white/10'}`}
                >
                  <Info className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Center play button */}
              <div className="flex items-center justify-center">
                <button
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  {playing
                    ? <Pause className="w-7 h-7 text-white fill-white" />
                    : <Play className="w-7 h-7 text-white fill-white ml-1" />
                  }
                </button>
              </div>

              {/* Bottom controls */}
              <div className="bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
                {/* Seek bar */}
                <div className="relative mb-3">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full"
                    style={{ width: duration > 0 ? `${(buffered / duration) * 100}%` : '0%' }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className={`w-full h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white ${tvFocus === 'seek' ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-transparent' : ''}`}
                    style={{
                      background: `linear-gradient(to right, ${playerAccent} ${duration > 0 ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) 0%)`,
                    }}
                  />
                </div>

                {/* tv-focus ring helper */}
                {(() => {
                  const tvRing = (ctrl: typeof tvFocus) =>
                    tvFocus === ctrl
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-black/60 scale-110'
                      : '';
                  return (
                    <div className="flex items-center justify-between">
                      {/* Left cluster */}
                      <div className="flex items-center gap-2">
                        {/* Play/Pause */}
                        <button
                          onClick={togglePlay}
                          className={`text-white hover:text-white/80 rounded transition-all ${tvRing('play')}`}
                        >
                          {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                        </button>

                        {/* ±10s buttons */}
                        <button
                          onClick={() => {
                            if (!videoRef.current) return;
                            videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
                            setSeekFlash('back'); setSeekFlashCount(10);
                            setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
                          }}
                          className={`text-white/70 hover:text-white rounded transition-all ${tvRing('rewind')}`}
                          title="Rewind 10s (←)"
                        >
                          <Rewind className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (!videoRef.current) return;
                            videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
                            setSeekFlash('forward'); setSeekFlashCount(10);
                            setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
                          }}
                          className={`text-white/70 hover:text-white rounded transition-all ${tvRing('forward')}`}
                          title="Forward 10s (→)"
                        >
                          <FastForward className="w-4 h-4" />
                        </button>

                        {/* Mute */}
                        <button
                          onClick={toggleMute}
                          className={`text-white hover:text-white/80 rounded transition-all ${tvRing('mute')}`}
                        >
                          {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>

                        {/* Volume slider */}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={muted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className={`w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white ${tvFocus === 'volume' ? 'ring-2 ring-white/60' : ''}`}
                        />

                        <span className="text-white/70 text-xs">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      </div>

                      {/* Right cluster */}
                      <div className="flex items-center gap-2">
                        {/* ── Playback Speed ── */}
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setShowSpeedMenu(prev => !prev); setShowCcMenu(false); }}
                            className={`text-xs font-medium px-2 py-1 rounded transition-all ${
                              playbackRate !== 1
                                ? 'text-primary bg-primary/20 border border-primary/40'
                                : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
                            } ${tvRing('speed')}`}
                            title="Playback speed (S or < >)"
                          >
                            {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                          </button>
                          <AnimatePresence>
                            {showSpeedMenu && (
                              <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.95 }}
                                transition={{ duration: 0.12 }}
                                className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm z-20 min-w-[80px]"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="px-3 py-1.5 border-b border-white/10">
                                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Speed</p>
                                </div>
                                {SPEED_OPTIONS.map(rate => (
                                  <button
                                    key={rate}
                                    onClick={() => changeSpeed(rate)}
                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-3 ${
                                      playbackRate === rate
                                        ? 'text-primary bg-primary/20'
                                        : 'text-white/80 hover:text-white hover:bg-white/10'
                                    }`}
                                  >
                                    <span>{rate === 1 ? 'Normal' : `${rate}×`}</span>
                                    {playbackRate === rate && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* ── Closed Captions ── */}
                        <div className="relative">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setShowCcMenu(prev => !prev);
                              setShowSpeedMenu(false);
                            }}
                            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-all ${
                              ccLang !== 'off'
                                ? 'text-primary bg-primary/20 border border-primary/40'
                                : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
                            } ${tvRing('cc')}`}
                            title="Closed captions (C to cycle)"
                          >
                            <Captions className="w-4 h-4" />
                            <span className="hidden sm:inline">
                              {ccLang === 'off' ? 'CC' : ccLang === 'en' ? 'EN' : 'ES'}
                            </span>
                          </button>
                          <AnimatePresence>
                            {showCcMenu && (
                              <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.95 }}
                                transition={{ duration: 0.12 }}
                                className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm z-20 min-w-[130px]"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="px-3 py-1.5 border-b border-white/10">
                                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Subtitles / CC</p>
                                </div>
                                {([
                                  { value: 'off', label: 'Off' },
                                  { value: 'en',  label: 'English' },
                                  { value: 'es',  label: 'Español' },
                                ] as const).map(opt => (
                                  <button
                                    key={opt.value}
                                    onClick={() => {
                                      setCcLang(opt.value);
                                      setShowCcMenu(false);
                                      showActionToast(opt.value === 'off' ? 'CC: Off' : opt.value === 'en' ? 'CC: English' : 'CC: Español');
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-3 ${
                                      ccLang === opt.value
                                        ? 'text-primary bg-primary/20'
                                        : 'text-white/80 hover:text-white hover:bg-white/10'
                                    }`}
                                  >
                                    <span>{opt.label}</span>
                                    {ccLang === opt.value && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Fullscreen */}
                        <button
                          onClick={toggleFullscreen}
                          className={`text-white hover:text-white/80 rounded transition-all ${tvRing('fullscreen')}`}
                        >
                          {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                        </button>

                        {/* Cast */}
                        {item?.filename && (
                          <div className={`rounded transition-all ${tvRing('cast')}`}>
                            <CastButton
                              streamUrl={`/api/stream/${item.filename}`}
                              title={item.title ?? 'HomeStream'}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Post-Watch End Overlay ── */}
        <AnimatePresence>
          {showEndOverlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-6 overflow-y-auto py-8"
              onClick={e => e.stopPropagation()}
            >
              {/* Finished title */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="text-white/50 text-xs font-medium uppercase tracking-widest">You finished</p>
                </div>
                <h2 className="text-2xl font-heading text-white">{item.title}</h2>
                <p className="text-white/40 text-sm">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
              </motion.div>

              {/* Up Next — autoplay card */}
              {nextItem && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="w-full max-w-md"
                >
                  <p className="text-white/40 text-xs uppercase tracking-widest text-center mb-3">
                    {autoplayCancelled ? 'Up Next' : `Playing next in ${autoplayCountdown}s`}
                  </p>
                  <div className="flex gap-4 items-center bg-white/5 rounded-xl p-3 border border-white/10">
                    {/* Poster with countdown ring */}
                    <div className="relative flex-shrink-0 w-16">
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/10">
                        {nextItem.poster ? (
                          <img
                            src={nextItem.poster}
                            alt={nextItem.title}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                          </div>
                        )}
                      </div>
                      {!autoplayCancelled && (
                        <div className="absolute -inset-1 flex items-center justify-center">
                          <CountdownRing seconds={autoplayCountdown} total={AUTOPLAY_SECONDS} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{nextItem.title}</p>
                      <p className="text-white/40 text-xs">{nextItem.year} · {nextItem.genre.slice(0, 1).join(', ')}</p>
                      {nextItem.imdbRating !== 'N/A' && (
                        <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {nextItem.imdbRating}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowEndOverlay(false); navigate(`/player/${nextItem.id}`); }}
                      className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
                    >
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </button>
                  </div>
                  {!autoplayCancelled && (
                    <button
                      onClick={() => {
                        setAutoplayCancelled(true);
                        clearInterval(autoplayTimerRef.current);
                      }}
                      className="mt-2 w-full text-center text-white/30 hover:text-white/60 text-xs transition-colors"
                    >
                      Cancel autoplay
                    </button>
                  )}
                </motion.div>
              )}

              {/* More suggestions */}
              {similarItems.slice(1, 4).length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="w-full max-w-md"
                >
                  <p className="text-white/30 text-xs uppercase tracking-widest text-center mb-2">Also recommended</p>
                  <div className="grid grid-cols-3 gap-2">
                    {similarItems.slice(1, 4).map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setShowEndOverlay(false); navigate(`/player/${m.id}`); }}
                        className="group text-left"
                      >
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-1 bg-white/10">
                          {m.poster ? (
                            <img
                              src={m.poster}
                              alt={m.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : null}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-6 h-6 text-white fill-white" />
                          </div>
                        </div>
                        <p className="text-white text-[11px] font-medium truncate">{m.title}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Resume watching row */}
              {resumeItems.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  className="w-full max-w-md"
                >
                  <p className="text-white/30 text-xs uppercase tracking-widest text-center mb-2">Continue watching</p>
                  <div className="flex flex-col gap-2">
                    {resumeItems.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setShowEndOverlay(false); navigate(`/player/${m.id}`); }}
                        className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-2 transition-colors text-left"
                      >
                        <img
                          src={m.poster}
                          alt={m.title}
                          className="w-10 aspect-[2/3] object-cover rounded flex-shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{m.title}</p>
                          <div className="mt-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${m.progress}%` }} />
                          </div>
                        </div>
                        <Play className="w-4 h-4 text-white/50 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Action buttons */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-3"
              >
                <button
                  onClick={() => {
                    setShowEndOverlay(false);
                    clearInterval(autoplayTimerRef.current);
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play();
                    }
                    watchCompleteTriggered.current = false;
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/50 text-sm transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Watch Again
                </button>
                <button
                  onClick={() => fadeAndNavigate('/')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary hover:bg-primary/80 text-white text-sm font-medium transition-colors"
                >
                  Back to Home
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Info Panel ── */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute top-0 right-0 bottom-0 w-72 bg-black/90 backdrop-blur-sm p-5 overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <img src={item.poster} alt={item.title} className="w-full aspect-[2/3] object-cover rounded-lg mb-4" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <h3 className="text-lg font-heading text-white mb-1">{item.title}</h3>
              <div className="flex items-center gap-2 mb-3 text-xs text-white/60">
                <span>{item.year}</span>
                {item.rated && item.rated !== 'N/A' && <span className="border border-white/30 px-1 rounded">{item.rated}</span>}
                {item.runtime && <span>{item.runtime}</span>}
              </div>
              {item.imdbRating !== 'N/A' && (
                <div className="flex items-center gap-1 mb-3">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="text-yellow-400 font-semibold text-sm">{item.imdbRating}/10</span>
                </div>
              )}
              <p className="text-xs text-white/70 leading-relaxed mb-3">{item.plot}</p>
              {item.director !== 'Unknown' && (
                <p className="text-xs text-white/50"><span className="text-white/70">Director:</span> {item.director}</p>
              )}
              {item.actors !== 'Unknown' && (
                <p className="text-xs text-white/50 mt-1"><span className="text-white/70">Cast:</span> {item.actors}</p>
              )}
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Keyboard Shortcuts</p>
                {[
                  ['Space / K', 'Play / Pause'],
                  ['← / →', 'Seek ±10s'],
                  ['↑ / ↓', 'Volume'],
                  ['M', 'Mute'],
                  ['F', 'Fullscreen'],
                  ['I', 'Toggle info'],
                  ['Esc', 'Close panels'],
                ].map(([key, label]) => (
                  <div key={key} className="flex justify-between text-xs mb-1">
                    <kbd className="text-white/40 bg-white/10 px-1.5 rounded font-mono">{key}</kbd>
                    <span className="text-white/30">{label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Below Player ── */}
      <div className="bg-background px-4 sm:px-6 lg:px-8 py-8 max-w-screen-2xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-6 mb-10">
          {/* Poster with onError fallback */}
          <div className="w-32 aspect-[2/3] rounded-lg overflow-hidden bg-card flex-shrink-0 hidden sm:block">
            {item.poster ? (
              <img
                src={item.poster}
                alt={item.title}
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-heading text-foreground mb-2">{item.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-muted-foreground">
              <span>{item.year}</span>
              {item.rated && item.rated !== 'N/A' && (
                <span className="border border-border px-1.5 py-0.5 rounded text-xs">{item.rated}</span>
              )}
              {item.runtime && <span>{item.runtime}</span>}
              {item.imdbRating !== 'N/A' && (
                <span className="flex items-center gap-1 text-accent">
                  <Star className="w-3.5 h-3.5 fill-accent" /> {item.imdbRating}/10 IMDb
                </span>
              )}
            </div>
            {/* Genre chips */}
            <div className="flex flex-wrap gap-1 mb-3">
              {item.genre.map(g => (
                <span key={g} className="bg-secondary text-foreground text-xs px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>

            {/* ── AI Enrichment section ── */}
            {item.enrichment ? (
              <div className="mb-4 space-y-2">
                {item.enrichment.whyWatch && (
                  <p className="text-sm text-primary font-medium italic">"{item.enrichment.whyWatch}"</p>
                )}
                {item.enrichment.mood.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Mood</span>
                    {item.enrichment.mood.map(m => (
                      <span key={m} className="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-full capitalize">{m}</span>
                    ))}
                  </div>
                )}
                {item.enrichment.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Tags</span>
                    {item.enrichment.tags.map(t => (
                      <span key={t} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}
                {item.enrichment.contentWarnings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Contains</span>
                    {item.enrichment.contentWarnings.map(w => (
                      <span key={w} className="bg-destructive/10 text-destructive border border-destructive/20 text-xs px-2 py-0.5 rounded-full">{w}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── No enrichment yet — offer to run it ── */
              <div className="mb-4">
                {enrichRunning ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Analysing with AI — this takes about 10–20 seconds…</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={runEnrichment}
                      className="inline-flex items-center gap-2 self-start bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Wand2 className="w-4 h-4" />
                      Run AI Analysis
                    </button>
                    {enrichError && (
                      <p className="text-xs text-destructive">{enrichError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Adds mood tags, themes, content warnings, and a personalised summary using Gemini.
                    </p>
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {item.enrichment?.aiSummary || item.plot}
            </p>
            {item.director !== 'Unknown' && (
              <p className="text-sm text-muted-foreground mt-2">
                <span className="text-foreground">Director:</span> {item.director}
              </p>
            )}
            {item.actors !== 'Unknown' && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="text-foreground">Cast:</span> {item.actors}
              </p>
            )}
          </div>
        </div>

        {/* ── More Like This ── */}
        {similarItems.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-heading text-foreground">More Like This</h2>
              <span className="text-xs text-muted-foreground ml-1">matched by genre, director &amp; cast</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {similarItems.map(m => {
                const watched = (continueWatching.find(c => c.id === m.id)?.progress ?? 0) >= 90;
                return (
                  <div key={m.id} className="relative">
                    {/* Dim overlay for already-watched */}
                    {watched && (
                      <div className="absolute inset-0 z-10 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-1 pointer-events-none">
                        <CheckCircle2 className="w-6 h-6 text-white/70" />
                        <span className="text-white/60 text-[10px] font-medium">Watched</span>
                      </div>
                    )}
                    <MediaCard item={m} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Ask AI Banner ── */}
        <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Want a smarter recommendation?</p>
            <p className="text-xs text-muted-foreground">Ask the AI assistant — it knows your whole library and can match by mood, tone, or theme.</p>
          </div>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('homestream:open-chat', {
                detail: { message: `I'm watching "${item.title}". What else in my library would I enjoy?` },
              }));
            }}
            className="flex-shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}
