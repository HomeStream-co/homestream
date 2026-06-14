/**
 * PlayerControlsOverlay — the full controls UI rendered over the video.
 *
 * Contains:
 *   - Top bar (back, title, from-beginning, keyboard hint, info toggle)
 *   - Centre play button
 *   - Bottom bar (seek bar + thumbnail, play/pause, ±10s, mute, volume,
 *     time, speed menu, audio menu, CC menu, fullscreen, PiP, shortcuts,
 *     Cast, Chromecast)
 *
 * PERFORMANCE
 * -----------
 * Wrapped in React.memo with a hand-written comparator that skips re-renders
 * when only refs or stable callbacks change.  The comparator checks every
 * prop that can legitimately change the rendered output; it ignores:
 *   - All React refs (seekBarRef, bufferedBarRef, etc.) — same object always
 *   - All stable callbacks (togglePlay, handleSeek, etc.) — from useCallback
 *   - All React setState dispatchers — stable by contract
 *
 * This means the overlay only re-renders when something the user can actually
 * SEE changes: playing state, menus, CC settings, volume, etc.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Captions, PictureInPicture2, Keyboard,
} from 'lucide-react';
import CastButton from '@/components/CastButton';
import ChromecastButton from '@/components/ChromecastButton';
import PlayerSeekBar from './PlayerSeekBar';
import type { AudioTrack, CastInfo, CcLang, TvControl } from '@/hooks/usePlayerState';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEED_OPTIONS = [3, 2, 1.5, 1.25, 1, 0.75, 0.5];

interface MediaItem {
  id: string;
  title: string;
  type?: string;
  year: string | number;
  genre: string[];
  filename?: string;
  poster?: string;
  watchedSeconds?: number;
  /** Set to true when the player is using HLS (transcoded) mode */
  usingHls?: boolean;
}

