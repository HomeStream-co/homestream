import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Info, Star, RotateCcw, Sparkles, MessageCircle, SkipForward,
  CheckCircle2, FastForward, Rewind,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import MediaCard from '@/components/MediaCard';

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
  const item = library.find(m => m.id === id);

  // ── Refs ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const watchCompleteTriggered = useRef(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

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
  // Loading state — true until canplaythrough fires (enough buffered to play without stall)
  const [videoLoading, setVideoLoading] = useState(true);
  const resumeApplied = useRef(false);

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

  const nextItem = similarItems[0] ?? null;

  // ── Save progress every 10s ──
  useEffect(() => {
    if (!id || currentTime === 0) return;
    const interval = setInterval(() => {
      if (duration > 0) updateProgress(id, (currentTime / duration) * 100);
    }, 10000);
    return () => clearInterval(interval);
  }, [id, currentTime, duration, updateProgress]);

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
    if (!showEndOverlay || autoplayCancelled || !nextItem) return;
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
  }, [showEndOverlay, autoplayCancelled, nextItem, navigate]);

  // ── Skip Intro visibility ──
  useEffect(() => {
    setShowSkipIntro(currentTime > 30 && currentTime < SKIP_INTRO_END && playing);
  }, [currentTime, playing]);

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

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) video.play(); else video.pause();
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          video.currentTime = Math.min(video.currentTime + 10, video.duration);
          setSeekFlash('forward');
          setTimeout(() => setSeekFlash(null), 600);
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          video.currentTime = Math.max(video.currentTime - 10, 0);
          setSeekFlash('back');
          setTimeout(() => setSeekFlash(null), 600);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(video.volume + 0.1, 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(video.volume - 0.1, 0);
          break;
        case 'm':
        case 'M':
          video.muted = !video.muted;
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
          else document.exitFullscreen();
          break;
        case 'i':
        case 'I':
          setShowInfo(prev => !prev);
          break;
        case 'Escape':
          setShowEndOverlay(false);
          setShowInfo(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          onPause={() => setPlaying(false)}
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
            // Restore resume position exactly once, as soon as we know duration
            if (!resumeApplied.current && item.watchProgress && item.watchProgress > 2 && item.watchProgress < 95) {
              const resumeAt = (item.watchProgress / 100) * video.duration;
              video.currentTime = resumeAt;
              resumeApplied.current = true;
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
        />

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
              key={seekFlash}
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
              <span className="text-white text-xs font-medium">
                {seekFlash === 'forward' ? '+10s' : '-10s'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Skip Intro Button ── */}
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
                  <kbd className="bg-white/10 px-1 rounded">F</kbd> fullscreen ·
                  <kbd className="bg-white/10 px-1 rounded">M</kbd> mute
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
                    className="w-full h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    style={{
                      background: `linear-gradient(to right, hsl(var(--primary)) ${duration > 0 ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) 0%)`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlay} className="text-white hover:text-white/80">
                      {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                    </button>
                    <button onClick={toggleMute} className="text-white hover:text-white/80">
                      {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                    <span className="text-white/70 text-xs">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                  <button onClick={toggleFullscreen} className="text-white hover:text-white/80">
                    {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
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
                      <div className="aspect-[2/3] rounded-lg overflow-hidden">
                        <img
                          src={nextItem.poster}
                          alt={nextItem.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
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
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-1">
                          <img
                            src={m.poster}
                            alt={m.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
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
              <img src={item.poster} alt={item.title} className="w-full aspect-[2/3] object-cover rounded-lg mb-4" />
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
          <img src={item.poster} alt={item.title} className="w-32 aspect-[2/3] object-cover rounded-lg flex-shrink-0 hidden sm:block" />
          <div>
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
            <div className="flex flex-wrap gap-1 mb-3">
              {item.genre.map(g => (
                <span key={g} className="bg-secondary text-foreground text-xs px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{item.plot}</p>
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
