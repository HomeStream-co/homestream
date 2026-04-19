import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize, Info, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import MediaCard from '@/components/MediaCard';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { library, updateProgress } = useMedia();
  const item = library.find(m => m.id === id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // Save progress every 10 seconds
  useEffect(() => {
    if (!id || currentTime === 0) return;
    const interval = setInterval(() => {
      if (duration > 0) {
        updateProgress(id, (currentTime / duration) * 100);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [id, currentTime, duration, updateProgress]);

  // Auto-hide controls
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

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  const similarItems = library
    .filter(m => m.id !== item.id && m.genre.some(g => item.genre.includes(g)))
    .slice(0, 6);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
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
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <title>{item.title} — HomeStream</title>

      {/* Video Container */}
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
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              // Update buffered
              const buf = videoRef.current.buffered;
              if (buf.length > 0) setBuffered(buf.end(buf.length - 1));
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) setDuration(videoRef.current.duration);
          }}
          onVolumeChange={() => {
            if (videoRef.current) {
              setVolume(videoRef.current.volume);
              setMuted(videoRef.current.muted);
            }
          }}
        />

        {/* Controls Overlay */}
        <AnimatePresence>
          {showControls && (
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
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-heading text-lg truncate">{item.title}</p>
                  <p className="text-white/60 text-xs">{item.year} · {item.genre.slice(0, 2).join(', ')}</p>
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
                  {/* Buffered */}
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

        {/* Info Panel */}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Below Player */}
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

        {/* More Like This */}
        {similarItems.length > 0 && (
          <div>
            <h2 className="text-xl font-heading text-foreground mb-4">More Like This</h2>
            <div className="flex gap-3 flex-wrap">
              {similarItems.map(m => (
                <MediaCard key={m.id} item={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