interface Props {
  item: MediaItem;
  // Playback state — only values that legitimately trigger re-renders
  playing: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  playbackRate: number;
  isPiP: boolean;
  // UI state
  showInfo: boolean;
  showSpeedMenu: boolean;
  showCcMenu: boolean;
  showAudioMenu: boolean;
  ccLang: CcLang;
  ccFontSize: 'small' | 'medium' | 'large';
  ccBgOpacity: 'none' | 'low' | 'medium' | 'high' | 'full';
  ccTextColor: 'white' | 'yellow' | 'cyan' | 'green' | 'magenta' | 'red' | 'blue';
  ccBgColor: 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan';
  audioTracks: AudioTrack[];
  activeAudioTrack: number;
  tvFocus: TvControl | null;
  playerAccent: string;
  // Seek hover thumbnail
  seekHover: { x: number; time: number; dataUrl: string } | null;
  seekBarRef: React.RefObject<HTMLInputElement | null>;
  thumbCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Refs for direct DOM updates (no React re-renders on time tick)
  currentTimeRef: React.MutableRefObject<number>;
  bufferedRef: React.MutableRefObject<number>;
  timeDisplayRef: React.MutableRefObject<HTMLSpanElement | null>;
  bufferedBarRef: React.MutableRefObject<HTMLDivElement | null>;
  // Refs for cast
  castButtonRef: React.MutableRefObject<(() => void) | null>;
  /** Imperative controls for an active Chromecast session (play/pause, stop, seek, volume) */
  castControlRef: React.MutableRefObject<{
    playPause: () => void;
    stop: () => void;
    seek: (position: number) => void;
    setVolume: (level: number) => void;
  } | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  // Callbacks
  togglePlay: () => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  togglePiP: () => void;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekHover: (e: React.MouseEvent<HTMLInputElement>) => void;
  changeSpeed: (rate: number) => void;
  setCcLang: (v: CcLang) => void;
  setCcFontSize: (v: 'small' | 'medium' | 'large') => void;
  setCcBgOpacity: (v: 'none' | 'low' | 'medium' | 'high' | 'full') => void;
  setCcTextColor: (v: 'white' | 'yellow' | 'cyan' | 'green' | 'magenta' | 'red' | 'blue') => void;
  setCcBgColor: (v: 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan') => void;
  setActiveAudioTrack: (i: number) => void;
  setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSpeedMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCcMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAudioMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
  setSeekHover: (v: null) => void;
  setSeekFlash: (v: 'forward' | 'back' | null) => void;
  setSeekFlashCount: (v: number) => void;
  setShowResumeBanner: (v: boolean) => void;
  resumeBannerTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  showActionToast: (msg: string) => void;
  fadeAndNavigate: (to: string) => void;
  setCastInfo: (v: CastInfo | null) => void;
  isScrubbingRef: React.MutableRefObject<boolean>;
}

function PlayerControlsOverlayInner({
  item, playing, duration, volume, muted, fullscreen,
  playbackRate, isPiP, showInfo, showSpeedMenu, showCcMenu,
  showAudioMenu, ccLang, ccFontSize, ccBgOpacity, ccTextColor, ccBgColor, audioTracks,
  activeAudioTrack, tvFocus, playerAccent, seekHover, seekBarRef,
  thumbCanvasRef, currentTimeRef, bufferedRef: _bufferedRef, timeDisplayRef, bufferedBarRef,
  castButtonRef, castControlRef, videoRef,
  togglePlay, toggleMute, toggleFullscreen, togglePiP,
  handleSeek, handleVolumeChange, handleSeekHover, changeSpeed,
  setCcLang, setCcFontSize, setCcBgOpacity, setCcTextColor, setCcBgColor, setActiveAudioTrack,
  setShowInfo, setShowSpeedMenu, setShowCcMenu, setShowAudioMenu,
  setShowShortcuts, setSeekHover, setSeekFlash, setSeekFlashCount,
  setShowResumeBanner, resumeBannerTimer, showActionToast, fadeAndNavigate,
  setCastInfo, isScrubbingRef,
}: Props) {
  const tvRing = (ctrl: TvControl | null) =>
    tvFocus === ctrl
      ? 'ring-2 ring-white ring-offset-1 ring-offset-black/60 scale-110'
      : '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 flex flex-col justify-between"
      onClick={e => e.stopPropagation()}
    >
      {/* ── Top bar ── */}
      <div className="bg-gradient-to-b from-black/70 to-transparent px-4 pt-4 pb-8 flex items-center gap-3">
        <button
          onClick={() => {
            // Navigate to the detail page (movie or show), not always home
            const backTo = item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`;
            fadeAndNavigate(backTo);
          }}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-heading text-lg truncate">{item.title}</p>
          <p className="text-white/60 text-xs">{item.year} · {(item.genre ?? []).slice(0, 2).join(', ')}</p>
        </div>

        {(item.watchedSeconds ?? 0) > 5 && (
          <button
            onClick={() => {
              if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); }
              setShowResumeBanner(false);
              clearTimeout(resumeBannerTimer.current);
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            From Beginning
          </button>
        )}

        <div className="hidden lg:flex items-center gap-1 text-white/30 text-[10px] mr-2">
          <kbd className="bg-white/10 px-1 rounded">Space</kbd> play ·
          <kbd className="bg-white/10 px-1 rounded">←→</kbd> seek ·
          <kbd className="bg-white/10 px-1 rounded">C</kbd> CC ·
          <kbd className="bg-white/10 px-1 rounded">S</kbd> speed ·
          <kbd className="bg-white/10 px-1 rounded">Tab</kbd> remote nav ·
          <kbd className="bg-white/10 px-1 rounded">F</kbd> fullscreen
        </div>
        <button
          onClick={() => setShowInfo(prev => !prev)}
          className={`p-2 rounded-full transition-colors ${showInfo ? 'bg-white/20' : 'hover:bg-white/10'}`}
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>

      {/* ── Centre play button ── */}
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

      {/* ── Bottom controls ── */}
      <div className="bg-gradient-to-t from-black/80 to-transparent px-2 sm:px-4 pb-safe pb-4 pt-8">
        {/* Seek bar */}
        <PlayerSeekBar
          duration={duration}
          playerAccent={playerAccent}
          tvFocused={tvFocus === 'seek'}
          seekHover={seekHover}
          seekBarRef={seekBarRef}
          bufferedBarRef={bufferedBarRef}
          thumbCanvasRef={thumbCanvasRef}
          isScrubbingRef={isScrubbingRef}
          handleSeek={handleSeek}
          handleSeekHover={handleSeekHover}
          setSeekHover={setSeekHover}
        />

        {/* Control row */}
        <div className="flex items-center justify-between gap-1">
          {/* Left cluster */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={togglePlay} className={`text-white hover:text-white/80 rounded transition-all ${tvRing('play')}`}>
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>
            <button onClick={toggleMute} className={`text-white hover:text-white/80 rounded transition-all ${tvRing('mute')}`}>
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className={`hidden sm:block w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white ${tvFocus === 'volume' ? 'ring-2 ring-white/60' : ''}`}
            />
            {/* Time display — updated via ref in onTimeUpdate, no React re-render */}
            <span ref={timeDisplayRef} className="text-white/70 text-[10px] sm:text-xs whitespace-nowrap font-mono">
              {formatTime(currentTimeRef.current)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Speed */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowSpeedMenu(prev => !prev); setShowCcMenu(false); }}
                className={`text-xs font-bold px-2 py-1 rounded transition-all ${
                  playbackRate !== 1
                    ? 'text-black bg-primary border border-primary'
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
                            ? 'bg-primary text-black font-bold'
                            : 'text-white/80 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span>{rate === 1 ? '1×  Normal' : `${rate}×`}</span>
                        {playbackRate === rate && <div className="w-1.5 h-1.5 rounded-full bg-black flex-shrink-0" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Audio track switcher */}
            {audioTracks.length > 1 && (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowAudioMenu(prev => !prev); setShowSpeedMenu(false); setShowCcMenu(false); }}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-all text-white/70 hover:text-white bg-white/10 hover:bg-white/20"
                  title="Audio track"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className="hidden sm:inline uppercase text-[10px] font-bold tracking-wide">
                    {audioTracks[activeAudioTrack]?.language?.slice(0, 3).toUpperCase() ?? 'AUD'}
                  </span>
                </button>
                <AnimatePresence>
                  {showAudioMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm z-20 min-w-[180px]"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-3 py-1.5 border-b border-white/10">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Audio Track</p>
                      </div>
                      {audioTracks.map((track, i) => (
                        <button
                          key={track.index}
                          onClick={() => {
                            setActiveAudioTrack(i);
                            setShowAudioMenu(false);
                            const video = videoRef.current;
                            if (video) {
                              const tracks = (video as HTMLVideoElement & { audioTracks?: { [k: number]: { enabled: boolean } } }).audioTracks;
                              if (tracks) for (let j = 0; j < audioTracks.length; j++) tracks[j].enabled = j === i;
                            }
                            showActionToast(`Audio: ${track.label}`);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-3 ${
                            activeAudioTrack === i ? 'bg-primary text-black font-bold' : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div>
                            <span className="block">{track.label}</span>
                            <span className="text-[10px] text-white/40 uppercase">{track.codec} · {track.channels}ch</span>
                          </div>
                          {activeAudioTrack === i && <div className="w-1.5 h-1.5 rounded-full bg-black flex-shrink-0" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* CC */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowCcMenu(prev => !prev); setShowSpeedMenu(false); }}
                className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition-all ${
                  ccLang !== 'off'
                    ? 'text-black bg-primary border border-primary'
                    : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
                } ${tvRing('cc')}`}
                title="Closed captions (C to cycle)"
              >
                <Captions className="w-4 h-4" />
                <span className="hidden sm:inline">{ccLang === 'off' ? 'CC' : ccLang === 'en' ? 'EN' : 'ES'}</span>
              </button>
              <AnimatePresence>
                {showCcMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full right-0 mb-2 bg-black/95 border border-white/20 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm z-20 min-w-[200px]"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3 py-1.5 border-b border-white/10">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Subtitles / CC</p>
                    </div>
                    {([{ value: 'off', label: 'Off' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setCcLang(opt.value); setShowCcMenu(false); showActionToast(opt.value === 'off' ? 'CC: Off' : opt.value === 'en' ? 'CC: English' : 'CC: Español'); }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-3 ${ccLang === opt.value ? 'bg-primary text-black font-bold' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                      >
                        <span>{opt.label}</span>
                        {ccLang === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-black flex-shrink-0" />}
                      </button>
                    ))}
                    {/* CC Styling */}
                    <div className="border-t border-white/10 px-3 py-2 space-y-2.5">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">Style Settings</p>
                      
                      {/* Font Size */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/50">Size</span>
                        <div className="flex gap-1">
                          {(['small', 'medium', 'large'] as const).map(s => (
                            <button key={s} onClick={() => setCcFontSize(s)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${ccFontSize === s ? 'bg-primary text-black' : 'text-white/40 hover:text-white/70'}`}>
                              {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text Color */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-white/50">Text Color</span>
                          <span className="text-[9px] text-primary/80 font-bold capitalize">{ccTextColor}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {(['white', 'yellow', 'cyan', 'green', 'magenta', 'red', 'blue'] as const).map(color => (
                            <button
                              key={color}
                              onClick={() => setCcTextColor(color)}
                              className={`w-4 h-4 rounded-full border transition-all ${
                                ccTextColor === color ? 'border-primary scale-110 ring-1 ring-primary/40' : 'border-white/20 hover:border-white/50'
                              }`}
                              style={{ backgroundColor: color === 'blue' ? '#3b82f6' : color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Background Color */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-white/50">BG Color</span>
                          <span className="text-[9px] text-primary/80 font-bold capitalize">{ccBgColor}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {(['black', 'white', 'red', 'green', 'blue', 'yellow', 'magenta', 'cyan'] as const).map(color => (
                            <button
                              key={color}
                              onClick={() => setCcBgColor(color)}
                              className={`w-4 h-4 rounded-full border transition-all ${
                                ccBgColor === color ? 'border-primary scale-110 ring-1 ring-primary/40' : 'border-white/20 hover:border-white/50'
                              }`}
                              style={{ backgroundColor: color === 'blue' ? '#3b82f6' : color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Background Opacity */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/50">BG Opacity</span>
                        <div className="flex gap-1">
                          {(['none', 'low', 'medium', 'high', 'full'] as const).map(b => (
                            <button key={b} onClick={() => setCcBgOpacity(b)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${ccBgOpacity === b ? 'bg-primary text-black' : 'text-white/40 hover:text-white/70'}`}>
                              {b === 'none' ? '0%' : b === 'low' ? '35%' : b === 'medium' ? '60%' : b === 'high' ? '85%' : '100%'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className={`text-white hover:text-white/80 rounded transition-all ${tvRing('fullscreen')}`}>
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>

            {/* PiP */}
            {'pictureInPictureEnabled' in document && (
              <button
                onClick={e => { e.stopPropagation(); togglePiP(); }}
                className={`hidden sm:block rounded transition-all ${isPiP ? 'text-primary bg-primary/20 p-1' : 'text-white/70 hover:text-white'}`}
                title={isPiP ? 'Exit Picture-in-Picture (P)' : 'Picture-in-Picture (P)'}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            {/* Shortcuts help */}
            <button
              onClick={e => { e.stopPropagation(); setShowShortcuts(prev => !prev); }}
              className="hidden sm:block text-white/50 hover:text-white/80 rounded transition-all"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* DLNA Cast */}
            {item.filename && (
              <div className={`rounded transition-all ${tvRing('cast')}`}>
                <CastButton
                  streamUrl={`/api/stream/${item.filename}`}
                  hlsUrl={item.usingHls ? `/api/hls/${item.id}/index.m3u8` : undefined}
                  title={item.title}
                />
              </div>
            )}

            {/* Chromecast */}
            {item.filename && (
              <div className="relative">
                <ChromecastButton
                  streamUrl={`/api/stream/${item.filename}`}
                  title={item.title}
                  poster={item.poster}
                  currentTime={currentTimeRef.current}
                  onTriggerRef={(fn) => { castButtonRef.current = fn; }}
                  onControlRef={(ctrl) => { castControlRef.current = ctrl; }}
                  onCastStateChange={(info) => setCastInfo(info.active ? info : null)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Memo comparator ───────────────────────────────────────────────────────────
//
// Only re-render when a prop that affects the rendered output changes.
//
// SKIPPED (always stable — same object reference across renders):
//   Refs:      seekBarRef, thumbCanvasRef, currentTimeRef, bufferedRef,
//              timeDisplayRef, bufferedBarRef, castButtonRef, castControlRef,
//              videoRef, resumeBannerTimer
//   Callbacks: togglePlay, toggleMute, toggleFullscreen, togglePiP,
//              handleSeek, handleVolumeChange, handleSeekHover, changeSpeed,
//              fadeAndNavigate, showActionToast
//   Setters:   all set* dispatchers (stable by React contract)
//
// COMPARED (can change and affect visible output):
//   item       — by id + usingHls (spread creates new object every render)
//   playing, duration, volume, muted, fullscreen, playbackRate, isPiP
//   showInfo, showSpeedMenu, showCcMenu, showAudioMenu
//   ccLang, ccFontSize, ccBgOpacity
//   audioTracks — by reference (only changes when tracks are fetched)
//   activeAudioTrack, tvFocus, playerAccent, seekHover

function arePropsEqual(prev: Props, next: Props): boolean {
  // item — compare by identity fields only (spread creates new obj every render)
  if (prev.item.id       !== next.item.id)       return false;
  if (prev.item.usingHls !== next.item.usingHls) return false;

  // Playback state
  if (prev.playing      !== next.playing)      return false;
  if (prev.duration     !== next.duration)     return false;
  if (prev.volume       !== next.volume)       return false;
  if (prev.muted        !== next.muted)        return false;
  if (prev.fullscreen   !== next.fullscreen)   return false;
  if (prev.playbackRate !== next.playbackRate) return false;
  if (prev.isPiP        !== next.isPiP)        return false;

  // UI menus / panels
  if (prev.showInfo      !== next.showInfo)      return false;
  if (prev.showSpeedMenu !== next.showSpeedMenu) return false;
  if (prev.showCcMenu    !== next.showCcMenu)    return false;
  if (prev.showAudioMenu !== next.showAudioMenu) return false;

  // CC settings
  if (prev.ccLang      !== next.ccLang)      return false;
  if (prev.ccFontSize  !== next.ccFontSize)  return false;
  if (prev.ccBgOpacity !== next.ccBgOpacity) return false;
  if (prev.ccTextColor !== next.ccTextColor) return false;
  if (prev.ccBgColor   !== next.ccBgColor)   return false;

  // Audio tracks — reference equality (array only replaced on fetch)
  if (prev.audioTracks      !== next.audioTracks)      return false;
  if (prev.activeAudioTrack !== next.activeAudioTrack) return false;

  // TV D-pad focus
  if (prev.tvFocus !== next.tvFocus) return false;

  // Accent colour (changes when theme switches)
  if (prev.playerAccent !== next.playerAccent) return false;

  // Seek hover thumbnail (null | object — compare by reference)
  if (prev.seekHover !== next.seekHover) return false;

  return true;
}

const PlayerControlsOverlay = memo(PlayerControlsOverlayInner, arePropsEqual);
export default PlayerControlsOverlay;
