/**
 * PlayerControlsOverlay — the full controls UI rendered over the video.
 *
 * Contains:
 *   - Top bar (back, title, from-beginning, keyboard hint, info toggle)
 *   - Centre play button
 *   - Bottom bar (seek bar + thumbnail, play/pause, ±10s, mute, volume,
 *     time, speed menu, audio menu, CC menu, fullscreen, PiP, shortcuts,
 *     Cast, Chromecast)
 */

import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Captions, PictureInPicture2, Keyboard, FastForward, Rewind,
} from 'lucide-react';
import CastButton from '@/components/CastButton';
import ChromecastButton from '@/components/ChromecastButton';
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
}

interface Props {
  item: MediaItem;
  // Playback state
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  buffered: number;
  playbackRate: number;
  isPiP: boolean;
  // UI state
  showInfo: boolean;
  showSpeedMenu: boolean;
  showCcMenu: boolean;
  showAudioMenu: boolean;
  ccLang: CcLang;
  ccFontSize: 'small' | 'medium' | 'large';
  ccBgOpacity: 'none' | 'low' | 'high';
  audioTracks: AudioTrack[];
  activeAudioTrack: number;
  tvFocus: TvControl | null;
  playerAccent: string;
  // Seek hover thumbnail
  seekHover: { x: number; time: number; dataUrl: string } | null;
  seekBarRef: React.RefObject<HTMLInputElement | null>;
  thumbCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Refs for cast
  castButtonRef: React.MutableRefObject<(() => void) | null>;
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
  setCcBgOpacity: (v: 'none' | 'low' | 'high') => void;
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
}

export default function PlayerControlsOverlay({
  item, playing, currentTime, duration, volume, muted, fullscreen,
  buffered, playbackRate, isPiP, showInfo, showSpeedMenu, showCcMenu,
  showAudioMenu, ccLang, ccFontSize, ccBgOpacity, audioTracks,
  activeAudioTrack, tvFocus, playerAccent, seekHover, seekBarRef,
  thumbCanvasRef, castButtonRef, videoRef,
  togglePlay, toggleMute, toggleFullscreen, togglePiP,
  handleSeek, handleVolumeChange, handleSeekHover, changeSpeed,
  setCcLang, setCcFontSize, setCcBgOpacity, setActiveAudioTrack,
  setShowInfo, setShowSpeedMenu, setShowCcMenu, setShowAudioMenu,
  setShowShortcuts, setSeekHover, setSeekFlash, setSeekFlashCount,
  setShowResumeBanner, resumeBannerTimer, showActionToast, fadeAndNavigate,
  setCastInfo,
}: Props) {
  const tvRing = (ctrl: TvControl | null) =>
    tvFocus === ctrl
      ? 'ring-2 ring-white ring-offset-1 ring-offset-black/60 scale-110'
      : '';

  const flashSeek = (dir: 'forward' | 'back') => {
    setSeekFlash(dir);
    setSeekFlashCount(10);
    setTimeout(() => { setSeekFlash(null); setSeekFlashCount(0); }, 600);
  };

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
          <p className="text-white/60 text-xs">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
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
        <div className="relative mb-3">
          {seekHover && (
            <div
              className="absolute bottom-full mb-3 pointer-events-none z-10"
              style={{ left: Math.max(80, Math.min(seekHover.x, (seekBarRef.current?.offsetWidth ?? 400) - 80)), transform: 'translateX(-50%)' }}
            >
              <div className="bg-black/90 rounded-lg overflow-hidden border border-white/20 shadow-xl">
                <img src={seekHover.dataUrl} alt="" className="w-40 h-[90px] object-cover block" />
                <p className="text-white/70 text-[10px] text-center py-1 font-mono">{formatTime(seekHover.time)}</p>
              </div>
            </div>
          )}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full opacity-40"
            style={{ width: duration > 0 ? `${(buffered / duration) * 100}%` : '0%', background: playerAccent }}
          />
          <input
            ref={seekBarRef}
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            onMouseMove={handleSeekHover}
            onMouseLeave={() => setSeekHover(null)}
            className={`w-full h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary ${tvFocus === 'seek' ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-transparent' : ''}`}
            style={{ background: `linear-gradient(to right, ${playerAccent} ${duration > 0 ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) 0%)` }}
          />
          <canvas ref={thumbCanvasRef} className="hidden" />
        </div>

        {/* Control row */}
        <div className="flex items-center justify-between gap-1">
          {/* Left cluster */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={togglePlay} className={`text-white hover:text-white/80 rounded transition-all ${tvRing('play')}`}>
              {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>
            <button
              onClick={() => {
                if (!videoRef.current) return;
                videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
                flashSeek('back');
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
                flashSeek('forward');
              }}
              className={`text-white/70 hover:text-white rounded transition-all ${tvRing('forward')}`}
              title="Forward 10s (→)"
            >
              <FastForward className="w-4 h-4" />
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
            <span className="text-white/70 text-[10px] sm:text-xs whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Speed */}
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
                          playbackRate === rate ? 'bg-primary/20 font-semibold' : 'text-white/80 hover:text-white hover:bg-white/10'
                        }`}
                        style={playbackRate === rate ? { color: 'hsl(var(--primary))' } : undefined}
                      >
                        <span>{rate === 1 ? '1×  Normal' : `${rate}×`}</span>
                        {playbackRate === rate && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'hsl(var(--primary))' }} />}
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
                            activeAudioTrack === i ? 'text-primary bg-primary/20' : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div>
                            <span className="block">{track.label}</span>
                            <span className="text-[10px] text-white/40 uppercase">{track.codec} · {track.channels}ch</span>
                          </div>
                          {activeAudioTrack === i && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
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
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-all ${
                  ccLang !== 'off'
                    ? 'text-primary bg-primary/20 border border-primary/40'
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
                    className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm z-20 min-w-[130px]"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3 py-1.5 border-b border-white/10">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Subtitles / CC</p>
                    </div>
                    {([{ value: 'off', label: 'Off' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setCcLang(opt.value); setShowCcMenu(false); showActionToast(opt.value === 'off' ? 'CC: Off' : opt.value === 'en' ? 'CC: English' : 'CC: Español'); }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-3 ${ccLang === opt.value ? 'text-primary bg-primary/20' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                      >
                        <span>{opt.label}</span>
                        {ccLang === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                      </button>
                    ))}
                    {/* CC Styling */}
                    <div className="border-t border-white/10 px-3 py-2">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Style</p>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-white/50">Size</span>
                        <div className="flex gap-1">
                          {(['small', 'medium', 'large'] as const).map(s => (
                            <button key={s} onClick={() => setCcFontSize(s)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${ccFontSize === s ? 'bg-primary/30 text-primary' : 'text-white/40 hover:text-white/70'}`}>
                              {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/50">Background</span>
                        <div className="flex gap-1">
                          {(['none', 'low', 'high'] as const).map(b => (
                            <button key={b} onClick={() => setCcBgOpacity(b)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${ccBgOpacity === b ? 'bg-primary/30 text-primary' : 'text-white/40 hover:text-white/70'}`}>
                              {b === 'none' ? 'Off' : b === 'low' ? '50%' : '85%'}
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
                <CastButton streamUrl={`/api/stream/${item.filename}`} title={item.title} />
              </div>
            )}

            {/* Chromecast */}
            {item.filename && (
              <div className="relative">
                <ChromecastButton
                  streamUrl={`/api/stream/${item.filename}`}
                  title={item.title}
                  poster={item.poster}
                  currentTime={currentTime}
                  onTriggerRef={(fn) => { castButtonRef.current = fn; }}
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
